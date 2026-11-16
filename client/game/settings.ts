import { RESOLUTIONS, type Resolution, type Graphics, type Renderer } from './graphics.ts';
import { type Horde, hordeCount, hordeDefaults, hordeRound } from './horde.ts';

// volumeChosen: a saved volume only counts if the player moved the slider; otherwise the game starts at 50 %.
export type Settings = { sensitivity: number; volume: number; volumeChosen: boolean; fullscreen: boolean; horde: Horde; resolution: Resolution; graphics: Graphics; renderer: Renderer; showPerf: boolean };

const KEY = 'bo1z-settings';

export function loadSettings(): Settings {
  let saved: Partial<Settings> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY)!) ?? {};
  } catch {}
  const volumeChosen = saved.volumeChosen === true && Number.isFinite(saved.volume);
  return {
    sensitivity: Number.isFinite(saved.sensitivity) ? saved.sensitivity! : 5,
    volume: volumeChosen ? saved.volume! : 0.5,
    volumeChosen,
    resolution: RESOLUTIONS.includes(saved.resolution!) ? saved.resolution! : 'auto',
    graphics: saved.graphics === 'low' || saved.graphics === 'very-low' ? saved.graphics : 'default',
    renderer: saved.renderer === 'webgl2' || saved.renderer === 'webgpu' ? saved.renderer : 'auto',
    showPerf: saved.showPerf === true,
    fullscreen: saved.fullscreen === true,
    horde: { n: hordeCount(saved.horde?.n ?? hordeDefaults.n), round: hordeRound(saved.horde?.round ?? hordeDefaults.round) },
  };
}

export function saveSettings(change: Partial<Settings>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadSettings(), ...change }));
  } catch {}
}
