export type MemorySource = {
  HEAPF32: Float32Array<SharedArrayBuffer>;
  _KB_EngineAllocStats(which: number): number;
  _KB_WebResourceStats(which: number): number;
};

// KB_MemoryStats performs a heap walk under the allocator mutex even for its
// break selector. Virtual/audio statistics also take native locks. Calling any
// of them on the page can freeze the UI behind a loading/failed engine thread.
// Read the verified shared break slot and bounded atomic counters instead.
export function memoryReader(module: MemorySource, heapBreakAddress: number) {
  const buffer = module.HEAPF32.buffer;
  const brk = new Uint32Array(buffer, heapBreakAddress, 1);
  return () => {
    const wasmBytes = buffer.byteLength, value = Atomics.load(brk, 0);
    const wasmBreak = value > 0 && value <= wasmBytes ? value : null;
    return {
      wasmBytes, wasmBreak, wasmUnclaimedBytes: wasmBreak === null ? null : wasmBytes - wasmBreak,
      engineZBytes: module._KB_EngineAllocStats(0), engineHunkUsed: module._KB_EngineAllocStats(1), enginePMemUsed: module._KB_EngineAllocStats(2),
      textureStagingBytes: module._KB_WebResourceStats(0), bufferStagingBytes: module._KB_WebResourceStats(1),
      liveTextures: module._KB_WebResourceStats(2), programCount: module._KB_WebResourceStats(6),
      // Unavailable without acquiring native locks; null must not mean zero.
      virtualReservedBytes: null, audioCachedPCMBytes: null, audioCachedClips: null, audioPCMEvictions: null,
    };
  };
}
