;(() => {
  // Android-only experimental BC1/BC2/BC3 -> RGBA8 WebGL2 compatibility.
  if (!/Android/i.test(navigator?.userAgent || '') ||
      typeof WebGL2RenderingContext === 'undefined' ||
      globalThis.__kisakMobileDXTInstalled) return;
  globalThis.__kisakMobileDXTInstalled = true;
  const p = WebGL2RenderingContext.prototype;
  const getExt = p.getExtension, getSupported = p.getSupportedExtensions;
  const upload = p.compressedTexImage2D, subUpload = p.compressedTexSubImage2D, storage = p.texStorage2D;
  const RGB1 = 0x83F0, RGBA1 = 0x83F1, DXT3 = 0x83F2, DXT5 = 0x83F3;
  const formats = new Set([RGB1, RGBA1, DXT3, DXT5]);
  const ext = { COMPRESSED_RGB_S3TC_DXT1_EXT: RGB1, COMPRESSED_RGBA_S3TC_DXT1_EXT: RGBA1,
    COMPRESSED_RGBA_S3TC_DXT3_EXT: DXT3, COMPRESSED_RGBA_S3TC_DXT5_EXT: DXT5 };
  p.getSupportedExtensions = function () {
    const list = getSupported.call(this) || [];
    return getExt.call(this, 'WEBGL_compressed_texture_s3tc') ? list
      : [...new Set([...list, 'WEBGL_compressed_texture_s3tc'])];
  };
  p.getExtension = function (name) {
    const real = getExt.call(this, name);
    return real || (name === 'WEBGL_compressed_texture_s3tc' ? ext : null);
  };
  const unpack565 = v => [Math.round((v >> 11 & 31) * 255 / 31),
    Math.round((v >> 5 & 63) * 255 / 63), Math.round((v & 31) * 255 / 31)];
  function decode(bytes, width, height, format) {
    const stride = format === RGB1 || format === RGBA1 ? 8 : 16;
    const cols = Math.ceil(width / 4), rows = Math.ceil(height / 4);
    const expected = cols * rows * stride;
    if (bytes.byteLength < expected) throw new Error('DXT data truncated: ' + bytes.byteLength + '/' + expected);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const result = new Uint8Array(width * height * 4);
    for (let by = 0; by < rows; by++) for (let bx = 0; bx < cols; bx++) {
      const start = (by * cols + bx) * stride, c = start + stride - 8;
      const c0 = view.getUint16(c, true), c1 = view.getUint16(c + 2, true);
      const a = unpack565(c0), b = unpack565(c1);
      const colors = [a, b, null, null];
      if (c0 > c1 || format !== RGBA1) {
        colors[2] = a.map((v, i) => Math.round((2 * v + b[i]) / 3));
        colors[3] = a.map((v, i) => Math.round((v + 2 * b[i]) / 3));
      } else {
        colors[2] = a.map((v, i) => Math.round((v + b[i]) / 2));
        colors[3] = [0, 0, 0];
      }
      const idx = view.getUint32(c + 4, true);
      const alpha = [bytes[start], bytes[start + 1]];
      if (format === DXT5) {
        if (alpha[0] > alpha[1]) for (let i = 1; i <= 6; i++) alpha.push(
          Math.round(((7 - i) * alpha[0] + i * alpha[1]) / 7));
        else {
          for (let i = 1; i <= 4; i++) alpha.push(Math.round(((5 - i) * alpha[0] + i * alpha[1]) / 5));
          alpha.push(0, 255);
        }
      }
      let alphaBits = 0n;
      if (format === DXT5) for (let i = 0; i < 6; i++) alphaBits |= BigInt(bytes[start + i + 2]) << BigInt(i * 8);
      for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
        const x = bx * 4 + px, y = by * 4 + py;
        if (x >= width || y >= height) continue;
        const n = py * 4 + px, selector = idx >>> (n * 2) & 3, at = (y * width + x) * 4;
        result.set(colors[selector], at);
        result[at + 3] = format === DXT3 ? ((bytes[start + (n >> 1)] >> ((n & 1) * 4)) & 15) * 17
          : format === DXT5 ? alpha[Number(alphaBits >> BigInt(n * 3) & 7n)]
          : format === RGBA1 && c0 <= c1 && selector === 3 ? 0 : 255;
      }
    }
    return result;
  }
  function input(data, off = 0, len) {
    if (!ArrayBuffer.isView(data)) throw new Error('DXT requires typed-array upload (no PBO support)');
    const stride = data.BYTES_PER_ELEMENT || 1, start = off * stride;
    const count = len === undefined ? data.byteLength - start : len * stride;
    if (start < 0 || count < 0 || start + count > data.byteLength) throw new Error('Invalid DXT payload');
    return new Uint8Array(data.buffer, data.byteOffset + start, count);
  }
  let count = 0;
  p.compressedTexImage2D = function(target, level, format, w, h, border, data, off, len) {
    if (!formats.has(format) || getExt.call(this, 'WEBGL_compressed_texture_s3tc'))
      return upload.apply(this, arguments);
    const rgba = decode(input(data, off, len), w, h, format);
    this.texImage2D(target, level, 0x8058, w, h, border, 0x1908, 0x1401, rgba);
    if (++count <= 8) console.info('KISAK_MOBILE_DXT converted', w, h, format, count);
  };
  p.compressedTexSubImage2D = function(target, level, x, y, w, h, format, data, off, len) {
    if (!formats.has(format) || getExt.call(this, 'WEBGL_compressed_texture_s3tc'))
      return subUpload.apply(this, arguments);
    this.texSubImage2D(target, level, x, y, w, h, 0x1908, 0x1401,
      decode(input(data, off, len), w, h, format));
  };
  p.texStorage2D = function(target, levels, format, w, h) {
    if (!formats.has(format) || getExt.call(this, 'WEBGL_compressed_texture_s3tc'))
      return storage.apply(this, arguments);
    return storage.call(this, target, levels, 0x8058, w, h);
  };
  // Experiment: native game mode remains 800x600, while the visible Android
  // drawing buffer may be 356x200 / 533x300. Rescale the *default framebuffer*
  // viewport/scissor only. FBO offscreen targets keep their own coordinates.
  // This only activates with a drawing buffer below the game's 800x600 minimum.
  const nativeViewport = p.viewport, nativeScissor = p.scissor;
  const adaptRect = (gl, x, y, w, h) => {
    if (gl.drawingBufferWidth >= 800 || gl.drawingBufferHeight >= 600 ||
        gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) !== null) return [x, y, w, h];
    const sx = gl.drawingBufferWidth / 800, sy = gl.drawingBufferHeight / 600;
    return [Math.round(x * sx), Math.round(y * sy),
      Math.max(1, Math.round(w * sx)), Math.max(1, Math.round(h * sy))];
  };
  p.viewport = function(x, y, w, h) {
    return nativeViewport.apply(this, adaptRect(this, x, y, w, h));
  };
  p.scissor = function(x, y, w, h) {
    return nativeScissor.apply(this, adaptRect(this, x, y, w, h));
  };
  console.info('KISAK_MOBILE_DXT fallback installed');
})();