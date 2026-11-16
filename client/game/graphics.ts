// Only startup dvars present in the shipped binary; no engine or shader rewriting.
export const RESOLUTIONS = ['auto', '640x360', '800x450', '960x540', '1280x720'] as const;
export type Resolution = typeof RESOLUTIONS[number];
export type Graphics = 'default' | 'low' | 'very-low';
export type Renderer = 'auto' | 'webgl2' | 'webgpu';

export function graphicsArguments(preset: Graphics): string[] {
  if (preset === 'default') return [];
  const veryLow = preset === 'very-low';
  const mip = veryLow ? '3' : '1';
  const values: Record<string, string> = {
    r_picmip_manual: '1', r_picmip: mip, r_picmip_bump: mip, r_picmip_spec: mip,
    r_texFilterAnisoMin: '1', r_texFilterAnisoMax: '1',
    r_motionblur_enable: '0', r_distortion: '0', sm_enable: '0',
    ...(veryLow ? { com_maxfps: '30', r_blur_allowed: '0', r_superFlare_enable: '0' } : {}),
  };
  return Object.entries(values).flatMap(([name, value]) => ['+set', name, value]);
}

// Chrome reports a rounded device-memory hint, not currently free RAM.
export function memoryConstrained(preset: Graphics, deviceMemory?: number) {
  return preset === 'very-low' || (deviceMemory !== undefined && deviceMemory <= 4);
}
