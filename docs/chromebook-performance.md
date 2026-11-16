# Chromebook performance investigation

## What is editable

The Vue/TypeScript launcher, canvas sizing, downloader, telemetry and generated engine JavaScript are published. The engine is a precompiled WebAssembly binary. `patch/` makes specific binary patches; it is not a native engine build system. The native `websys`, `webd3d` and `websound` source and shader translation toolchain are unpublished. This change does not rewrite the binary, shader packs or generated renderer.

## Findings

- `engine/KisakBlack-web.mjs`, `initMemory()`, creates **2,147,418,112 bytes** of shared Wasm memory with equal initial and maximum sizes. It cannot grow. This is addressable memory, not a measurement of resident physical RAM. Engine allocations, staging, GPU resources, browser workers and ChromeOS all compete for a 4 GB system's memory. Merely reducing `INITIAL_MEMORY` in the glue could break native allocation assumptions and is not a safe optimization.
- Previously, `canvas.ts` chose a screen/DPR-dependent resolution with an 800×600 minimum and up to roughly 1920×1440. CSS scaling alone does not reduce internal targets. Fixed resolution now controls the backing canvas **before OffscreenCanvas transfer** and `r_customMode`. Resizing/fullscreen only changes the fitted CSS rectangle. 800×450 has 61% fewer pixels than 1280×720; reductions in total frame time and total memory will be smaller and depend on the bottleneck.
- The engine previously used `com_maxfps 0`. Very low sets a 30 FPS cap. This limits demand when the engine can reach 30; it does not guarantee 30 FPS. It does not alter zombie counts, scripts, network settings, simulation time or map geometry.
- The normal loading path overlaps downloads with engine startup. Three file jobs may each hold a complete compressed KOP audio container, with up to four decoder workers per container. Even though output is written directly to OPFS and ordinary files use 1 MiB streaming buffers, those overlapping containers/decoders can increase peak RAM and CPU use substantially.
- Chrome's `navigator.deviceMemory <= 4`, or an explicit Very low preset, selects one file job and one audio decoder and defers engine startup until downloads finish and the downloader is terminated. This trades loading speed for less overlap. Verified OPFS files are reused. If a non-boot download fails after boot is verified, startup still proceeds as before. Unsupported/missing device-memory hints retain normal loading unless Very low is selected.
- Renderer Auto prefers WebGPU when the required features are available; enabling WebGL acceleration does not mean Auto actually chose WebGL. WebGPU has pipeline warm-up and additional staging/arena allocations. WebGL 2 is now explicitly selectable for comparison. Existing `?renderer=...` overrides and session WebGPU-fallback overrides retain precedence over the saved preference. WebGL may need to fetch its lazy shader pack.
- Startup logs were unbounded until the map loaded; they are now capped at 4096 lines during startup, in addition to the existing post-load cap. The optional overlay no longer adds a backdrop-blur pass.

## Presets and textures

Engine default leaves engine graphics settings alone. Low and Very low apply startup dvars whose names are present in the shipped Wasm:

| Setting | Low | Very low |
| --- | --- | --- |
| Manual texture mip selection | enabled | enabled |
| `r_picmip`, `r_picmip_bump`, `r_picmip_spec` | 1 | 3 |
| Anisotropy minimum/maximum | 1 | 1 |
| Motion blur, distortion, shadow maps | off | off |
| Allowed blur and super flare | engine default | off |
| `com_maxfps` | existing uncapped setting | 30 |

The existing in-game menu is part of the compiled engine; these are additional launcher presets, applied before map loading. Dvar presence confirms the binary knows these names, but does not prove that every asset/render path honors them. Runtime effectiveness and visual compatibility need testing on actual maps. In-game options may override some settings; relaunch to reapply a preset.

Higher picmip values request coarser texture mips. If the engine drops the leading mips, stepping down three levels can reduce the mip chain's texel count by about 64× for suitable textures. **That is not a measured memory saving for this port**: some textures have fixed dimensions/no mips, staging copies may persist, and the loader may still read/decompress the full source asset. No downloaded texture packs were changed or repacked. Download sizes do not establish GPU memory usage.

F3 cycles compact, detailed and hidden displays; Options can enable the compact display on startup. FPS comes from engine presentation intervals, not the page's animation loop. Memory is the engine's Wasm break / addressable Wasm capacity; it is **not free Chromebook RAM, committed process memory or VRAM**. Detailed mode also shows live texture count and texture staging bytes exported by the engine. Texture staging is a CPU-side metric, not total GPU texture storage. The browser has no reliable portable API for free system RAM or exact per-game VRAM usage.

## Grey screen / larger-map investigation

A large map can hit native heap limits, system memory pressure, GPU/context loss, a worker failure, a pack download failure or shader/pipeline trouble. The reported 98%→8–9% CPU and recovering RAM are consistent with work ending or resources being reclaimed, but **do not establish OOM**. A waiting/failed worker can also use little CPU. Smaller render targets reduce framebuffer memory and fill work; they do not remove map assets or guarantee Kino loads.

The existing diagnostics already capture engine aborts, Wasm errors, worker errors, device/context loss, map/zone milestones, allocation counters and pipeline progress. For an on-device reproduction:

1. Choose 800×450, Very low, WebGL 2, and FPS/memory enabled. Use ordinary solo mode, since Hell Mode defaults to 300 zombies at round 100 and is far more CPU intensive.
2. Launch Nacht, then Kino separately. Record load completion, selected renderer/resolution, FPS after the intro, Wasm usage, texture count/staging, and any stalled-present message. Repeat at 640×360 if frame time remains high. Start each comparison with a fresh map page; use cached map data for comparable load timing.
3. On failure, save the page's existing technical error report. If the page remains alive without a report, inspect `bo1z.diagnostics` and `bo1z.engine()?.telemetryMemory()` in DevTools. Look for `Com_ERROR`, `Aborted`, allocation failures, `worker-error`, `webgl-context-lost`, and WebGPU device-loss/validation messages. No JavaScript report can be guaranteed if Chrome kills the entire tab.
4. Compare Chrome Task Manager process memory and ChromeOS Diagnostics at the same time. Those external observations distinguish system pressure from the fixed Wasm capacity. Compare WebGPU only after the WebGL baseline works; do not assume either backend is universally faster.

## Validation and limits

Type checking, production build, unit tests and menu browser tests are run in the development workspace; see the change report for results. They validate settings, target sizing and client behavior, not Chromebook frame rates or map compatibility. This workspace has no N5100 Chromebook. The original `/bo1z/` upstream paths are obsolete. Nacht/Kino manifests are now confirmed available under `/bsz/`, and sample asset lengths and SHA-256 hashes have been verified through the relay. No FPS improvement, Kino fix, exact texture footprint or native heap reduction is claimed without those measurements.


## Current upstream download routes

The original game is now served at `https://vel.gg/bsz/`. The relay preserves historical `/bo1z/` disk-cache keys but maps outgoing requests to `/bsz/` (configurable with `UPSTREAM_PREFIX`). This fixes the HTTP 404 on the manifest that prevented Render-hosted games from starting downloads.

The current site's `?part=k` route returned still-compressed payloads after HTTP decompression during testing. Like the published upstream downloader, the relay now obtains compressed chunks from `cdn.vel.gg/packs/<map>/<file>.br/<k>`. A SHA-256 prefix is included as the version cache key. Whole files, manifests and videos retain the site endpoint, and all client size/hash validation stays enabled. Unit tests cover both routes and the legacy prefix override.

Current manifests also bundle optional Counter-Strike weapons. This fork uses classic Black Ops weapons, so it excludes `mods/cstest/` before downloading; horde and other existing assets remain. The current Nacht manifest contains about 186 MB of optional Counter-Strike assets before compression. Those files do not need to be downloaded or decoded for classic gameplay.
