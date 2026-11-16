import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { memoryReader } from '../client/game/memory.ts';
import { engineLayout } from '../patch/layout.ts';
import { instructions, leb, parse, rebuild, sleb } from '../patch/wasm.ts';

test('memory polling does not enter the mutex-backed native statistics, even while those are unavailable', () => {
  const buffer = new SharedArrayBuffer(4096);
  const trap = () => { throw new Error('A native mutex would block the page'); };
  const source = {
    HEAPF32: new Float32Array(buffer),
    _KB_MemoryStats: trap, _KB_VirtualMemoryStats: trap, _KB_AudioMemoryStats: trap,
    _KB_EngineAllocStats: (which: number) => [100, 200, 300][which],
    _KB_WebResourceStats: (which: number) => [400, 500, 6, 0, 0, 0, 7][which],
  };
  const slot = new Uint32Array(buffer, 64, 1), read = memoryReader(source, 64);
  assert.equal(read().wasmBreak, null);
  Atomics.store(slot, 0, 1024);
  const stats = read();
  assert.equal(stats.wasmBreak, 1024);
  assert.equal(stats.wasmUnclaimedBytes, 3072);
  assert.equal(stats.engineZBytes, 100);
  assert.equal(stats.liveTextures, 6);
  assert.equal(stats.audioCachedPCMBytes, null);
  Atomics.store(slot, 0, 2048);
  assert.equal(read().wasmBreak, 2048);
});

test('engine layout is derived from matching sbrk atomic loads and updates; a blocking getter fails the build', () => {
  const bytes = readFileSync(new URL('../engine/KisakBlack-web.wasm', import.meta.url));
  const layout = engineLayout(bytes);
  assert.ok(layout.heapBreakAddress > 0 && layout.heapBreakAddress % 4 === 0);
  const module = parse(bytes);
  const index = module.names.get('KB_WebResourceStats')!;
  const b = module.bodies[index - module.importedFuncs];
  // Add a call into the native allocator-statistics getter. Such an engine
  // update must not silently make the page's polling unsafe again.
  const callee = module.names.get('KB_MemoryStats')!;
  const changed = rebuild(module, { edits: new Map([[index, [{ at: b.code, end: b.code, bytes: [0x41, 3, 0x10, ...leb(callee), 0x1a] }]]]) });
  assert.throws(() => engineLayout(changed), /Page getter may block: KB_WebResourceStats/);
  const sbrkIndex = module.names.get('sbrk')!;
  const sbrkBody = module.bodies[sbrkIndex - module.importedFuncs];
  const list = [...instructions(module.bytes, sbrkBody.code, sbrkBody.end)];
  const pointer = list.find((ins, k) => ins.op === 0x41 && list[k + 1]?.op === 0xfe && list[k + 1].sub === 16)!;
  const wrongSlot = rebuild(module, { edits: new Map([[sbrkIndex, [{ at: pointer.at, end: pointer.end, bytes: [0x41, ...sleb(pointer.value! + 4)] }]]]) });
  assert.throws(() => engineLayout(wrongSlot), /Unverified sbrk break address/);
});
