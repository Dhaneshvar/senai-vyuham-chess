export type Side = 'w' | 'b';
export type GameMode = 'local' | 'online';
export type Result = '1-0' | '0-1' | '1/2-1/2' | '*';

export type SavedGame = {
  id: string;
  createdAt: string;
  mode: GameMode;
  pgn: string;
  result: Result;
  reason: string;
  white: string;
  black: string;
};

export type WireMove = { color: Side; from: string; to: string; san: string; promotion?: string; flags: string };
export type WireGame = {
  id: string;
  status: 'waiting' | 'active' | 'finished';
  result: Result | null;
  reason: string | null;
  drawOffer?: Side | null;
  players: Record<Side, { name: string; connected: boolean } | null>;
  fen: string;
  pgn: string;
  turn: Side;
  history: WireMove[];
  clocks: Record<Side, number>;
  time: number;
  increment: number;
  lastMoveAt: number | null;
  serverTime: number;
};

export type EngineLine = {
  depth: number;
  rank: number;
  score: { cp?: number; mate?: number };
  whiteScore: { cp?: number; mate?: number };
  whiteChance: number;
  pv: string[];
  san: string[];
};
export type PositionAnalysis = { fen: string; depth: number; engine: string; lines: EngineLine[] };
export type ReviewItem = {
  ply: number;
  san: string;
  before: string;
  after: string;
  quality: 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';
  loss: number;
  explanation?: string;
  best: EngineLine[];
  actual: EngineLine;
};
export type ReviewJob = { id: string; status: 'queued' | 'running' | 'complete' | 'failed'; completed: number; total: number; items: ReviewItem[]; error: string | null };
