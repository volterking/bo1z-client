// Xbox Edge may not expose usable pointer lock. Enable native Gamepad API
// input with ?controller=1 on desktop, or automatically on Xbox devices.
// This does not bypass WebAssembly, OPFS, GPU or browser memory requirements.
export const isXbox = /Xbox/i.test(navigator.userAgent);
export const controllerMode = isXbox || new URLSearchParams(location.search).get('controller') === '1';
