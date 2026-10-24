import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { Chess } from 'chess.js';

const require = createRequire(import.meta.url);
const enginePath = require('stockfish').findEngine('lite-single');

export function scoreToChance(score) {
  if (score?.mate != null) return score.mate > 0 ? 100 : 0;
  const cp = score?.cp ?? 0;
  return Math.round(100 / (1 + Math.exp(-cp / 180)));
}

function parseInfo(line) {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return null;
  const depth = Number(line.match(/\bdepth (\d+)/)?.[1] ?? 0);
  const rank = Number(line.match(/\bmultipv (\d+)/)?.[1] ?? 1);
  const cp = line.match(/\bscore cp (-?\d+)/);
  const mate = line.match(/\bscore mate (-?\d+)/);
  const pv = line.split(' pv ')[1]?.trim().split(/\s+/) ?? [];
  return { depth, rank, score: mate ? { mate: Number(mate[1]) } : { cp: Number(cp?.[1] ?? 0) }, pv };
}

export class EngineQueue {
  constructor() { this.pending = []; this.running = false; this.cache = new Map(); }
  analyze(fen, options = {}) {
    new Chess(fen);
    const depth = Math.min(16, Math.max(8, options.depth ?? 11));
    const lines = Math.min(3, Math.max(1, options.lines ?? 3));
    const key = `${fen}:${depth}:${lines}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.createdAt < 15 * 60_000) return Promise.resolve(cached.value);
    if (this.pending.length > 200) return Promise.reject(new Error('Analysis queue is busy'));
    return new Promise((resolve, reject) => {
      this.pending.push({ fen, depth, lines, key, resolve, reject });
      this.pump();
    });
  }
  async pump() {
    if (this.running) return;
    this.running = true;
    while (this.pending.length) {
      const job = this.pending.shift();
      try {
        let value; let lastError;
        for (let attempt = 0; attempt < 2; attempt++) {
          try { value = await this.run(job); break; } catch (error) { lastError = error; }
        }
        if (!value) throw lastError;
        this.cache.set(job.key, { value, createdAt: Date.now() });
        if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value);
        job.resolve(value);
      } catch (error) { job.reject(error); }
    }
    this.running = false;
  }
  run({ fen, depth, lines }) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [enginePath], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      const variants = new Map();
      let buffer = '';
      let done = false;
      const finish = (error) => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        child.kill();
        if (error) return reject(error);
        const chess = new Chess(fen);
        const ordered = [...variants.values()].sort((a, b) => a.rank - b.rank).map((variant) => {
          const replay = new Chess(fen);
          const san = [];
          for (const uci of variant.pv) {
            try { san.push(replay.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san); }
            catch { break; }
          }
          const whiteScore = chess.turn() === 'w' ? variant.score : { cp: variant.score.cp == null ? undefined : -variant.score.cp, mate: variant.score.mate == null ? undefined : -variant.score.mate };
          return { ...variant, san, whiteScore, whiteChance: scoreToChance(whiteScore) };
        });
        resolve({ fen, depth: Math.max(...ordered.map((v) => v.depth), 0), engine: 'Stockfish 19 lite', lines: ordered });
      };
      const timeout = setTimeout(() => finish(new Error('Engine timed out')), 15000);
      child.on('error', finish);
      child.on('exit', (code) => { if (!done) finish(new Error(`Engine exited: ${code}`)); });
      child.stdout.on('data', (data) => {
        buffer += data.toString();
        let cut;
        while ((cut = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, cut).trim(); buffer = buffer.slice(cut + 1);
          const info = parseInfo(line);
          if (info && (!variants.has(info.rank) || variants.get(info.rank).depth <= info.depth)) variants.set(info.rank, info);
          if (line.startsWith('bestmove ')) finish();
        }
      });
      child.stdin.write(`uci\nsetoption name MultiPV value ${lines}\nisready\nposition fen ${fen}\ngo depth ${depth}\n`);
    });
  }
}

export const analysisQueue = new EngineQueue();
