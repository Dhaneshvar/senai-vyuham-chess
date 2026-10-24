const fs = require('fs');
const path = require('path');

const sampleRate = 22050;
const seconds = 12;
const frames = sampleRate * seconds;
const dataBytes = frames * 2;
const wav = Buffer.alloc(44 + dataBytes);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + dataBytes, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(dataBytes, 40);
const tones = [110, 164.8138, 220, 329.6276];
for (let i = 0; i < frames; i += 1) {
  const time = i / sampleRate;
  const fade = Math.min(1, time / 1.4, (seconds - time) / 1.4);
  const breath = .72 + .28 * Math.sin(Math.PI * 2 * time / 6);
  const sample = tones.reduce((sum, frequency, index) => sum + Math.sin(Math.PI * 2 * frequency * time + index * .7) * (index ? .12 : .2), 0);
  wav.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(sample * fade * breath * 32767))), 44 + i * 2);
}
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'sounds', 'ambient.wav'), wav);
