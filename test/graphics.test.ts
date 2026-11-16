import assert from 'node:assert/strict';
import test from 'node:test';
import { classicPack } from '../client/download/manifest.ts';
import type { Manifest } from '../client/download/protocol.ts';
import { graphicsArguments, memoryConstrained, RESOLUTIONS } from '../client/game/graphics.ts';
import { sizeGameCanvas } from '../client/game/canvas.ts';

test('fixed render targets ignore display density and survive CSS resize', () => {
  Object.assign(globalThis, { innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 2 });
  let resize = () => {};
  Object.assign(globalThis, { addEventListener: (_: string, listener: () => void) => { resize = listener; } });
  for (const resolution of RESOLUTIONS.filter(size => size !== 'auto')) {
    const canvas = { width: 0, height: 0, style: {} } as HTMLCanvasElement;
    const [width, height] = resolution.split('x').map(Number);
    assert.deepEqual(sizeGameCanvas(canvas, resolution), { width, height });
    Object.assign(globalThis, { innerWidth: 1366, innerHeight: 768 });
    resize();
    assert.equal(canvas.width, width);
    assert.equal(canvas.height, height);
    assert.ok(parseFloat(canvas.style.width) <= 1366);
    assert.ok(parseFloat(canvas.style.height) <= 768);
  }
});

test('very low caps rendering and never modifies simulation or gameplay dvars', () => {
  assert.deepEqual(graphicsArguments('default'), []);
  const args = graphicsArguments('very-low');
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 3) {
    assert.equal(args[i], '+set');
    assert.match(args[i + 1], /^(r_|sm_|com_maxfps$)/);
    values.set(args[i + 1], args[i + 2]);
  }
  assert.equal(values.get('com_maxfps'), '30');
  assert.equal(values.get('r_picmip'), '3');
  assert.equal(values.get('sm_enable'), '0');
  assert.ok(!graphicsArguments('low').includes('com_maxfps'));
  assert.equal(memoryConstrained('default', 4), true);
  assert.equal(memoryConstrained('default', 8), false);
  assert.equal(memoryConstrained('default'), false);
  assert.equal(memoryConstrained('very-low'), true);
});


test('classic weapons skip optional Counter-Strike assets while retaining horde files and hash metadata', () => {
  const files = ['main/base.iwd', 'mods/cstest/mod.ff', 'mods/horde/mod.ff', 'mods/zinfo/script.gsc', 'mods/noperks/script.gsc'].map((path, i) => ({ path, size: i + 1, sha256: 'a'.repeat(64), priority: 'boot' }));
  const manifest: Manifest = { schema: 1, version: 'b'.repeat(64), total_bytes: 15, classes: ['boot'], files };
  const selected = classicPack(manifest);
  assert.equal(selected.total_bytes, 13);
  assert.deepEqual(selected.files.map(f => f.path), ['main/base.iwd', 'mods/horde/mod.ff', 'mods/zinfo/script.gsc', 'mods/noperks/script.gsc']);
  assert.equal(selected.files[0], files[0]);
  assert.equal(manifest.files.length, 5);
  assert.equal(manifest.total_bytes, 15);
});
