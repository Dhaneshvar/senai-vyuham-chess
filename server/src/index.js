import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { Chess } from 'chess.js';
import { analysisQueue } from './engine.js';
import { initializeStore, persistGame, storageMode } from './database.js';

const app = express();
const configuredOrigins = (process.env.CORS_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
// Never silently allow every browser origin in production. Local development can
// still use the permissive default, while hosted deployments must configure the
// exact web origins explicitly.
const corsOrigin = configuredOrigins.length ? configuredOrigins : (process.env.NODE_ENV === 'production' ? false : true);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '128kb' }));
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: corsOrigin }, pingTimeout: 20000, maxHttpBufferSize: 128 * 1024 });
const games = new Map();
const reviews = new Map();
const requestBuckets = new Map();
const socketBuckets = new Map();
const MAX_GAMES = 2000;
const MAX_ACTIVE_REVIEWS = 4;
let activeReviewJobs = 0;
const shortId = () => randomBytes(4).toString('hex').toUpperCase();
const reply = (callback, data) => { if (typeof callback === 'function') callback(data); };
const name = (value) => typeof value === 'string' ? value.trim().slice(0, 32) || 'Guest' : 'Guest';
const clientKey = (request) => (process.env.TRUST_PROXY === 'true' ? request.headers['x-forwarded-for']?.split(',')[0]?.trim() : undefined) || request.socket.remoteAddress || 'unknown';
function allowed(buckets, key, limit, windowMs) {
  const now = Date.now(); const entries = (buckets.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (entries.length >= limit) { buckets.set(key, entries); return false; }
  entries.push(now); buckets.set(key, entries); return true;
}
function requestLimit(limit, windowMs) {
  return (req, res, next) => allowed(requestBuckets, `${req.path}:${clientKey(req)}`, limit, windowMs) ? next() : res.status(429).json({ error: 'Too many requests. Please wait and try again.' });
}
function socketAllowed(socket, event, limit = 30, windowMs = 60_000) {
  return allowed(socketBuckets, `${event}:${clientKey(socket.request)}`, limit, windowMs);
}

function view(game) {
  return {
    id: game.id, status: game.status, result: game.result, reason: game.reason, drawOffer: game.drawOffer ?? null,
    players: Object.fromEntries(['w', 'b'].map((side) => [side, game.players[side] ? { name: game.players[side].name, connected: !!game.players[side].socketId } : null])),
    fen: game.chess.fen(), pgn: game.chess.pgn(), turn: game.chess.turn(),
    history: game.chess.history({ verbose: true }).map(({ color, from, to, san, promotion, flags, captured }) => ({ color, from, to, san, promotion, flags, captured })),
    clocks: game.clocks, time: game.time, increment: game.increment, lastMoveAt: game.lastMoveAt, serverTime: Date.now(),
  };
}
function tick(game) {
  if (game.status !== 'active' || !game.time || !game.lastMoveAt) return;
  const elapsed = Math.floor((Date.now() - game.lastMoveAt) / 1000);
  if (elapsed < 1) return;
  const side = game.chess.turn();
  game.clocks[side] = Math.max(0, game.clocks[side] - elapsed);
  game.lastMoveAt += elapsed * 1000;
  if (!game.clocks[side]) { game.status = 'finished'; game.result = side === 'w' ? '0-1' : '1-0'; game.reason = 'timeout'; }
}
function finishIfOver(game) {
  if (!game.chess.isGameOver()) return;
  game.status = 'finished';
  game.result = game.chess.isCheckmate() ? (game.chess.turn() === 'w' ? '0-1' : '1-0') : '1/2-1/2';
  game.reason = game.chess.isCheckmate() ? 'checkmate' : 'draw';
}

app.get('/health', (_req, res) => res.json({ ok: true, games: games.size, storage: storageMode(), analysisQueue: analysisQueue.pending.length }));
app.get('/games/:id', requestLimit(60, 60_000), (req, res) => {
  const game = games.get(req.params.id.toUpperCase());
  if (!game) return res.status(404).json({ error: 'Game not found' });
  tick(game); res.json(view(game));
});
app.post('/analysis/position', requestLimit(20, 60_000), async (req, res) => {
  try {
    if (typeof req.body?.fen !== 'string') return res.status(400).json({ error: 'FEN required' });
    res.json(await analysisQueue.analyze(req.body.fen, { depth: req.body.depth, lines: req.body.lines }));
  } catch (error) { res.status(503).json({ error: error.message }); }
});
app.post('/analysis/review', requestLimit(4, 60_000), (req, res) => {
  if (activeReviewJobs >= MAX_ACTIVE_REVIEWS) return res.status(503).json({ error: 'Analysis capacity is busy. Please try again shortly.' });
  if (typeof req.body?.pgn !== 'string' || req.body.pgn.length > 20000) return res.status(400).json({ error: 'Valid PGN required' });
  const chess = new Chess();
  try { chess.loadPgn(req.body.pgn); } catch { return res.status(400).json({ error: 'Invalid PGN' }); }
  const moves = chess.history({ verbose: true });
  if (!moves.length || moves.length > 400) return res.status(400).json({ error: 'Unsupported game length' });
  activeReviewJobs++;
  const job = { id: randomUUID(), status: 'queued', completed: 0, total: moves.length, items: [], error: null, createdAt: Date.now() };
  reviews.set(job.id, job); res.status(202).json({ id: job.id, status: job.status });
  void (async () => {
    job.status = 'running';
    try {
      const replay = new Chess();
      let best = await analysisQueue.analyze(replay.fen(), { depth: 8, lines: 2 });
      for (const played of moves) {
        const before = replay.fen();
        replay.move(played); const after = replay.fen();
        const actual = await analysisQueue.analyze(after, { depth: 8, lines: 2 });
        const bestChance = best.lines[0]?.whiteChance ?? 50;
        const actualChance = actual.lines[0]?.whiteChance ?? 50;
        const loss = played.color === 'w' ? bestChance - actualChance : actualChance - bestChance;
        const quality = loss < 1 ? 'best' : loss < 3 ? 'excellent' : loss < 7 ? 'good' : loss < 13 ? 'inaccuracy' : loss < 23 ? 'mistake' : 'blunder';
        const lost = Math.max(0, Math.round(loss));
        const side = played.color === 'w' ? 'White' : 'Black';
        const alternative = best.lines[0]?.san?.[0];
        const explanation = quality === 'best'
          ? `${side}'s ${played.san} matched the engine's preferred move and kept the position stable.`
          : `${side}'s ${played.san} changed the winning chances by about ${lost} points. ${alternative ? `The engine preferred ${alternative}.` : 'Explore the variation to see the safer continuation.'}`;
        job.items.push({ ply: job.items.length + 1, san: played.san, before, after, quality, loss: lost, explanation, best: best.lines, actual: actual.lines[0] });
        job.completed++;
        best = actual;
      }
      job.status = 'complete';
    } catch (error) { job.status = 'failed'; job.error = error.message; }
    finally { activeReviewJobs = Math.max(0, activeReviewJobs - 1); }
  })();
});
app.get('/analysis/review/:id', requestLimit(120, 60_000), (req, res) => {
  const job = reviews.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Review not found' });
  res.json(job);
});

io.use((socket, next) => {
  if (!socketAllowed(socket, 'connect', 30)) return next(new Error('Too many connections. Please wait.'));
  const token = socket.handshake.auth?.token;
  socket.data.token = typeof token === 'string' && token.length >= 16 ? token.slice(0, 100) : randomBytes(24).toString('hex');
  next();
});
io.on('connection', (socket) => {
  socket.emit('identity', { token: socket.data.token });
  socket.on('game:create', (input = {}, callback) => {
    if (!socketAllowed(socket, 'game:create', 10)) return reply(callback, { ok: false, error: 'Too many room requests. Please wait.' });
    if (games.size >= MAX_GAMES) return reply(callback, { ok: false, error: 'The server is at capacity. Please try again later.' });
    const time = Number(input.time ?? 600), increment = Number(input.increment ?? 0);
    if (!Number.isInteger(time) || time < 0 || time > 10800 || !Number.isInteger(increment) || increment < 0 || increment > 60) return reply(callback, { ok: false, error: 'Invalid clock' });
    let id = shortId(); while (games.has(id)) id = shortId();
    const color = input.color === 'b' ? 'b' : input.color === 'random' ? (Math.random() < .5 ? 'w' : 'b') : 'w';
    const game = { id, chess: new Chess(), players: { w: null, b: null }, status: 'waiting', time, increment, clocks: { w: time, b: time }, lastMoveAt: null, result: null, reason: null, drawOffer: null };
    game.players[color] = { token: socket.data.token, socketId: socket.id, name: name(input.playerName) };
    games.set(id, game); socket.join(id); void persistGame(game).catch(console.error);
    reply(callback, { ok: true, color, game: view(game) });
  });
  socket.on('game:join', (input = {}, callback) => {
    if (!socketAllowed(socket, 'game:join', 20)) return reply(callback, { ok: false, error: 'Too many join attempts. Please wait.' });
    const game = games.get(String(input.gameId ?? '').toUpperCase());
    if (!game) return reply(callback, { ok: false, error: 'Game not found' });
    const existing = ['w', 'b'].find((side) => game.players[side]?.token === socket.data.token);
    const color = existing ?? (!game.players.w ? 'w' : !game.players.b ? 'b' : null);
    if (!color) return reply(callback, { ok: false, error: 'Room is full' });
    game.players[color] = { token: socket.data.token, socketId: socket.id, name: existing ? game.players[color].name : name(input.playerName) };
    socket.join(game.id);
    if (game.players.w && game.players.b && game.status === 'waiting') { game.status = 'active'; game.lastMoveAt = Date.now(); }
    void persistGame(game).catch(console.error);
    const state = view(game); io.to(game.id).emit('game:state', state); reply(callback, { ok: true, color, game: state });
  });
  socket.on('game:leave', (input = {}, callback) => {
    if (!socketAllowed(socket, 'game:leave', 20)) return reply(callback, { ok: false, error: 'Too many room requests. Please wait.' });
    const game = games.get(String(input.gameId ?? '').toUpperCase());
    if (!game) return reply(callback, { ok: false, error: 'Game not found' });
    const side = ['w', 'b'].find((color) => game.players[color]?.token === socket.data.token);
    if (!side) return reply(callback, { ok: false, error: 'Not a player' });
    if (game.players[side].socketId === socket.id) game.players[side].socketId = null;
    socket.leave(game.id);
    void persistGame(game).catch(console.error);
    io.to(game.id).emit('game:state', view(game));
    reply(callback, { ok: true, gameId: game.id, color: side });
  });
  socket.on('game:move', (input = {}, callback) => {
    const game = games.get(String(input.gameId ?? '').toUpperCase());
    if (!game || game.status !== 'active') return reply(callback, { ok: false, error: 'Game is unavailable' });
    tick(game);
    if (game.status !== 'active') return reply(callback, { ok: false, error: 'Time expired' });
    const side = game.chess.turn();
    if (game.players[side]?.token !== socket.data.token) return reply(callback, { ok: false, error: 'Not your turn' });
    try {
      if (typeof input.from !== 'string' || typeof input.to !== 'string') throw new Error('Invalid move');
      const move = game.chess.move({ from: input.from, to: input.to, promotion: input.promotion || 'q' });
      if (game.time) game.clocks[side] += game.increment;
      game.lastMoveAt = Date.now(); finishIfOver(game);
      void persistGame(game).catch(console.error);
      const state = view(game); io.to(game.id).emit('game:state', state);
      reply(callback, { ok: true, move: move.san, game: state });
    } catch { reply(callback, { ok: false, error: 'Illegal move' }); }
  });
  socket.on('game:resign', (input = {}, callback) => {
    const game = games.get(String(input.gameId ?? '').toUpperCase());
    if (!game || game.status !== 'active') return reply(callback, { ok: false, error: 'Game is unavailable' });
    const side = ['w', 'b'].find((color) => game.players[color]?.token === socket.data.token);
    if (!side) return reply(callback, { ok: false, error: 'Not a player' });
    game.status = 'finished'; game.result = side === 'w' ? '0-1' : '1-0'; game.reason = 'resignation';
    void persistGame(game).catch(console.error);
    io.to(game.id).emit('game:state', view(game)); reply(callback, { ok: true });
  });
  socket.on('game:draw:offer', (input = {}, callback) => {
    const game = games.get(String(input.gameId ?? '').toUpperCase());
    if (!game || game.status !== 'active') return reply(callback, { ok: false, error: 'Game is unavailable' });
    const side = ['w', 'b'].find((color) => game.players[color]?.token === socket.data.token);
    if (!side) return reply(callback, { ok: false, error: 'Not a player' });
    if (game.drawOffer && game.drawOffer !== side) { game.status = 'finished'; game.result = '1/2-1/2'; game.reason = 'draw agreement'; game.drawOffer = null; }
    else game.drawOffer = side;
    void persistGame(game).catch(console.error); io.to(game.id).emit('game:state', view(game)); reply(callback, { ok: true });
  });
  socket.on('disconnect', () => {
    for (const game of games.values()) {
      let changed = false;
      for (const side of ['w', 'b']) if (game.players[side]?.socketId === socket.id) { game.players[side].socketId = null; changed = true; }
      if (changed) io.to(game.id).emit('game:state', view(game));
    }
  });
});
setInterval(() => { for (const game of games.values()) if (game.status === 'active') { const before = game.status; tick(game); if (before !== game.status) { void persistGame(game).catch(console.error); io.to(game.id).emit('game:state', view(game)); } } }, 1000).unref();
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of reviews) if (now - job.createdAt > 60 * 60 * 1000) reviews.delete(id);
  for (const [key, stamps] of requestBuckets) if (!stamps.some((stamp) => now - stamp < 60_000)) requestBuckets.delete(key);
  for (const [key, stamps] of socketBuckets) if (!stamps.some((stamp) => now - stamp < 60_000)) socketBuckets.delete(key);
}, 5 * 60 * 1000).unref();
const port = Number(process.env.PORT || 3001);
initializeStore().then((saved) => {
  for (const game of saved) games.set(game.id, game);
  httpServer.listen(port, '0.0.0.0', () => console.log(`Senai Vyuham server listening on :${port} (${storageMode()})`));
}).catch((error) => { console.error('Could not initialize game storage:', error); process.exitCode = 1; });
