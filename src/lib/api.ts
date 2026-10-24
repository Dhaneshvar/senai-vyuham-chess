import { PositionAnalysis, ReviewJob } from './types';

export function cleanUrl(input: string) { return input.trim().replace(/\/$/, ''); }
async function json<T>(url: string, path: string, init?: RequestInit): Promise<T> {
  if (!url) throw new Error('Set the server address in Settings to use engine analysis.');
  const response = await fetch(`${cleanUrl(url)}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}
export function analyzePosition(url: string, fen: string, depth = 11, lines = 3) {
  return json<PositionAnalysis>(url, '/analysis/position', { method: 'POST', body: JSON.stringify({ fen, depth, lines }) });
}
export function startReview(url: string, pgn: string) {
  return json<{ id: string; status: string }>(url, '/analysis/review', { method: 'POST', body: JSON.stringify({ pgn }) });
}
export function getReview(url: string, id: string) { return json<ReviewJob>(url, `/analysis/review/${encodeURIComponent(id)}`); }
export function checkServer(url: string) { return json<{ ok: boolean }>(url, '/health'); }
