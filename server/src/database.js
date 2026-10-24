import pg from 'pg';
import { Chess } from 'chess.js';

const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined }) : null;
const GAMES_TABLE = 'senai_vyuham_games';

export async function initializeStore() {
  if (!pool) return [];
  // Rename the pre-branding table once so existing hosted games are preserved.
  await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('public.linechess_games') IS NOT NULL
         AND to_regclass('public.${GAMES_TABLE}') IS NULL THEN
        ALTER TABLE linechess_games RENAME TO ${GAMES_TABLE};
      END IF;
    END $$;
  `);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${GAMES_TABLE} (id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_ms BIGINT NOT NULL)`);
  const rows = await pool.query(`SELECT data FROM ${GAMES_TABLE} ORDER BY updated_ms DESC LIMIT 10000`);
  return rows.rows.map(({ data }) => {
    const chess = new Chess();
    if (data.pgn) chess.loadPgn(data.pgn);
    return { ...data, chess, players: {
      w: data.players.w ? { ...data.players.w, socketId: null } : null,
      b: data.players.b ? { ...data.players.b, socketId: null } : null,
    } };
  });
}

export async function persistGame(game) {
  if (!pool) return;
  const updatedMs = Date.now();
  const data = { id: game.id, pgn: game.chess.pgn(), status: game.status, result: game.result,
    reason: game.reason, players: game.players, clocks: game.clocks, time: game.time,
    increment: game.increment, lastMoveAt: game.lastMoveAt, drawOffer: game.drawOffer ?? null };
  await pool.query(`INSERT INTO ${GAMES_TABLE} (id,data,updated_ms) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET data=excluded.data, updated_ms=excluded.updated_ms WHERE ${GAMES_TABLE}.updated_ms <= excluded.updated_ms`, [game.id, JSON.stringify(data), updatedMs]);
}

export function storageMode() { return pool ? 'postgres' : 'memory'; }
