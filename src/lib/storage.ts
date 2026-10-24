import * as SQLite from 'expo-sqlite';
import { SavedGame } from './types';

let connection: Promise<SQLite.SQLiteDatabase> | null = null;
async function db() {
  if (!connection) connection = SQLite.openDatabaseAsync('linechess.db').then(async (database) => {
    await database.execAsync('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, mode TEXT NOT NULL, pgn TEXT NOT NULL, result TEXT NOT NULL, reason TEXT NOT NULL, white_name TEXT NOT NULL, black_name TEXT NOT NULL);');
    return database;
  });
  return connection;
}
export async function setting(key: string): Promise<string | null> {
  const row = await (await db()).getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}
export async function setSetting(key: string, value: string) {
  await (await db()).runAsync('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value);
}
export async function saveGame(game: SavedGame) {
  await (await db()).runAsync('INSERT OR REPLACE INTO games VALUES (?,?,?,?,?,?,?,?)', game.id, game.createdAt, game.mode, game.pgn, game.result, game.reason, game.white, game.black);
}
export async function listGames(): Promise<SavedGame[]> {
  const rows = await (await db()).getAllAsync<{ id: string; created_at: string; mode: SavedGame['mode']; pgn: string; result: SavedGame['result']; reason: string; white_name: string; black_name: string }>('SELECT * FROM games ORDER BY created_at DESC LIMIT 100');
  return rows.map((row) => ({ id: row.id, createdAt: row.created_at, mode: row.mode, pgn: row.pgn, result: row.result, reason: row.reason, white: row.white_name, black: row.black_name }));
}
export async function getGame(id: string): Promise<SavedGame | null> {
  const row = await (await db()).getFirstAsync<{ id: string; created_at: string; mode: SavedGame['mode']; pgn: string; result: SavedGame['result']; reason: string; white_name: string; black_name: string }>('SELECT * FROM games WHERE id = ?', id);
  return row ? { id: row.id, createdAt: row.created_at, mode: row.mode, pgn: row.pgn, result: row.result, reason: row.reason, white: row.white_name, black: row.black_name } : null;
}
export async function clearLocalData() {
  const database = await db();
  await database.execAsync('DELETE FROM games; DELETE FROM settings;');
}
