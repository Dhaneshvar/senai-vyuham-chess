import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const port = 34000 + Math.floor(Math.random() * 10000);
const url = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['src/index.js'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const sockets = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function ready() {
  for (let i=0;i<50;i++) { try { const response=await fetch(`${url}/health`); if (response.ok) return; } catch {} await sleep(150); }
  throw new Error('Server did not start');
}
function client(token) {
  const socket = io(url, { autoConnect: true, auth: token ? { token } : {} }); sockets.push(socket);
  return new Promise((resolve, reject) => { socket.once('connect', () => resolve(socket)); socket.once('connect_error', reject); });
}
test('two players, legal moves, turn validation, reconnect, and engine analysis', async (t) => {
  t.after(() => { sockets.forEach((socket) => socket.disconnect()); child.kill(); });
  await ready();
  const white = await client('white-testing-token-12345');
  const black = await client('black-testing-token-12345');
  const created = await white.emitWithAck('game:create', { time: 60, increment: 2, color: 'w', playerName: 'Alice' });
  assert.equal(created.ok, true);
  const id = created.game.id;
  const joined = await black.emitWithAck('game:join', { gameId: id, playerName: 'Bob' });
  assert.equal(joined.game.status, 'active');
  assert.equal((await black.emitWithAck('game:move', { gameId: id, from: 'e7', to: 'e5' })).ok, false);
  assert.equal((await white.emitWithAck('game:move', { gameId: id, from: 'e2', to: 'e5' })).ok, false);
  const first = await white.emitWithAck('game:move', { gameId: id, from: 'e2', to: 'e4' });
  assert.equal(first.ok, true); assert.equal(first.game.clocks.w, 62);
  const second = await black.emitWithAck('game:move', { gameId: id, from: 'e7', to: 'e5' });
  assert.equal(second.ok, true); assert.match(second.game.pgn, /e4 e5/);
  black.disconnect();
  const blackAgain = await client('black-testing-token-12345');
  const rejoined = await blackAgain.emitWithAck('game:join', { gameId: id });
  assert.equal(rejoined.ok, true); assert.equal(rejoined.color, 'b');
  const response = await fetch(`${url}/analysis/position`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fen: second.game.fen, depth: 8, lines: 2 }) });
  assert.equal(response.status, 200);
  const analysis = await response.json();
  assert.equal(analysis.lines.length, 2); assert.ok(analysis.lines[0].pv[0]);
  const reviewResponse = await fetch(`${url}/analysis/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pgn: second.game.pgn }) });
  assert.equal(reviewResponse.status, 202);
  const { id: reviewId } = await reviewResponse.json();
  let review;
  for (let i=0;i<60;i++) { review = await (await fetch(`${url}/analysis/review/${reviewId}`)).json(); if (review.status === 'complete' || review.status === 'failed') break; await sleep(500); }
  assert.equal(review.status, 'complete', review.error);
  assert.equal(review.items.length, 2);
  assert.ok(review.items[0].best[0].pv.length > 0);
});
