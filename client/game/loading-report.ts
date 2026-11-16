import { diagnostics } from './diagnostics.ts';
import { loadSettings } from './settings.ts';

// Read page-owned records only: a stuck native thread may hold allocator locks,
// so generating a loading report must not call any Wasm exports.
export function loadingReport(screen: string, pct: number) {
  const now = performance.now();
  const last = diagnostics.console.at(-1);
  return JSON.stringify({
    screen, progressEstimatePct: pct, page: location.pathname + location.search,
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryHintGiB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    elapsedEngineSeconds: diagnostics.timings.engineStart === undefined ? null : Math.round((now - diagnostics.timings.engineStart) / 1000),
    lastEngineMessageSecondsAgo: last ? Math.round((now - last.ms) / 1000) : null,
    renderer: diagnostics.renderer, requestedRenderer: diagnostics.rendererRequested,
    rendererReason: diagnostics.rendererReason, canvas: diagnostics.canvas,
    settings: loadSettings(), timings: diagnostics.timings, zones: diagnostics.zoneTimes,
    warm: diagnostics.warm, warmGate: diagnostics.warmGate,
    errors: diagnostics.errors.slice(-20),
    consoleDiscarded: diagnostics.consoleDiscarded,
    console: diagnostics.console.slice(-40).map(row => ({ ...row, message: row.message.slice(0, 1000) })),
  }, null, 2);
}
