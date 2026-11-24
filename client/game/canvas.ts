// Sized once, before transfer to the engine thread: CSS resizing alone does not
// change the size of the engine's render targets.
// Chromebook low-memory mode: add ?lite=1 to the map URL.
// It renders at about 640x360 on a 16:9 screen instead of forcing >=800x600.
// Optional ?renderScale=0.15..1 adjusts the internal resolution in lite mode.
// lite=2 targets 480x270, lite=4 targets 400x225, lite=3 targets 320x180 at 16:9.
export function sizeGameCanvas(canvas: HTMLCanvasElement) {
  const width = Math.max(1, innerWidth), height = Math.max(1, innerHeight);
  const params = new URLSearchParams(location.search);
  const liteLevel = ['1', '2', '3', '4', '5'].includes(params.get('lite') ?? '') ? Number(params.get('lite')) : 0;
  const lite = liteLevel > 0;
  const rawScale = Number(params.get('renderScale'));
  const customScale = params.has('renderScale') && Number.isFinite(rawScale) && rawScale > 0
    ? Math.min(1, Math.max(0.15, rawScale))
    : null;

  let scale: number;
  if (lite) {
    // Keep aspect ratio while limiting the real WebGL/WebGPU backbuffer.
    // A Chromebook at 1366x768 renders at 640x360 by default.
    const targetWidth = liteLevel === 5 ? 280 : liteLevel === 3 ? 320 : liteLevel === 4 ? 400 : liteLevel === 2 ? 480 : 640;
    const targetHeight = liteLevel === 5 ? 210 : liteLevel === 3 ? 240 : liteLevel === 4 ? 300 : liteLevel === 2 ? 360 : 480;
    scale = customScale ?? Math.min(1, targetWidth / width, targetHeight / height);
    // Keep a minimum of 256x144 for a usable canvas.
    scale = Math.max(scale, 256 / width, 144 / height);
  } else {
    const density = Math.min(devicePixelRatio || 1, 1920 / width, 1440 / height);
    scale = Math.max(density, 800 / width, 600 / height);
  }

  // The native renderer rejects all modes below 800x600 during R_Init.
  // Mobile Chrome has a much smaller CSS viewport; don't send its 280x210
  // Lite-5 backbuffer as r_customMode. Display 800x600 scaled down instead.
  // Other platforms keep their existing ultra-lite resolution behavior.
  const android = /Android/i.test(navigator.userAgent);
  // Experimental Android low-backbuffer mode. The native game must still see
  // an 800x600 logical video mode (see engine.ts); the actual WebGL drawing
  // buffer can be 356x200 or 533x300. The GL default-FBO viewport needs to
  // be scaled by patch/mobile-dxt-fallback.js. Untested: opt-in only.
  const mobileRes = android && ['200', '300'].includes(params.get('mobileRes') ?? '')
    ? Number(params.get('mobileRes')) : null;
  canvas.width = mobileRes ? Math.round(mobileRes * 16 / 9)
    : android ? Math.max(800, Math.round(width * scale)) : Math.max(1, Math.round(width * scale));
  canvas.height = mobileRes ?? (android ? Math.max(600, Math.round(height * scale)) : Math.max(1, Math.round(height * scale)));
  const size = { width: canvas.width, height: canvas.height };
  console.info(`BO1Z rendering: ${size.width}x${size.height} (${mobileRes ? `Android experimental ${mobileRes}p` : android ? 'Android renderer minimum' : lite ? `Chromebook Lite ${liteLevel}` : 'default'})`);

  function fit() {
    const fitScale = Math.min(innerWidth / size.width, innerHeight / size.height);
    canvas.style.width = `${size.width * fitScale}px`;
    canvas.style.height = `${size.height * fitScale}px`;
  }
  fit();
  addEventListener('resize', fit);
  return size;
}
