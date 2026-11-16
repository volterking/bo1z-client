import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { patchEngine } from '../patch/engine.ts';
import { instructions, leb, parse, rebuild, sleb } from '../patch/wasm.ts';

const I32 = 0x7f;
const section = (id: number, content: number[]) => [id, ...leb(content.length), ...content];
const vec = (items: number[][]) => [...leb(items.length), ...items.flat()];
const text = (value: string) => [...leb(value.length), ...new TextEncoder().encode(value)];
const body = (content: number[]) => [...leb(content.length), ...content];

const tiny = Uint8Array.from([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  ...section(1, vec([[0x60, 0, 1, I32], [0x60, 1, I32, 0]])),
  ...section(2, vec([[...text('env'), ...text('log'), 0x00, 1]])),
  ...section(3, vec([[0], [0]])),
  ...section(4, vec([[0x70, 0x00, 1]])),
  ...section(7, vec([[...text('callSeven'), 0x00, 2], [...text('table'), 0x01, 0]])),
  ...section(9, vec([[0x00, 0x41, 0x00, 0x0b, ...vec([[1]])]])),
  ...section(10, vec([body([0x00, 0x41, 0x07, 0x0b]), body([0x00, 0x10, 0x01, 0x0b])])),
  ...section(0, [...text('name'), ...section(1, vec([[0, ...text('log')], [1, ...text('seven')], [2, ...text('callSeven')]]))]),
]);

test('reconstruire sans changement redonne le binaire à l’octet près', () => {
  assert.deepEqual(rebuild(parse(tiny)), tiny);
});

test('un import ajouté décale les fonctions définies partout où elles sont référencées', async () => {
  const module = parse(tiny);
  const seen: number[] = [];
  const insert = { at: module.bodies[1].code, end: module.bodies[1].code, bytes: [0x41, 42, 0x10, ...leb(module.importedFuncs)] };
  const patched = rebuild(module, {
    imports: [{ module: 'env', name: 'extra', params: [I32], results: [] }],
    edits: new Map([[2, [insert]]]),
  });

  const { instance } = await WebAssembly.instantiate(patched, { env: { log() {}, extra: (value: number) => seen.push(value) } });
  const { callSeven, table } = instance.exports as { callSeven: () => number; table: WebAssembly.Table };
  assert.equal(callSeven(), 7);
  assert.equal(table.get(0)(), 7);
  assert.deepEqual(seen, [42]);
  assert.deepEqual([...parse(patched).names], [['log', 0], ['extra', 1], ['seven', 2], ['callSeven', 3]]);
});

test('un appel remplacé par une édition n’est pas renuméroté par-dessus', async () => {
  const module = parse(tiny);
  const { code, end } = module.bodies[1];
  const patched = rebuild(module, {
    imports: [{ module: 'env', name: 'extra', params: [I32], results: [] }],
    edits: new Map([[2, [{ at: code, end: end - 1, bytes: [0x41, 9] }]]]),
  });
  const { instance } = await WebAssembly.instantiate(patched, { env: { log() {}, extra() {} } });
  assert.equal((instance.exports.callSeven as () => number)(), 9);
});


test('the real renderer mode guard accepts 640x360 and changes only its two dimension constants', () => {
  const original = readFileSync(new URL('../engine/KisakBlack-web.wasm', import.meta.url));
  const before = parse(original), after = parse(patchEngine(original));
  const body = (module: typeof before) => {
    const index = module.names.get('RB_BrowserRenderIteration(void*)')!;
    const b = module.bodies[index - module.importedFuncs];
    return [...instructions(module.bytes, b.code, b.end)];
  };
  const a = body(before), b = body(after);
  const width = a.findIndex((x, i) => x.op === 0x41 && x.value === 800 && a[i + 1]?.op === 0x48);
  const height = width + 4;
  assert.equal(a[height].value, 600);
  assert.equal(b[width].value, 640);
  assert.equal(b[height].value, 360);
  assert.equal(a.length, b.length);
  const added = after.importedFuncs - before.importedFuncs;
  for (let i = 0; i < a.length; ++i) {
    assert.equal(b[i].op, a[i].op);
    assert.equal(b[i].value, i === width ? 640 : i === height ? 360 : a[i].value);
    if (a[i].index !== undefined) assert.equal(b[i].index, a[i].index! + (a[i].funcAt !== undefined && a[i].index! >= before.importedFuncs ? added : 0));
  }
  const changed = new Uint8Array(original);
  changed.set([0x41, ...sleb(801)], a[width].at);
  assert.throws(() => patchEngine(changed), /RB_BrowserRenderIteration.*0 site/);
});
