import type { Manifest } from './protocol.ts';

// This fork runs Black Ops weapons; the current upstream manifest also includes
// optional Counter-Strike assets that its own launcher excludes for guns=classic.
export function classicPack(manifest: Manifest): Manifest {
  const files = manifest.files.filter(file => !/^mods\/cstest\//i.test(file.path));
  return { ...manifest, files, total_bytes: files.reduce((sum, file) => sum + file.size, 0) };
}
