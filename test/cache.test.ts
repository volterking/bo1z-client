import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import test, { after, before } from 'node:test';
import { upstreamPath, upstreamTarget } from '../server/cache.ts';
import { relay } from './relay.ts';

const DIR = path.join(new URL('..', import.meta.url).pathname, 'cache', 'bo1z', 'kbnet-test');
const URL_PATH = 'http://127.0.0.1:8615/kbnet-test/whole.iwd';
const TAIL = Buffer.alloc(1_000, 3);
let child: ChildProcess;

before(async () => {
  await mkdir(path.join(DIR, 'page'), { recursive: true });
  await writeFile(path.join(DIR, 'whole.iwd'), Buffer.alloc(123_456, 7));
  await writeFile(path.join(DIR, 'sliced.iwd'), Buffer.concat([Buffer.alloc(8 * 1024 * 1024, 1), TAIL]));
  await writeFile(path.join(DIR, 'page', 'index.html'), '<!doctype html>');
  child = await relay(8615, 0);
});

after(async () => {
  child.kill();
  await rm(DIR, { recursive: true, force: true });
});

test('un fichier servi depuis le cache annonce sa longueur exacte (le worker de vel.gg la vérifie)', async () => {
  const response = await fetch(URL_PATH);
  assert.equal(response.headers.get('content-length'), '123456');
  assert.equal((await response.arrayBuffer()).byteLength, 123_456);
});

test('une reprise par plage est servie depuis le cache', async () => {
  const response = await fetch(URL_PATH, { headers: { range: 'bytes=123000-' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 123000-123455/123456');
  assert.equal((await response.arrayBuffer()).byteLength, 456);
});

test('le nom du salon ne change pas l’entrée de cache', async () => {
  const response = await fetch(`${URL_PATH}?room=soiree`);
  assert.equal(response.status, 200);
  assert.equal((await response.arrayBuffer()).byteLength, 123_456);
});

test('le morceau ?part=k est la tranche k de 8 Mo du vrai fichier, envoyée en clair', async () => {
  const response = await fetch('http://127.0.0.1:8615/kbnet-test/sliced.iwd?part=1');
  assert.equal(response.headers.get('content-encoding'), null);
  assert.equal(response.headers.get('content-length'), '1000');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), TAIL);
});

test('une page vient de <chemin>/index.html', async () => {
  const response = await fetch('http://127.0.0.1:8615/kbnet-test/page');
  assert.equal(response.headers.get('content-type'), 'text/html');
  assert.equal(await response.text(), '<!doctype html>');
});


test('upstream paths follow the moved site without changing pack parts or ranges', () => {
  const url = new URL('https://local/bo1z/nacht/pack/main/iw_01.iwd?part=2');
  assert.equal(upstreamPath(url), '/bsz/nacht/pack/main/iw_01.iwd?part=2');
  assert.equal(upstreamPath(new URL('https://local/bo1z/manifest.json')), '/bsz/manifest.json');
  assert.equal(upstreamPath(new URL('https://local/bo1z/artifacts/zombie_theater-pipelines.json')), '/bsz/artifacts/zombie_theater-pipelines.json');
  assert.equal(upstreamPath(url, '/bo1z'), '/bo1z/nacht/pack/main/iw_01.iwd?part=2');
  assert.equal(upstreamPath(url, '/'), '/nacht/pack/main/iw_01.iwd?part=2');
  assert.equal(upstreamPath(new URL('https://local/bo1z-other/file')), '/bo1z-other/file');
});


test('Brotli parts follow the published CDN route; whole files and manifests stay on the site', () => {
  assert.deepEqual(upstreamTarget(new URL('https://local/bo1z/nacht/pack/localization.txt?part=0&v=abc')), {
    host: 'cdn.vel.gg', path: '/packs/nacht/localization.txt.br/0?v=abc',
  });
  assert.deepEqual(upstreamTarget(new URL('https://local/bo1z/pack/web/sound/sounds.pack.kop?part=3')), {
    host: 'cdn.vel.gg', path: '/packs/five/web/sound/sounds.pack.kop.br/3',
  });
  for (const path of ['/bo1z/nacht/manifest.json', '/bo1z/nacht/pack/localization.txt', '/bo1z/nacht/pack/web/video/intro.webm']) {
    assert.deepEqual(upstreamTarget(new URL(path, 'https://local')), { host: 'vel.gg', path: path.replace('/bo1z/', '/bsz/') });
  }
  assert.equal(upstreamTarget(new URL('https://local/bo1z/nacht/pack/file?part=0'), '/bo1z').host, 'vel.gg');
  assert.equal(upstreamTarget(new URL('https://local/bo1z/nacht/pack/file?part=invalid')).host, 'vel.gg');
});
