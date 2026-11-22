// Experimental lower Wasm shared-memory import minimum for Xbox Edge.
// The original Emscripten binary imports a fixed ~2 GiB memory. Changing only
// INITIAL_MEMORY in the JS glue cannot satisfy the original Wasm import limits.
//
// Change imported memory min to 512 MiB and retain max at its original value,
// allowing desktop JS to keep using the original allocation. On Xbox, JS
// supplies min=max=512 MiB, so it cannot reserve a larger linear memory.
// This does NOT relocate static data or alter engine heap allocations:
// the engine can still fail or run out of memory at runtime.
const PAGE = 65536;
const MIN_PAGES = (512 * 1024 * 1024) / PAGE;

function readU32(bytes: Uint8Array, position: number) {
  let value = 0;
  let shift = 0;
  let at = position;
  for (let i = 0; i < 5; i++) {
    if (at >= bytes.length) throw new Error('Truncated wasm LEB128');
    const b = bytes[at++];
    value += (b & 127) * (2 ** shift);
    if (!(b & 128)) {
      if (value > 0xffffffff) throw new Error('Invalid wasm u32');
      return { value, at };
    }
    shift += 7;
  }
  throw new Error('Invalid wasm LEB128 length');
}
function u32(value: number) {
  const result: number[] = [];
  do {
    let b = value & 127;
    value = Math.floor(value / 128);
    if (value) b |= 128;
    result.push(b);
  } while (value);
  return result;
}
function skipName(bytes: Uint8Array, at: number) {
  const len = readU32(bytes, at);
  if (len.at + len.value > bytes.length) throw new Error('Truncated wasm name');
  return len.at + len.value;
}
function skipLimits(bytes: Uint8Array, at: number) {
  const flags = readU32(bytes, at);
  if (flags.value & ~3) throw new Error('Unsupported wasm table limits');
  let next = readU32(bytes, flags.at).at;
  if (flags.value & 1) next = readU32(bytes, next).at;
  return next;
}

export function patchXboxMemoryLimit(wasm: Uint8Array): Uint8Array {
  if (wasm[0] !== 0 || wasm[1] !== 97 || wasm[2] !== 115 || wasm[3] !== 109) throw new Error('Not wasm');
  let at = 8, found = 0;
  const chunks: Uint8Array[] = [wasm.subarray(0, 8)];
  while (at < wasm.length) {
    const header = at;
    const id = wasm[at++];
    const length = readU32(wasm, at);
    const start = length.at, end = start + length.value;
    if (end > wasm.length) throw new Error('Truncated wasm section');
    if (id !== 2) {
      chunks.push(wasm.subarray(header, end));
      at = end;
      continue;
    }
    const count = readU32(wasm, start);
    const parts: number[] = [...u32(count.value)];
    let cursor = count.at;
    for (let i = 0; i < count.value; i++) {
      const entryStart = cursor;
      cursor = skipName(wasm, cursor);
      cursor = skipName(wasm, cursor);
      const kind = wasm[cursor++];
      if (kind === 0) cursor = readU32(wasm, cursor).at; // function
      else if (kind === 1) { // table
        cursor++; // reftype (funcref)
        cursor = skipLimits(wasm, cursor);
      } else if (kind === 2) { // shared linear memory
        const limitStart = cursor;
        const flags = readU32(wasm, cursor);
        if (flags.value !== 3) throw new Error('Expected shared memory with explicit maximum');
        const minimum = readU32(wasm, flags.at);
        const maximum = readU32(wasm, minimum.at);
        cursor = maximum.at;
        if (minimum.value < MIN_PAGES || maximum.value < MIN_PAGES)
          throw new Error('Unexpected existing wasm memory limits');
        parts.push(...wasm.subarray(entryStart, limitStart),
          ...u32(flags.value), ...u32(MIN_PAGES), ...u32(maximum.value));
        found++;
        continue;
      } else if (kind === 3) cursor += 2; // global
      else if (kind === 4) { cursor++; cursor = readU32(wasm, cursor).at; } // tag
      else throw new Error('Unknown wasm import kind: ' + kind);
      parts.push(...wasm.subarray(entryStart, cursor));
    }
    if (cursor !== end) throw new Error('Unexpected data in wasm import section');
    chunks.push(Uint8Array.from([2, ...u32(parts.length), ...parts]));
    at = end;
  }
  if (found !== 1) throw new Error('Expected exactly one imported shared memory, found ' + found);
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  if (!WebAssembly.validate(result)) throw new Error('Patched wasm did not validate');
  return result;
}
