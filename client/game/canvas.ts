// Sized once, before transfer to the engine thread: CSS resizing alone does not
// change the size of the engine's render targets.
// Chromebook low-memory mode: add ?lite=1 to the map URL.
// It renders at about 640x360 on a 16:9 screen instead of forcing >=800x600.
// Optional ?renderScale=0.35..1 adjusts the internal resolution in lite mode.
export function sizeGameCanvas(canvas: HTMLCanvasElement) {
  const width = Math.max(1, innerWidth), height = Math.max(1, innerHeight);
  const params = new URLSearchParams(location.search);
  const liteLevel = ['1', '2', '3'].includes(params.get('lite') ?? '') ? Number(params.get('lite')) : 0;
  const lite = liteLevel > 0;
  const rawScale = Number(params.get('renderScale'));
  const customScale = params.has('renderScale') && Number.isFinite(rawScale) && rawScale > 0
    ? Math.min(1, Math.max(0.15, rawScale))
    : null;

  let scale: number;
  if (lite) {
    // Keep aspect ratio while limiting the real WebGL/WebGPU backbuffer.
    // A Chromebook at 1366x768 renders at 640x360 by default.
    const targetWidth = liteLevel === 3 ? 320 : liteLevel === 2 ? 480 : 640;
    const targetHeight = liteLevel === 3 ? 240 : liteLevel === 2 ? 360 : 480;
    scale = customScale ?? Math.min(1, targetWidth / width, targetHeight / height);
    // The WebAssembly engine may expect a usable viewport; don't go below 320x180.
    scale = Math.max(scale, 256 / width, 144 / height);
  } else {
    const density = Math.min(devicePixelRatio || 1, 1920 / width, 1440 / height);
    scale = Math.max(density, 800 / width, 600 / height);
  }

  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const size = { width: canvas.width, height: canvas.height };
  console.info(`BO1Z rendering: ${size.width}x${size.height} (${lite ? `Chromebook Lite ${liteLevel}` : 'default'})`);

  function fit() {
    const fitScale = Math.min(innerWidth / size.width, innerHeight / size.height);
    canvas.style.width = `${size.width * fitScale}px`;
    canvas.style.height = `${size.height * fitScale}px`;
  }
  fit();
  addEventListener('resize', fit);
  return size;
}
