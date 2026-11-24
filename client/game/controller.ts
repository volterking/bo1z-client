// Xbox Edge may not expose usable pointer lock. Enable native Gamepad API
// input with ?controller=1 on desktop, or automatically on Xbox devices.
// This does not bypass WebAssembly, OPFS, GPU or browser memory requirements.
export const isXbox = /Xbox/i.test(navigator.userAgent);
export const isAndroid = /Android/i.test(navigator.userAgent);
// Mobile browser mode uses Gamepad API, not pointer lock (which Android often cannot provide).
export const controllerMode = isXbox || isAndroid || new URLSearchParams(location.search).get('controller') === '1';
