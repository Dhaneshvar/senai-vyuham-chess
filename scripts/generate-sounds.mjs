import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Original, deterministic short board sounds. Run `node scripts/generate-sounds.mjs` to rebuild.
const directory = join(process.cwd(), 'assets', 'sounds');
mkdirSync(directory, { recursive: true });
const sampleRate = 22050;
let seed = 145012;
function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; }
function wave(kind, seconds) {
  const count = Math.floor(sampleRate * seconds);
  const pcm = Buffer.alloc(count * 2);
  let filtered = 0;
  for (let i=0;i<count;i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * (kind === 'capture' ? 38 : 52));
    filtered = filtered * .72 + random() * .28;
    const thunk = Math.sin(2 * Math.PI * (kind === 'check' ? 520 : 260) * t) * Math.exp(-t * 26);
    const lower = Math.sin(2 * Math.PI * (kind === 'capture' ? 135 : 190) * t) * Math.exp(-t * 60);
    const signal = Math.max(-1, Math.min(1, filtered * envelope * .65 + thunk * .25 + lower * .35));
    pcm.writeInt16LE(Math.round(signal * 15000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
for (const [name, duration] of [['move', .09], ['capture', .14], ['check', .19]]) writeFileSync(join(directory, `${name}.wav`), wave(name, duration));
