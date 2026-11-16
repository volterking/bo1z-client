import { instructions, parse } from './wasm.ts';

// Derive layout from the exact binary being built; never guess an address in a
// different engine. The display/runtime patches do not relocate data segments.
export function engineLayout(original: Uint8Array) {
  const module = parse(original);
  const body = (name: string) => {
    const index = module.names.get(name);
    if (index === undefined) throw new Error(`Missing engine layout function: ${name}`);
    const b = module.bodies[index - module.importedFuncs];
    return [...instructions(module.bytes, b.code, b.end)];
  };
  const sbrk = body('sbrk');
  const loads = sbrk.filter((ins, k) => ins.op === 0xfe && ins.sub === 16 && ins.offset === 0 && sbrk[k - 1]?.op === 0x41);
  if (loads.length !== 1) throw new Error('Unexpected sbrk atomic break layout');
  const address = sbrk[sbrk.indexOf(loads[0]) - 1].value!;
  const updates = sbrk.filter(ins => ins.op === 0xfe && ins.sub === 72 && ins.offset === address);
  if (!Number.isSafeInteger(address) || address <= 0 || address % 4 || updates.length !== 1) throw new Error('Unverified sbrk break address');

  // These page-facing getters must remain bounded reads, with no hidden native
  // locks, calls or loops after an engine upgrade.
  for (const name of ['KB_EngineAllocStats', 'KB_WebResourceStats', 'KB_AudioDropped', 'KB_UIState', 'KB_PresentRing', 'KB_AudioRing']) {
    if (body(name).some(ins => [0x03, 0x10, 0x11, 0x12, 0x13].includes(ins.op) || (ins.op === 0xfe && [1, 2].includes(ins.sub!)))) {
      throw new Error(`Page getter may block: ${name}`);
    }
  }
  return { heapBreakAddress: address };
}
