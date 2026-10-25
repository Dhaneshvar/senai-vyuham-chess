import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Chess } from 'chess.js';
import { io } from 'socket.io-client';
import './styles.css';
import ambientMusicUrl from '../../assets/sounds/ambient.wav?url';
import brandLogoUrl from './assets/vyuha-chess-ai-logo.webp';

// Three.js and Chart.js are deliberately loaded only when their UI is needed.
// This keeps the first interactive screen small on slow networks.
const WebThreeBoard = lazy(() => import('./WebThreeBoard').then((module) => ({ default: module.WebThreeBoard })));

const files = 'abcdefgh';
const glyph = { w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' }, b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' } };
const freshFen = new Chess().fen();
const read = (key, fallback = '') => localStorage.getItem(key) ?? fallback;
const configuredServer = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '');
const initialRoomCode = new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase() || '';
const developerProfileUrl = import.meta.env.VITE_DEVELOPER_PROFILE_URL?.trim() || 'https://www.linkedin.com/in/dhaneshvar/';
const donationUrl = import.meta.env.VITE_DONATION_URL?.trim() || '';
const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
const suggestedServer = configuredServer || (isLocalHost ? 'http://localhost:3001' : `${window.location.protocol}//${window.location.hostname}:3001`);
const initialServer = () => {
  const saved = read('linechess-server');
  if (configuredServer) return configuredServer;
  if (!saved || saved.includes('YOUR_LAPTOP_WIFI_IP')) return suggestedServer;
  return window.location.hostname !== 'localhost' && /^https?:\/\/localhost(?::\d+)?\/?$/.test(saved) ? suggestedServer : saved;
};
const initialGraphicsQuality = () => {
  const saved = read('linechess-graphics');
  if (saved) return saved;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const slowNetwork = connection?.saveData || /(^|-)2g|3g/.test(connection?.effectiveType || '');
  const constrainedDevice = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  return slowNetwork || constrainedDevice ? 'low' : 'high';
};
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js'); });
}
const formatClock = (value, timed) => timed ? `${Math.floor(Math.max(0, value) / 60)}:${String(Math.max(0, value) % 60).padStart(2, '0')}` : '∞';
const makePgn = (moves, result = '*') => {
  const chess = new Chess();
  try {
    moves.forEach((move) => chess.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' }));
    const today = new Date();
    const date = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('.');
    chess.header('Event', 'Senai Vyuham Game', 'Site', window.location.host, 'Date', date, 'Round', '-', 'White', 'Player 1 (You)', 'Black', 'Player 2 (Opponent)', 'Result', result || '*');
    return chess.pgn();
  } catch { return ''; }
};
const qualityLabel = { best: 'Best', excellent: 'Excellent', good: 'Good', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder' };
const qualityClass = (quality) => `quality-${quality || 'good'}`;
const CaptureContext = createContext([]);
const pieceName = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const pieceValue = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const capturedBy = (moves, side) => {
  const replay = new Chess(); const captured = [];
  moves.forEach((move) => {
    const target = replay.get(move.to);
    if (move.color === side && (target || move.flags?.includes('e'))) captured.push({ type: target?.type ?? 'p', color: side === 'w' ? 'b' : 'w' });
    try { replay.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' }); } catch { return; }
  });
  return captured.sort((a, b) => pieceValue[b.type] - pieceValue[a.type]);
};
const materialLead = (moves, side) => capturedBy(moves, side).reduce((total, piece) => total + pieceValue[piece.type], 0) - capturedBy(moves, side === 'w' ? 'b' : 'w').reduce((total, piece) => total + pieceValue[piece.type], 0);
const moveMessage = (move, next) => next.isCheckmate() ? `Checkmate! ${move.color === 'w' ? 'White' : 'Black'} wins.` : next.isCheck() ? `Check! ${next.turn() === 'w' ? 'White' : 'Black'} must respond.` : move.captured ? `Capture! ${move.color === 'w' ? 'White' : 'Black'} captured a ${pieceName[move.captured]}.` : move.promotion ? `Pawn promoted to a ${pieceName[move.promotion]}.` : `${next.turn() === 'w' ? 'White' : 'Black'} to move.`;
const reviewScore = (items) => Math.max(0, Math.round(100 - items.reduce((sum, item) => sum + item.loss, 0) / Math.max(1, items.length)));
const reviewQualityCounts = (items) => items.reduce((counts, item) => { counts[item.quality] = (counts[item.quality] || 0) + 1; return counts; }, {});
const wrapCanvasText = (context, text, x, y, maxWidth, lineHeight) => {
  const words = String(text).split(/\s+/); let line = ''; let row = 0;
  words.forEach((word) => { const candidate = line ? `${line} ${word}` : word; if (context.measureText(candidate).width > maxWidth && line) { context.fillText(line, x, y + row * lineHeight); row += 1; line = word; } else line = candidate; });
  if (line) { context.fillText(line, x, y + row * lineHeight); row += 1; }
  return row;
};
const loadCanvasImage = (source) => new Promise((resolve) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => resolve(null);
  image.src = source;
});
async function createReviewShareImage(items, moves, result, pgn) {
  const notation = moves.map((move, index) => `${index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ''}${move.san}`).join(' ');
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1380;
  const context = canvas.getContext('2d'); if (!context) return null;
  const background = context.createLinearGradient(0, 0, canvas.width, canvas.height); background.addColorStop(0, '#17251b'); background.addColorStop(1, '#09110c'); context.fillStyle = background; context.fillRect(0, 0, canvas.width, canvas.height);
  const panel = (x, y, width, height, fill = '#17251b', radius = 22) => { context.fillStyle = fill; context.beginPath(); context.roundRect(x, y, width, height, radius); context.fill(); context.strokeStyle = '#314c39'; context.lineWidth = 2; context.stroke(); };
  const text = (value, x, y, size, color = '#f8f3e9', weight = '600') => { context.font = `${weight} ${size}px Inter, Arial, sans-serif`; context.fillStyle = color; context.fillText(value, x, y); };
  const white = items.filter((item) => item.ply % 2 === 1); const black = items.filter((item) => item.ply % 2 === 0);
  const whiteCounts = reviewQualityCounts(white); const blackCounts = reviewQualityCounts(black);
  const logo = await loadCanvasImage(brandLogoUrl);
  if (logo) context.drawImage(logo, 56, 42, 82, 82);
  text('SENAI VYUHAM', 158, 78, 31, '#b8f36a', '900'); text('GAME INTELLIGENCE REPORT', 158, 108, 15, '#9bac9d', '800');
  panel(948, 48, 194, 68, '#b8f36a', 34); text(result ? `RESULT  ${result}` : 'GAME REVIEW', 984, 91, 18, '#101812', '900');
  text('Player 1 (You)', 58, 174, 24, '#f8f3e9', '800'); text('VS', 581, 174, 16, '#9bac9d', '900'); text('Player 2 (Opponent)', 650, 174, 24, '#f8f3e9', '800');
  panel(48, 198, 510, 154); panel(642, 198, 510, 154);
  text(`White  ${reviewScore(white)}%`, 72, 249, 30, '#b8f36a', '900'); text(`Black  ${reviewScore(black)}%`, 666, 249, 30, '#b8f36a', '900');
  text('ACCURACY', 72, 278, 13, '#9bac9d', '800'); text('ACCURACY', 666, 278, 13, '#9bac9d', '800');
  text(`Best ${whiteCounts.best || 0}  |  Good ${whiteCounts.good || 0}  |  Mistake ${whiteCounts.mistake || 0}  |  Blunder ${whiteCounts.blunder || 0}`, 72, 322, 15, '#c2cec3');
  text(`Best ${blackCounts.best || 0}  |  Good ${blackCounts.good || 0}  |  Mistake ${blackCounts.mistake || 0}  |  Blunder ${blackCounts.blunder || 0}`, 666, 322, 15, '#c2cec3');
  text('ENGINE EVALUATION', 58, 407, 15, '#b8f36a', '900'); text('White win chance through the game', 58, 434, 15, '#9bac9d');
  panel(48, 456, 1104, 336, '#0c1510');
  const gx = 104; const gy = 500; const gw = 992; const gh = 230; context.strokeStyle = '#304335'; context.lineWidth = 1;
  [0, .25, .5, .75, 1].forEach((fraction) => { const y = gy + gh * fraction; context.beginPath(); context.moveTo(gx, y); context.lineTo(gx + gw, y); context.stroke(); text(`${100 - fraction * 100}%`, 60, y + 5, 12, '#738676'); });
  if (items.length) { context.beginPath(); items.forEach((item, index) => { const x = gx + (items.length === 1 ? gw / 2 : (index / (items.length - 1)) * gw); const y = gy + gh - ((item.actual?.whiteChance ?? 50) / 100) * gh; index ? context.lineTo(x, y) : context.moveTo(x, y); }); context.strokeStyle = '#b8f36a'; context.lineWidth = 5; context.stroke(); items.forEach((item, index) => { const x = gx + (items.length === 1 ? gw / 2 : (index / (items.length - 1)) * gw); const y = gy + gh - ((item.actual?.whiteChance ?? 50) / 100) * gh; context.fillStyle = item.quality === 'blunder' ? '#ed7570' : item.quality === 'mistake' ? '#f09a58' : item.quality === 'inaccuracy' ? '#e6c25c' : '#f8f3e9'; context.beginPath(); context.arc(x, y, 7, 0, Math.PI * 2); context.fill(); }); }
  text('Move 1', gx, 765, 13, '#9bac9d'); text(`Move ${items.length}`, gx + gw - 58, 765, 13, '#9bac9d');
  text('KEY MOMENTS', 58, 842, 15, '#b8f36a', '900'); const turning = items.filter((item) => ['inaccuracy', 'mistake', 'blunder'].includes(item.quality)).slice(0, 4); let y = 878;
  if (!turning.length) { text('No major mistakes detected.', 58, y, 18, '#c2cec3'); y += 34; } else turning.forEach((item) => { text(`${Math.ceil(item.ply / 2)}${item.ply % 2 ? '.' : '...'} ${item.san}  -  ${qualityLabel[item.quality]}`, 58, y, 18, item.quality === 'blunder' ? '#ed7570' : item.quality === 'mistake' ? '#f09a58' : '#e6c25c', '700'); y += 30; });
  const pgnStart = Math.max(990, y + 34); panel(48, pgnStart, 1104, 270, '#111c15');
  text('PGN MOVE RECORD', 72, pgnStart + 42, 15, '#b8f36a', '900'); text('Ready to copy inside Senai Vyuham', 848, pgnStart + 42, 13, '#9bac9d', '700');
  const headers = pgn.split('\n\n')[0].split('\n').filter(Boolean).slice(0, 7).join('   ');
  context.fillStyle = '#8fa08f'; context.font = '500 13px ui-monospace, Consolas, monospace'; wrapCanvasText(context, headers, 72, pgnStart + 76, 1038, 23);
  context.fillStyle = '#e5ede5'; context.font = '600 17px ui-monospace, Consolas, monospace'; wrapCanvasText(context, notation || 'No moves recorded.', 72, pgnStart + 142, 1038, 27);
  text('Shared from Senai Vyuham  -  Play closer. Understand every move.', 58, canvas.height - 48, 15, '#9bac9d');
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png', .92));
}
function playEventTone(move, next) {
  if (read('linechess-sound', 'on') === 'off') return;
  const kind = next.isCheckmate() ? 'mate' : next.isCheck() ? 'check' : move.captured || move.flags?.includes('c') || move.flags?.includes('e') ? 'capture' : 'move';
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext; if (!AudioContext) return;
    const context = new AudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain();
    const settings = { move: [360, .045], capture: [180, .09], check: [740, .14], mate: [130, .28] }[kind];
    oscillator.frequency.value = settings[0]; oscillator.type = kind === 'capture' ? 'square' : 'sine'; gain.gain.setValueAtTime(.045, context.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + settings[1]);
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + settings[1]); oscillator.addEventListener('ended', () => context.close());
  } catch {}
}
function playClockTick(urgent) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext; if (!AudioContext) return;
    const context = new AudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(urgent ? 890 : 620, context.currentTime);
    gain.gain.setValueAtTime(.0001, context.currentTime); gain.gain.exponentialRampToValueAtTime(urgent ? .065 : .028, context.currentTime + .006);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + (urgent ? .13 : .08));
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .15);
    oscillator.addEventListener('ended', () => void context.close());
  } catch {}
}

function App() {
  const socket = useRef(null); const reviewPoll = useRef(null); const formationTimer = useRef(null); const dragStart = useRef(null); const ignoreClick = useRef(false); const musicPlayer = useRef(null); const lastClockTick = useRef('');
  const [fen, setFen] = useState(freshFen); const [moves, setMoves] = useState([]);
  const [mode, setMode] = useState(initialRoomCode ? 'online' : 'local'); const [selected, setSelected] = useState(null); const [orientation, setOrientation] = useState('w'); const [lastMove, setLastMove] = useState(null);
  const [status, setStatus] = useState('active'); const [result, setResult] = useState(''); const [timed, setTimed] = useState(600); const [clocks, setClocks] = useState({ w: 600, b: 600 }); const [clockStarted, setClockStarted] = useState(false);
  const [server, setServer] = useState(initialServer); const [name, setName] = useState(read('linechess-name')); const [connected, setConnected] = useState(false);
  const [gameId, setGameId] = useState(null); const [playerColor, setPlayerColor] = useState('w'); const [joinCode, setJoinCode] = useState(initialRoomCode); const [notice, setNotice] = useState(initialRoomCode ? `Room invite ready - enter your name and join ${initialRoomCode}.` : 'White to move');
  const [analysis, setAnalysis] = useState(null); const [thinking, setThinking] = useState(false); const [review, setReview] = useState(null); const [reviewLoading, setReviewLoading] = useState(false); const [analysisError, setAnalysisError] = useState(''); const [study, setStudy] = useState(null); const [promotion, setPromotion] = useState(null); const [pgnOpen, setPgnOpen] = useState(false); const [pgnDraft, setPgnDraft] = useState(''); const [pgnLoading, setPgnLoading] = useState(false); const [sharePreparing, setSharePreparing] = useState(false); const [showAlternatives, setShowAlternatives] = useState(false); const [toast, setToast] = useState(''); const [threeOpen, setThreeOpen] = useState(true);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [boardSkin, setBoardSkin] = useState(() => read('linechess-board-skin', 'classic')); const [pieceSkin, setPieceSkin] = useState(() => read('linechess-piece-skin', 'classic'));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quality, setQuality] = useState(initialGraphicsQuality);
  const [coordinates, setCoordinates] = useState(() => read('linechess-coordinates', 'on') !== 'off');
  const [sound, setSound] = useState(() => read('linechess-sound', 'on') !== 'off');
  const [music, setMusic] = useState(() => read('linechess-music', 'off') === 'on');
  const [theme, setTheme] = useState(() => read('vyuha-theme', 'dark'));
  const [cameraView, setCameraView] = useState(() => read('linechess-camera', 'isometric'));
  const [characterSet, setCharacterSet] = useState(() => read('linechess-3d-set', 'warrior'));
  const [formationKey, setFormationKey] = useState(0); const [formationActive, setFormationActive] = useState(false);
  const boardFen = study?.fen ?? fen; const boardMoves = study?.moves ?? moves;
  const game = useMemo(() => new Chess(boardFen), [boardFen]); const legal = selected ? game.moves({ square: selected, verbose: true }) : [];
  const reviewItems = review?.items ?? []; const boardStatus = study ? 'active' : status;
  const boardEvent = /^(Checkmate|Check!|Capture!|Time expired)/.test(notice) ? notice.split('. ')[0] : ''; const compactBoardEvent = /^Capture!/.test(notice);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!server.includes('YOUR_LAPTOP_WIFI_IP')) return;
    setServer(suggestedServer);
    localStorage.setItem('linechess-server', suggestedServer);
  }, [server]);
  useEffect(() => {
    const handleInstallPrompt = (event) => { event.preventDefault(); setInstallPrompt(event); };
    const handleInstalled = () => { setInstallPrompt(null); setToast('Senai Vyuham installed ✓'); };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', handleInstallPrompt); window.removeEventListener('appinstalled', handleInstalled); };
  }, []);

  const reset = (nextTimed = timed, nextMode = 'local') => {
    if (formationTimer.current) window.clearTimeout(formationTimer.current); formationTimer.current = null; setFormationActive(false);
    const online = nextMode === 'online'; setFen(freshFen); setMoves([]); setLastMove(null); setSelected(null); setStatus(online ? 'waiting' : 'active'); setResult(''); setClockStarted(false);
    setAnalysis(null); setReview(null); setStudy(null); setPromotion(null); setTimed(nextTimed); setClocks({ w: nextTimed, b: nextTimed }); setMode(nextMode); setGameId(null);
    setNotice(online ? 'Connect, then create a room or join a room code.' : 'White to move');
  };
  const playAgain = () => {
    reset(timed, 'local'); setThreeOpen(true); setFormationActive(true); setFormationKey((value) => value + 1); setNotice('Armies entering the board…');
    formationTimer.current = window.setTimeout(() => { setFormationActive(false); setNotice('White to move'); formationTimer.current = null; }, quality === 'low' ? 1900 : 2500);
  };
  const sync = (wire) => {
    const liveMoves = wire.history ?? []; setFen(wire.fen); setMoves(liveMoves); setLastMove(liveMoves.at(-1) ?? null); setGameId(wire.id); setStatus(wire.status); setResult(wire.result ?? '');
    setTimed(wire.time); setClocks(wire.clocks); setClockStarted(liveMoves.length > 0); setStudy(null); setSelected(null);
    setNotice(wire.status === 'waiting' ? `Share room ${wire.id} with a friend` : wire.status === 'finished' ? `Game finished - ${wire.result}` : `${wire.turn === 'w' ? 'White' : 'Black'} to move`);
  };
  const applyLocalMove = (from, to, variation = false, promotionType = 'q') => {
    const next = new Chess(boardFen);
    try {
      const move = next.move({ from, to, promotion: promotionType }); const nextMoves = [...boardMoves, move]; setLastMove(move); setSelected(null);
      if (variation) { setStudy((current) => ({ ...current, fen: next.fen(), moves: nextMoves })); setNotice('Variation active - keep exploring this line.'); }
      else { setFen(next.fen()); setMoves(nextMoves); setClockStarted(true); if (next.isGameOver()) { setStatus('finished'); setResult(next.isCheckmate() ? (next.turn() === 'w' ? '0-1' : '1-0') : '½-½'); } playEventTone(move, next); setNotice(moveMessage(move, next)); }
    } catch { setNotice('That move is not legal.'); }
  };
  useEffect(() => () => { socket.current?.disconnect(); if (reviewPoll.current) window.clearInterval(reviewPoll.current); if (formationTimer.current) window.clearTimeout(formationTimer.current); musicPlayer.current?.pause(); }, []);
  useEffect(() => { document.documentElement.dataset.boardSkin = boardSkin; localStorage.setItem('linechess-board-skin', boardSkin); }, [boardSkin]);
  useEffect(() => { document.documentElement.dataset.pieceSkin = pieceSkin; localStorage.setItem('linechess-piece-skin', pieceSkin); }, [pieceSkin]);
  useEffect(() => { localStorage.setItem('linechess-graphics', quality); }, [quality]);
  useEffect(() => { localStorage.setItem('linechess-coordinates', coordinates ? 'on' : 'off'); document.documentElement.dataset.coordinates = coordinates ? 'on' : 'off'; }, [coordinates]);
  useEffect(() => { localStorage.setItem('linechess-sound', sound ? 'on' : 'off'); }, [sound]);
  useEffect(() => { localStorage.setItem('linechess-music', music ? 'on' : 'off'); }, [music]);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('vyuha-theme', theme); }, [theme]);
  useEffect(() => {
    if (!settingsOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setSettingsOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [settingsOpen]);
  useEffect(() => {
    if (!music) { musicPlayer.current?.pause(); return; }
    const player = musicPlayer.current ?? new Audio(ambientMusicUrl);
    musicPlayer.current = player; player.loop = true; player.volume = .28;
    void player.play().catch(() => { setMusic(false); setNotice('Music needs a tap to start. Switch it on again.'); });
  }, [music]);
  const toggleMusic = () => {
    if (music) { musicPlayer.current?.pause(); setMusic(false); return; }
    const player = musicPlayer.current ?? new Audio(ambientMusicUrl);
    musicPlayer.current = player; player.loop = true; player.volume = .28;
    void player.play().then(() => setMusic(true)).catch(() => setNotice('Your browser blocked audio. Tap the page and try again.'));
  };
  useEffect(() => { localStorage.setItem('linechess-camera', cameraView); }, [cameraView]);
  useEffect(() => { localStorage.setItem('linechess-3d-set', characterSet); }, [characterSet]);
  useEffect(() => {
    if (study || formationActive || !timed || status !== 'active' || !clockStarted) return undefined;
    const tick = window.setInterval(() => setClocks((current) => {
      const side = new Chess(fen).turn(); const next = { ...current, [side]: Math.max(0, current[side] - 1) };
      if (!next[side] && mode === 'local') { setStatus('finished'); setResult(side === 'w' ? '0-1' : '1-0'); setNotice(`Time expired. ${side === 'w' ? 'Black' : 'White'} wins.`); } return next;
    }), 1000);
    return () => window.clearInterval(tick);
  }, [mode, timed, status, fen, study, formationActive, clockStarted]);
  useEffect(() => {
    if (!sound || !timed || status !== 'active' || study || !clockStarted) return;
    const side = new Chess(fen).turn(); const remaining = clocks[side];
    if (remaining > 60 || remaining <= 0) return;
    const key = `${side}:${remaining}:${moves.length}`;
    if (lastClockTick.current === key) return;
    lastClockTick.current = key;
    playClockTick(remaining <= 10);
  }, [clocks, sound, timed, status, study, fen, moves.length, clockStarted]);
  const connect = () => {
    const endpoint = server.trim().replace(/\/$/, ''); if (!endpoint) return setNotice('Enter the game server address first.');
    localStorage.setItem('linechess-server', endpoint); localStorage.setItem('linechess-name', name.trim()); socket.current?.disconnect(); setNotice('Connecting to server…');
    socket.current = io(endpoint, { auth: { token: read('linechess-token') }, timeout: 9000, reconnection: true });
    socket.current.on('connect', () => { setConnected(true); setNotice('Server connected. Create or join a room.'); });
    socket.current.on('disconnect', () => { setConnected(false); setNotice('Server disconnected. Retrying…'); });
    socket.current.on('connect_error', () => { setConnected(false); setNotice('Could not reach this server. Check its URL and CORS setting.'); });
    socket.current.on('identity', ({ token }) => localStorage.setItem('linechess-token', token)); socket.current.on('game:state', sync);
  };
  const openOnlineRoom = () => { reset(timed, 'online'); window.setTimeout(() => connect(), 0); };
  const createRoom = () => socket.current?.emit('game:create', { time: timed, increment: 0, color: 'random', playerName: name.trim() || 'Web player' }, (answer) => { if (!answer?.ok) return setNotice(answer?.error ?? 'Could not create room.'); setMode('online'); setPlayerColor(answer.color); setOrientation(answer.color); sync(answer.game); setToast(`Room ${answer.game.id} created ✓`); });
  const joinRoom = () => socket.current?.emit('game:join', { gameId: joinCode.trim().toUpperCase(), playerName: name.trim() || 'Web player' }, (answer) => { if (!answer?.ok) return setNotice(answer?.error ?? 'Could not join room.'); setMode('online'); setPlayerColor(answer.color); setOrientation(answer.color); sync(answer.game); });
  const shareRoomInvite = async () => {
    if (!gameId) return setNotice('Create a room first to generate an invite.');
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(gameId)}`;
    const inviteText = `Join my Senai Vyuham chess room (${gameId}): ${inviteUrl}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Join my Senai Vyuham room', text: inviteText, url: inviteUrl });
      else { await navigator.clipboard.writeText(inviteText); setToast('Invite link copied ✓'); }
    } catch (error) { if (error.name !== 'AbortError') setNotice('Could not share the room invite.'); }
  };
  const play = (from, to, promotionType = 'q') => {
    if (formationActive) return;
    if (study) return applyLocalMove(from, to, true, promotionType); if (status !== 'active') return;
    if (mode === 'online') { if (!gameId) return setNotice('Create a private room, or join the room code from your opponent.'); return socket.current?.emit('game:move', { gameId, from, to, promotion: promotionType }, (answer) => { if (!answer?.ok) setNotice(answer?.error ?? 'Move rejected'); }); }
    applyLocalMove(from, to, false, promotionType);
  };
  const offerDraw = () => {
    if (study || status !== 'active') return;
    if (mode === 'online') { if (!gameId) return setNotice('Create or join a room before offering a draw.'); return socket.current?.emit('game:draw:offer', { gameId }, (answer) => { if (!answer?.ok) setNotice(answer?.error ?? 'Could not offer draw.'); else setNotice('Draw offer sent.'); }); }
    setStatus('finished'); setResult('½-½'); setNotice('Draw agreed.');
  };
  const clickSquare = (square) => {
    if (formationActive) return;
    if (ignoreClick.current) { ignoreClick.current = false; return; }
    if (mode === 'online' && !study && !gameId) return setNotice('Create a private room, or join the room code from your opponent.');
    if (boardStatus !== 'active' || (!study && mode === 'online' && (game.turn() !== playerColor || status === 'waiting'))) return;
    const target = legal.find((move) => move.to === square); if (selected && target) { if (target.flags.includes('p')) { setPromotion({ from: selected, to: square, color: game.get(selected)?.color ?? 'w' }); setSelected(null); return; } return play(selected, square); }
    const piece = game.get(square); setSelected(piece?.color === game.turn() ? square : null);
  };
  useEffect(() => {
    const squareAt = (node) => node?.closest?.('.board .square')?.getAttribute('aria-label')?.slice(0, 2);
    const onDown = (event) => { if (event.pointerType === 'touch') return; const square = squareAt(event.target); if (square) dragStart.current = { square, x: event.clientX, y: event.clientY }; };
    const onUp = (event) => {
      const start = dragStart.current; dragStart.current = null;
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 10) return;
      const destination = squareAt(document.elementFromPoint(event.clientX, event.clientY)); if (!destination || destination === start.square) return;
      const atDrop = new Chess(boardFen); const piece = atDrop.get(start.square);
      const legalMove = piece?.color === atDrop.turn() ? atDrop.moves({ square: start.square, verbose: true }).find((move) => move.to === destination) : null;
      if (!legalMove) { setNotice('That move is not legal.'); return; }
      ignoreClick.current = true;
      if (legalMove.flags.includes('p')) { setPromotion({ from: start.square, to: destination, color: piece.color }); return; }
      play(start.square, destination);
    };
    document.addEventListener('pointerdown', onDown); document.addEventListener('pointerup', onUp);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('pointerup', onUp); };
  }, [boardFen, play]);
  const analysisRequest = async (path, options) => {
    const endpoint = server.trim().replace(/\/$/, '');
    if (!endpoint) throw new Error('Set an analysis server in Game setup first.');
    let response;
    try { response = await fetch(`${endpoint}${path}`, { ...options, signal: AbortSignal.timeout(18000) }); }
    catch { throw new Error(`Analysis server unavailable at ${endpoint}. Start the game server and retry.`); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Analysis server returned ${response.status}.`);
    return data;
  };
  const analysePosition = async () => {
    setThinking(true); setAnalysis(null); setAnalysisError('');
    try { setAnalysis(await analysisRequest('/analysis/position', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fen: boardFen, depth: 12, lines: 3 }) })); }
    catch (error) { setAnalysisError(error.message); setNotice(error.message); }
    finally { setThinking(false); }
  };
  const pollReview = async (id) => {
    try {
      const data = await analysisRequest(`/analysis/review/${id}`);
      if (data.status === 'failed') throw new Error(data.error || 'Review failed'); setReview(data);
      if (data.status === 'complete') { window.clearInterval(reviewPoll.current); reviewPoll.current = null; setReviewLoading(false); setNotice('Game review complete. Tap a move or chart point to explore it.'); window.requestAnimationFrame(() => document.querySelector('.review')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
      else setNotice(`Analysing ${data.completed ?? 0}/${data.total ?? moves.length} moves…`);
      return data.status;
    } catch (error) { window.clearInterval(reviewPoll.current); reviewPoll.current = null; setReviewLoading(false); setAnalysisError(error.message); setNotice(error.message); }
  };
  const analyseGame = async () => {
    const pgn = makePgn(moves); if (!pgn) return setNotice('Play at least one move before reviewing the game.');
    if (reviewPoll.current) window.clearInterval(reviewPoll.current);
    setReviewLoading(true); setReview(null); setStudy(null); setAnalysisError('');
    try { const data = await analysisRequest('/analysis/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pgn }) }); setNotice('Review queued. Senai Vyuham is checking every move...'); reviewPoll.current = window.setInterval(() => void pollReview(data.id), 1200); await pollReview(data.id); }
    catch (error) { window.clearInterval(reviewPoll.current); reviewPoll.current = null; setReviewLoading(false); setAnalysisError(error.message); setNotice(error.message); }
  };
  const shareAnalysis = async () => {
    if (review?.status !== 'complete' || sharePreparing) return;
    const white = review.items.filter((item) => item.ply % 2 === 1);
    const black = review.items.filter((item) => item.ply % 2 === 0);
    const whiteCounts = reviewQualityCounts(white); const blackCounts = reviewQualityCounts(black);
    const turning = review.items.filter((item) => ['inaccuracy', 'mistake', 'blunder'].includes(item.quality)).slice(0, 6);
    const pgn = makePgn(moves, result || '*');
    const countLine = (counts) => `Best ${counts.best || 0} | Excellent ${counts.excellent || 0} | Good ${counts.good || 0} | Inaccuracy ${counts.inaccuracy || 0} | Mistake ${counts.mistake || 0} | Blunder ${counts.blunder || 0}`;
    const message = `*SENAI VYUHAM*\n*GAME INTELLIGENCE REPORT*\n\n*Player 1 (You)* - White - ${reviewScore(white)}% accuracy\n${countLine(whiteCounts)}\n\n*Player 2 (Opponent)* - Black - ${reviewScore(black)}% accuracy\n${countLine(blackCounts)}\n\n*Result:* ${result || '*'}\n\n*Key moments*\n${turning.length ? turning.map((item) => `${Math.ceil(item.ply / 2)}${item.ply % 2 ? '.' : '...'} ${item.san} - ${qualityLabel[item.quality]}`).join('\n') : 'No major mistakes detected.'}\n\n*PGN move record*\n${pgn}\n\nShared from Senai Vyuham - Play closer. Understand every move.`;
    setSharePreparing(true);
    try {
      const imageBlob = await createReviewShareImage(review.items, moves, result, pgn);
      const file = imageBlob ? new File([imageBlob], 'senai-vyuham-game-review.png', { type: 'image/png' }) : null;
      setSharePreparing(false);
      if (navigator.share && file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'Senai Vyuham game review', text: message, files: [file] });
        setNotice('Review card shared with the PGN.');
      } else if (navigator.share) {
        await navigator.share({ title: 'Senai Vyuham game review', text: message });
      } else {
        await navigator.clipboard.writeText(message);
        setNotice('Game analysis copied to clipboard. Use Copy PGN for the move record.');
      }
    } catch (error) { if (error.name !== 'AbortError') setNotice('Could not share the review on this device.'); }
    finally { setSharePreparing(false); }
  };
  const copyRoomCode = async () => {
    if (!gameId) return;
    try { await navigator.clipboard.writeText(gameId); setToast('Room code copied!'); }
    catch { setNotice('Could not copy the room code.'); }
  };
  const copyCurrentPgn = async () => {
    const pgn = makePgn(moves, result || '*');
    if (!pgn) return setNotice('Play at least one move before copying PGN.');
    try { await navigator.clipboard.writeText(pgn); setNotice('Current game PGN copied to clipboard.'); setToast('PGN copied ✓'); }
    catch { setPgnDraft(pgn); setPgnOpen(true); setNotice('Clipboard access was blocked. Copy the PGN from the text box.'); }
  };
  const loadPgn = async () => {
    const source = pgnDraft.trim();
    if (!source) return setNotice('Paste a PGN first.');
    setPgnLoading(true);
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    try {
      const replay = new Chess(); replay.loadPgn(source);
      const loadedMoves = replay.history({ verbose: true });
      if (!loadedMoves.length) throw new Error('No moves found');
      setMode('local'); setFen(replay.fen()); setMoves(loadedMoves); setLastMove(loadedMoves.at(-1) ?? null); setStatus(replay.isGameOver() ? 'finished' : 'active'); setResult(replay.isCheckmate() ? (replay.turn() === 'w' ? '0-1' : '1-0') : replay.isDraw() ? '½-½' : ''); setStudy(null); setReview(null); setAnalysis(null); setSelected(null); setPgnOpen(false); setNotice(`Loaded ${loadedMoves.length} moves from PGN.`);
      setToast('PGN loaded ✓');
    } catch { setNotice('That PGN could not be loaded. Check the move notation and try again.'); setToast('Could not load PGN'); }
    finally { setPgnLoading(false); }
  };
  const supportDeveloper = () => {
    if (donationUrl) {
      window.open(donationUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setNotice('Thank you for supporting Senai Vyuham ❤️');
  };
  const openStudy = (item) => { const pastMoves = moves.slice(0, item.ply - 1); setStudy({ fen: item.before, moves: pastMoves, sourcePly: item.ply }); setSelected(null); setLastMove(pastMoves.at(-1) ?? null); setNotice(`${qualityLabel[item.quality]} on ${item.san}. Try another continuation from this position.`); };
  const showPly = (ply) => {
    const visibleMoves = moves.slice(0, Math.max(0, Math.min(moves.length, ply)));
    const replay = new Chess();
    visibleMoves.forEach((move) => { try { replay.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' }); } catch {} });
    setStudy({ fen: replay.fen(), moves: visibleMoves, sourcePly: visibleMoves.length });
    setSelected(null); setLastMove(visibleMoves.at(-1) ?? null);
    setNotice(visibleMoves.length ? `Viewing move ${visibleMoves.length} of ${moves.length}.` : 'Starting position.');
  };
  const clearBoardView = () => { setSelected(null); setAnalysis(null); setStudy(null); setLastMove(moves.at(-1) ?? null); setNotice('Board view cleared.'); };
  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setToast('Installing Senai Vyuham…');
    setInstallPrompt(null);
  };
  const stepStudy = (delta) => {
    if (!study || !reviewItems.length) return;
    const currentIndex = reviewItems.findIndex((item) => item.ply === study.sourcePly);
    const next = reviewItems[currentIndex + delta];
    if (next) openStudy(next);
  };
  const leaveStudy = () => { setStudy(null); setSelected(null); setLastMove(moves.at(-1) ?? null); setNotice('Returned to the real game position.'); };
  const order = orientation === 'w' ? { ranks: [8, 7, 6, 5, 4, 3, 2, 1], columns: [...files] } : { ranks: [1, 2, 3, 4, 5, 6, 7, 8], columns: [...files].reverse() };
  const topSide = orientation === 'w' ? 'b' : 'w'; const bottomSide = orientation;
  const playerName = (side) => mode === 'online' && playerColor === side ? `You · ${side === 'w' ? 'White' : 'Black'}` : side === 'w' ? 'White' : 'Black';
  const selectedReview = study ? reviewItems.find((item) => item.ply === study.sourcePly) : null;
  const best = study ? selectedReview?.best?.[0] ?? analysis?.lines?.[0] : analysis?.lines?.[0];
  const recommendationLines = study ? (selectedReview?.best ?? analysis?.lines ?? []) : (analysis?.lines ?? []);
  const suggestionArrows = (() => {
    const seen = new Set(); const arrows = recommendationLines.slice(0, 3).flatMap((line, index) => {
      const uci = line?.pv?.[0]; if (!uci || uci.length < 4) return [];
      const move = { from: uci.slice(0, 2), to: uci.slice(2, 4), rank: index + 1, color: index === 0 ? 'best' : index === 1 ? 'brilliant' : 'playable' };
      const key = `${move.from}-${move.to}`; if (seen.has(key)) return []; seen.add(key); return [move];
    });
    if (selectedReview && ['mistake', 'blunder'].includes(selectedReview.quality)) {
      try {
        const played = new Chess(selectedReview.before).moves({ verbose: true }).find((move) => move.san === selectedReview.san);
        if (played && !seen.has(`${played.from}-${played.to}`)) arrows.push({ from: played.from, to: played.to, color: 'wrong', rank: 0 });
      } catch {}
    }
    return arrows;
  })();
  const visibleSuggestionArrows = showAlternatives ? suggestionArrows : suggestionArrows.filter((arrow) => arrow.color === 'best' || (arrow.color === 'wrong' && study));
  const squarePoint = (square) => {
    const fileIndex = orientation === 'w' ? files.indexOf(square[0]) : 7 - files.indexOf(square[0]);
    const rankIndex = orientation === 'w' ? 8 - Number(square[1]) : Number(square[1]) - 1;
    return { x: (fileIndex + .5) * 12.5, y: (rankIndex + .5) * 12.5 };
  };
  const shortenArrow = (start, end, amount = 2.15) => {
    const dx = end.x - start.x; const dy = end.y - start.y; const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length; const uy = dy / length;
    return { start: { x: start.x + ux * amount, y: start.y + uy * amount }, end: { x: end.x - ux * amount, y: end.y - uy * amount } };
  };
  const reviewProgress = review?.total ? Math.min(100, Math.round((review.completed / review.total) * 100)) : 0;
  const checkmateKingSquare = game.isCheckmate() ? files.split('').flatMap((file) => order.ranks.map((rank) => `${file}${rank}`)).find((square) => { const piece = game.get(square); return piece?.type === 'k' && piece.color === game.turn(); }) : null;
  const cagePosition = checkmateKingSquare ? { col: order.columns.indexOf(checkmateKingSquare[0]), row: order.ranks.indexOf(Number(checkmateKingSquare[1])) } : null;
  return <CaptureContext.Provider value={boardMoves}><main className="app-shell">
    <section className="hero-split"><header className="topbar"><div className="brand"><img src={brandLogoUrl} alt="Senai Vyuham crest" width="256" height="256" decoding="async" fetchPriority="high" /><strong>SENAI VYUHAM</strong></div></header>
    {settingsOpen && <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}><section id="global-settings" className="global-settings card" role="dialog" aria-modal="true" aria-labelledby="global-settings-title">
      <div className="global-settings-heading"><div><p className="label">GLOBAL SETTINGS</p><h2 id="global-settings-title">Make the game yours</h2></div><button onClick={() => setSettingsOpen(false)} aria-label="Close settings" title="Close settings">×</button></div>
      <div className="global-settings-grid">
        <label>Theme<select value={theme} onChange={(event) => setTheme(event.target.value)}><option value="dark">Dark</option><option value="light">Light</option></select></label>
        <label>3D character set<select value={characterSet} onChange={(event) => setCharacterSet(event.target.value)}><option value="warrior">Kingdom</option><option value="family">Family Squad</option><option value="bharat">Bharat Guard</option><option value="frontier">Frontier Guard</option><option value="rangers">Ranger Corps</option><option value="redstar">Red Star Guard</option><option value="dragon">Dragon Guard</option><option value="lanka">Lanka Guard</option><option value="obsidian">Obsidian</option><option value="royal">Royal</option></select></label>
        <label>Camera view<select value={cameraView} onChange={(event) => setCameraView(event.target.value)}><option value="isometric">Angle</option><option value="top">Top</option><option value="side">Side</option><option value="cinematic">Cinema</option></select></label>
        <label>Graphics quality<select value={quality} onChange={(event) => setQuality(event.target.value)}><option value="low">Low</option><option value="medium">Balanced</option><option value="high">High</option></select></label>
        <label className="global-toggle"><input type="checkbox" checked={coordinates} onChange={(event) => setCoordinates(event.target.checked)}/> Board coordinates</label>
        <label className="global-toggle"><input type="checkbox" checked={sound} onChange={(event) => setSound(event.target.checked)}/> Board sounds and clock ticks</label>
        <label className="global-toggle"><input type="checkbox" checked={music} onChange={toggleMusic}/> Background music</label>
      </div><details><summary>Next release</summary><p>Connected board · AI coach · Ask an arbiter · Chess960 · Rapid and blitz · Tournaments</p></details>
    </section></div>}
    <section className="intro"><p>CHESS, WITHOUT THE DOWNLOAD</p><h1>Play closer to the board.<br />Understand every move.</h1><div>Play live, see the battle in 3D, and improve with AI insight - learning from every decision.</div></section></section>
    <AppearanceControls boardSkin={boardSkin} setBoardSkin={setBoardSkin} pieceSkin={pieceSkin} setPieceSkin={setPieceSkin} connected={connected} settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen}/>
    <section className={`workspace ${threeOpen ? 'with-3d' : ''}`}>
      <aside className="card controls"><p className="label">GAME SETUP</p><div className="tabs"><button className={mode === 'local' ? 'selected' : ''} onClick={() => reset(timed, 'local')}>On this device</button><button className={mode === 'online' ? 'selected' : ''} onClick={openOnlineRoom}>Online room</button></div>{mode === 'online' && <p className="online-steps"><b>1</b> Connect - <b>2</b> Create or enter a code - <b>3</b> Share the invite</p>}<label>TIME CONTROL<select value={timed} onChange={(event) => reset(Number(event.target.value), mode)}><option value="0">No timer</option><option value="300">5 minutes</option><option value="600">10 minutes</option></select></label>{mode === 'local' ? status === 'finished' ? null : <button className="primary" onClick={() => reset(timed, 'local')}>Start new game</button> : <><label>YOUR NAME<input value={name} maxLength="32" placeholder="Player name" onChange={(event) => setName(event.target.value)} /></label><details className="advanced-server"><summary>Advanced server settings</summary><label>GAME SERVER<input value={server} placeholder={suggestedServer} onChange={(event) => setServer(event.target.value)} /></label><p className="connection-hint">{isLocalHost ? <>For local testing on another device, replace <b>YOUR_LAPTOP_WIFI_IP</b> with your laptop IPv4 address and keep port <b>3001</b>.</> : <>The deployed HTTPS API is already selected. Change this only when testing another server.</>}</p></details><button className="secondary" onClick={connect}>{connected ? 'Reconnect server' : 'Connect server'}</button><p className="connection-hint">{connected ? 'Connected - room actions are ready.' : 'Connecting unlocks room creation and joining.'}</p><button className="primary" disabled={!connected} onClick={createRoom}>Create private room</button><label>JOIN ROOM CODE<input value={joinCode} maxLength="8" placeholder="A1B2C3D4" onChange={(event) => setJoinCode(event.target.value.toUpperCase())} /></label><button className="secondary" disabled={!connected || !joinCode} onClick={joinRoom}>Join room</button>{gameId && <div className="room-code"><small>ROOM CODE</small><div className="room-code-value"><strong>{gameId}</strong><button className="room-code-copy" onClick={copyRoomCode} aria-label="Copy room code" title="Copy room code"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h10v11H8z"/><path d="M6 16H4V5h10v2"/></svg></button></div><button onClick={shareRoomInvite}>Share invite link</button></div>}</>}</aside>
      <section className="game-area">
        {result && <div className="game-result" role="status">RESULT · {result}</div>}
        <Player color={topSide} name={playerName(topSide)} time={formatClock(clocks[topSide], timed)} seconds={clocks[topSide]} active={game.turn() === topSide && status === 'active'} />
        <div className={`board ${study ? 'study-board' : ''}`} role="grid" aria-label="Chess board">{order.ranks.flatMap((rank, row) => order.columns.map((file, col) => { const square = `${file}${rank}`; const piece = game.get(square); const target = legal.find((move) => move.to === square); const moved = lastMove?.to === square; return <button key={square} className={`square ${(row + col) % 2 ? 'dark' : 'light'} ${selected === square ? 'selected' : ''} ${lastMove?.from === square || moved ? 'last' : ''} ${target ? piece ? 'capture' : 'legal' : ''}`} onClick={() => clickSquare(square)} aria-label={square}><span className="rank">{col === 0 ? rank : ''}</span>{piece && <span className={`piece ${piece.color} ${moved ? 'arrive' : ''}`}>{glyph[piece.color][piece.type]}</span>}<span className="file">{row === 7 ? file : ''}</span></button>; }))}{visibleSuggestionArrows.length > 0 && <svg className="engine-arrow-layer" viewBox="0 0 100 100" aria-label="Engine move suggestions" role="img"><defs>{visibleSuggestionArrows.map((arrow) => <marker key={`marker-${arrow.from}-${arrow.to}`} id={`engine-arrow-head-${arrow.from}-${arrow.to}`} markerUnits="userSpaceOnUse" markerWidth="3.2" markerHeight="3.2" refX="2.55" refY="1.6" orient="auto"><path className={`arrow-head arrow-${arrow.color}`} d="M0,0 L3.2,1.6 L0,3.2 z" /></marker>)}</defs>{visibleSuggestionArrows.map((arrow) => { const points = shortenArrow(squarePoint(arrow.from), squarePoint(arrow.to)); return <line key={`${arrow.from}-${arrow.to}`} className={`engine-arrow arrow-${arrow.color}`} x1={points.start.x} y1={points.start.y} x2={points.end.x} y2={points.end.y} markerEnd={`url(#engine-arrow-head-${arrow.from}-${arrow.to})`} />; })}</svg>}{game.isCheckmate() && cagePosition && <div className="checkmate-cage" style={{ left: `${cagePosition.col * 12.5}%`, top: `${cagePosition.row * 12.5}%` }} aria-label="Checkmate: king arrested"><span className="cage-dome"/><span className="cage-chain">✦</span><span className="cage-king">♔</span></div>}{status === 'finished' && !game.isCheckmate() && <div className="draw-handshake" aria-label="Draw agreed"><span className="draw-king">♔</span><i className="handshake-glyph" aria-hidden="true"/><span className="draw-king">♚</span></div>}{status === 'finished' && game.isCheckmate() && <div className="victory-flourish" aria-label="Victory celebration">✦ ✿ ✦</div>}</div>
        {suggestionArrows.length > 0 && <div className="arrow-legend" aria-label="Engine arrow legend"><span><i/>Best move</span>{suggestionArrows.some((arrow) => arrow.color === 'brilliant') && <span><i className="blue"/>Brilliant alternative</span>}{suggestionArrows.some((arrow) => arrow.color === 'playable') && <span><i className="orange"/>Playable option</span>}{suggestionArrows.some((arrow) => arrow.color === 'wrong') && <span><i className="red"/>Played mistake</span>}{suggestionArrows.length > 1 && <button className="arrow-toggle" type="button" onClick={() => setShowAlternatives((value) => !value)}>{showAlternatives ? 'Hide alternatives' : 'Show alternatives'}</button>}</div>}<Player color={bottomSide} name={playerName(bottomSide)} time={formatClock(clocks[bottomSide], timed)} seconds={clocks[bottomSide]} active={game.turn() === bottomSide && status === 'active'} />
        <p className="notice" aria-live="polite">{notice}</p><div className="board-navigation" aria-label="Board navigation"><button className="tool-button tool-button-muted" onClick={clearBoardView}>Clear</button><button className="tool-button tool-button-reset" onClick={() => reset(timed, mode)}>Reset</button><button className="tool-button tool-button-nav" onClick={() => showPly(study ? study.sourcePly - 1 : moves.length - 1)} disabled={!moves.length || (study?.sourcePly ?? moves.length) <= 0}>← Back</button><button className="tool-button tool-button-nav" onClick={() => showPly(study ? study.sourcePly + 1 : moves.length)} disabled={!study || study.sourcePly >= moves.length}>Front →</button></div>{study && <div className="study-banner"><span>WHAT-IF LINE · move {study.sourcePly}</span><div className="study-controls"><button className="tool-button tool-button-nav" onClick={() => stepStudy(-1)} disabled={!reviewItems.some((item) => item.ply < study.sourcePly)} aria-label="Previous analysed move">← Previous</button><button className="tool-button tool-button-nav" onClick={() => stepStudy(1)} disabled={!reviewItems.some((item) => item.ply > study.sourcePly)} aria-label="Next analysed move">Next →</button><button className="tool-button tool-button-muted" onClick={leaveStudy}>Return to game</button></div></div>}
        <div className="board-actions"><button className="tool-button tool-button-ghost" onClick={() => setOrientation(orientation === 'w' ? 'b' : 'w')}>Flip board</button>{status === 'finished' && mode === 'local' ? <button className="primary" onClick={playAgain}>Play again</button> : <><button className="tool-button tool-button-danger" onClick={() => { if (mode === 'online' && gameId && !study) socket.current?.emit('game:resign', { gameId }); else if (!study) { setStatus('finished'); setResult(game.turn() === 'w' ? '0-1' : '1-0'); setNotice('You resigned.'); } }}>Resign</button><button className="tool-button tool-button-draw" onClick={offerDraw} disabled={status !== 'active' || Boolean(study) || formationActive}>Offer draw</button></>}</div>
      </section>
      <aside className="card analysis">
        <p className="label">ANALYSIS LAB</p><h2>Every move has a story.</h2><p className="subtle">Review the game and explore key moments.</p>
        <button className="primary" onClick={analyseGame} disabled={reviewLoading || !moves.length}>{reviewLoading ? `Analysing ${review?.completed ?? 0}/${review?.total ?? moves.length}` : 'Analyse full game'}</button>
        <button className="secondary" onClick={analysePosition} disabled={thinking}>{thinking ? 'Engine thinking…' : study ? 'Analyse variation position' : 'Analyse current position'}</button>
        {analysisError && <div className="analysis-error" role="alert">{analysisError}<button onClick={analyseGame} disabled={reviewLoading || !moves.length}>Retry review</button></div>}
        {best && <div className="engine-result"><div className="score">{best.whiteScore?.mate != null ? `M${best.whiteScore.mate}` : `${best.whiteScore?.cp >= 0 ? '+' : ''}${((best.whiteScore?.cp ?? 0) / 100).toFixed(2)}`}</div><span>White win chance: {best.whiteChance}%</span><p><b>Best continuation</b><br />{best.san?.join('  ')}</p>{recommendationLines.length > 1 && <div className="engine-lines" aria-label="Alternative engine continuations">{recommendationLines.slice(0, 3).map((line, index) => <div key={`${line.rank}-${line.pv?.[0]}`} className={`engine-line engine-line-${index === 0 ? 'best' : index === 1 ? 'brilliant' : 'playable'}`}><b>{index === 0 ? 'Best' : index === 1 ? 'Brilliant alternative' : 'Playable option'}</b><span>{line.san?.slice(0, 3).join('  ')}</span></div>)}</div>}</div>}
        {reviewLoading && <div className="analysis-progress"><div className="analysis-progress-head"><strong>Reviewing moves</strong><span>{reviewProgress}%</span></div><div className="progress-track"><i style={{ width: `${Math.max(4, reviewProgress)}%` }} /></div><small>Senai Vyuham is evaluating each position. You can keep this page open.</small></div>}
        {review?.status === 'complete' && <><ChartGameReview items={reviewItems} onOpen={openStudy} /><button className="secondary share-review" onClick={shareAnalysis} disabled={sharePreparing}>{sharePreparing && <span className="button-spinner" aria-hidden="true"/>}{sharePreparing ? 'Preparing report...' : 'Share game analysis'}</button></>}
        <div className="history"><div className="history-heading"><p className="label">MOVE HISTORY</p><div className="pgn-actions"><button className="tool-button tool-button-pgn tool-button-copy" onClick={copyCurrentPgn} disabled={!moves.length}>Copy PGN</button><button className="tool-button tool-button-pgn tool-button-paste" onClick={() => { setPgnDraft(''); setPgnOpen(true); }}>Paste PGN</button></div></div>{moves.length ? <div className="moves">{moves.map((move, index) => <button key={`${move.san}-${index}`} data-side={index % 2 === 0 ? 'white' : 'black'} aria-label={`${index % 2 === 0 ? 'White' : 'Black'} move ${move.san}`} className={reviewItems[index] ? qualityClass(reviewItems[index].quality) : ''} onClick={() => reviewItems[index] && openStudy(reviewItems[index])}>{index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ''}{move.san}</button>)}</div> : <p className="subtle">Your moves will appear here.</p>}</div>
      </aside><DeferredThreeBoard open={threeOpen} onOpenChange={setThreeOpen} fen={boardFen} moves={boardMoves} lastMove={lastMove} status={boardStatus} result={result} orientation={orientation} onMove={play} onPromote={(from, to, color) => setPromotion({ from, to, color })} quality={quality} coordinates={coordinates} sound={sound} view={cameraView} characterSet={characterSet} formationKey={formationKey} formationActive={formationActive}/>
    </section>{boardEvent && <div className={`board-event ${compactBoardEvent ? 'compact' : ''}`} key={notice}>{compactBoardEvent ? boardEvent.replace(/^Capture!\s*/, '').replace(/\.$/, '') : boardEvent}</div>}{promotion && <PromotionPicker color={promotion.color} onChoose={(type) => { play(promotion.from, promotion.to, type); setPromotion(null); }} onCancel={() => setPromotion(null)} />}{sharePreparing && <div className="share-preparing" role="status" aria-live="polite" aria-busy="true"><div><img src={brandLogoUrl} alt=""/><span className="share-spinner" aria-hidden="true"/><strong>Preparing your game report</strong><small>Getting it ready to share with friends and family.</small></div></div>}{pgnOpen && <div className="pgn-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pgnLoading) setPgnOpen(false); }}><section className="pgn-dialog" role="dialog" aria-modal="true" aria-labelledby="pgn-dialog-title" aria-busy={pgnLoading}><div className="pgn-dialog-heading"><div><p className="label">PGN TOOLS</p><h2 id="pgn-dialog-title">Copy or paste a game</h2></div><button onClick={() => setPgnOpen(false)} aria-label="Close PGN dialog" disabled={pgnLoading}>×</button></div><textarea value={pgnDraft} onChange={(event) => setPgnDraft(event.target.value)} placeholder="Paste PGN here..." aria-label="PGN text" disabled={pgnLoading}/><div className="pgn-dialog-actions"><button className="secondary" onClick={() => setPgnOpen(false)} disabled={pgnLoading}>Cancel</button><button className="primary" onClick={loadPgn} disabled={pgnLoading}>{pgnLoading && <span className="pgn-loading-spinner" aria-hidden="true"/>}{pgnLoading ? 'Loading PGN...' : 'Load PGN'}</button></div></section></div>}{toast && <div className="app-toast" role="status" aria-live="polite">{toast}</div>}<footer className="site-footer"><span>© {new Date().getFullYear()} - Developed by <a href={developerProfileUrl} target="_blank" rel="noreferrer">Master Dhaneshvar Maha</a> - Built with love for chess players and enthusiasts</span><div className="footer-actions">{installPrompt && <button className="install-app-button" onClick={installApp}>Install app</button>}<button className="donate-link" type="button" onClick={supportDeveloper} aria-label="Donate to support development">♥ Donate</button></div></footer>
  </main></CaptureContext.Provider>;
}
function DeferredThreeBoard(props) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const schedule = window.requestIdleCallback ? window.requestIdleCallback(() => setReady(true), { timeout: 1600 }) : window.setTimeout(() => setReady(true), 750);
    return () => window.requestIdleCallback ? window.cancelIdleCallback(schedule) : window.clearTimeout(schedule);
  }, []);
  return <div className="three-deferred">{ready ? <Suspense fallback={<ThreeBoardSkeleton />}><WebThreeBoard {...props}/></Suspense> : <ThreeBoardSkeleton onLoad={() => setReady(true)} />}</div>;
}
function ThreeBoardSkeleton({ onLoad }) { return <section className="three-skeleton" aria-busy="true"><div><p className="label">IMMERSIVE BOARD</p><h3>Preparing the 3D board</h3><p>Loading character details after the playable board so moves stay quick on slower connections.</p>{onLoad && <button onClick={onLoad}>Load 3D now</button>}</div><i /><span>Optimized for your connection</span></section>; }
function Player({ color, name, time, seconds, active }) {
  const moves = useContext(CaptureContext); const captured = capturedBy(moves, color); const lead = materialLead(moves, color);
  const urgency = active && seconds > 0 && seconds <= 10 ? 'critical' : active && seconds > 0 && seconds <= 30 ? 'danger' : active && seconds > 0 && seconds <= 60 ? 'warning' : '';
  return <div className={`player ${active ? 'active' : ''}`}><span className={`disc ${color}`}></span><span className="player-name">{name}</span><span className="captured" aria-label={`${captured.length} opposing pieces captured`}>{captured.map((piece, index) => <i key={`${piece.color}-${piece.type}-${index}`} className={piece.color}>{glyph[piece.color][piece.type]}</i>)}{lead > 0 && <b className="material-lead" title="Material advantage">+{lead}</b>}</span><strong className={`player-clock ${urgency}`}>{time}</strong></div>;
}
function PromotionPicker({ color, onChoose, onCancel }) { return <div className="promotion-modal" role="dialog" aria-modal="true"><div><p>Promote your pawn</p><section>{['q', 'r', 'b', 'n'].map((type) => <button key={type} onClick={() => onChoose(type)}><span className={color}>{glyph[color][type]}</span><small>{pieceName[type]}</small></button>)}</section><button className="cancel-promotion" onClick={onCancel}>Cancel</button></div></div>; }
function AppearanceControls({ boardSkin, setBoardSkin, pieceSkin, setPieceSkin, connected, settingsOpen, setSettingsOpen }) { return <section className="appearance-controls" aria-label="Board appearance and quick actions"><div className="playing-set-copy"><p className="label">PLAYING SET</p><h3>Make the board yours</h3><p>Change the classic board and piece finish at any time.</p></div><div className="playing-set-actions"><span className="online-status"><i className="online-dot" data-online={connected}></i>{connected ? 'SERVER CONNECTED' : 'PLAY IN BROWSER'}</span><button className="global-settings-trigger" onClick={() => setSettingsOpen((value) => !value)} aria-expanded={settingsOpen} aria-controls="global-settings">⚙ <span>Settings</span></button></div><div className="appearance-choice"><span>Board</span>{[['classic', 'Classic'], ['walnut', 'Walnut'], ['ocean', 'Ocean']].map(([key, label]) => <button key={key} className={boardSkin === key ? 'on' : ''} onClick={() => setBoardSkin(key)}>{label}</button>)}</div><div className="appearance-choice"><span>Pieces</span>{[['classic', 'Ivory'], ['onyx', 'Onyx'], ['gold', 'Gold']].map(([key, label]) => <button key={key} className={pieceSkin === key ? 'on' : ''} onClick={() => setPieceSkin(key)}>{label}</button>)}</div></section>; }
function ChartGameReview({ items, onOpen }) {
  const canvasRef = useRef(null); const chartRef = useRef(null); const [chartError, setChartError] = useState(''); const [expanded, setExpanded] = useState(false);
  const white = items.filter((item) => item.ply % 2 === 1); const black = items.filter((item) => item.ply % 2 === 0);
  const summary = (side) => ({ accuracy: Math.max(0, Math.round(100 - side.reduce((sum, item) => sum + item.loss, 0) / Math.max(1, side.length))), counts: side.reduce((all, item) => ({ ...all, [item.quality]: (all[item.quality] || 0) + 1 }), {}) });
  const whiteSummary = summary(white); const blackSummary = summary(black); const turning = items.filter((item) => ['mistake', 'blunder', 'inaccuracy'].includes(item.quality));
  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const canvas = canvasRef.current;
    chartRef.current?.destroy();
    setChartError('');
    let cancelled = false;
    let frame = 0;
    const render = async () => {
      try {
        const { CategoryScale, Chart, Filler, LineController, LineElement, LinearScale, PointElement, Tooltip } = await import('chart.js');
        if (cancelled) return;
        Chart.register(CategoryScale, LinearScale, PointElement, LineController, LineElement, Filler, Tooltip);
        const chart = new Chart(canvas, { type: 'line', data: { labels: items.map((item) => `${Math.ceil(item.ply / 2)}${item.ply % 2 ? 'W' : 'B'}`), datasets: [{ label: 'White win chance', data: items.map((item) => item.actual?.whiteChance ?? 50), borderColor: '#c9ff82', backgroundColor: 'rgba(184,243,106,.14)', fill: true, borderWidth: 3, pointRadius: 5, pointHoverRadius: 8, pointBorderWidth: 2, pointBorderColor: '#0d1510', pointBackgroundColor: items.map((item) => item.quality === 'blunder' ? '#ed7570' : item.quality === 'mistake' ? '#f09a58' : item.quality === 'inaccuracy' ? '#e6c25c' : '#f8f3e9'), tension: .28 }] }, options: { responsive: true, maintainAspectRatio: false, animation: { duration: 550, easing: 'easeOutQuart' }, interaction: { intersect: false, mode: 'index' }, scales: { x: { grid: { display: false }, ticks: { color: '#9bac9d', maxTicksLimit: 12, font: { size: 9 } } }, y: { min: 0, max: 100, ticks: { color: '#9bac9d', callback: (value) => `${value}%`, maxTicksLimit: 5, font: { size: 9 } }, grid: { color: '#304335' } } }, plugins: { legend: { display: false }, tooltip: { displayColors: false, backgroundColor: '#111a13', borderColor: '#b8f36a', borderWidth: 1, callbacks: { title: (context) => { const item = items[context?.[0]?.dataIndex ?? 0]; return item ? `${item.ply % 2 ? 'White' : 'Black'} · ${item.san}` : ''; }, label: (context) => `${context.parsed.y}% white win chance`, afterLabel: (context) => { const item = items[context?.dataIndex ?? 0]; return item ? `Quality: ${qualityLabel[item.quality]} · click to explore` : ''; } } } }, onClick: (_event, elements) => { const point = elements?.[0]; if (point && items[point.index]) onOpen(items[point.index]); } } });
        chartRef.current = chart;
      } catch (error) { console.error('Review chart failed to render', error); setChartError(error instanceof Error ? error.message : 'Chart initialization failed'); }
    };
    frame = requestAnimationFrame(() => { void render(); });
    return () => { cancelled = true; cancelAnimationFrame(frame); chartRef.current?.destroy(); chartRef.current = null; };
  }, [items]);
  useEffect(() => { const frame = requestAnimationFrame(() => chartRef.current?.resize()); return () => cancelAnimationFrame(frame); }, [expanded]);
  return <section className="review"><div className="review-heading"><div><p className="label">GAME REVIEW - EVALUATION</p><h3>Accuracy by move</h3></div><span>{items.length} moves checked</span></div><div className="accuracy-grid"><Accuracy side="White" value={whiteSummary.accuracy} counts={whiteSummary.counts} /><Accuracy side="Black" value={blackSummary.accuracy} counts={blackSummary.counts} /></div><div className={`chart-stage ${expanded ? 'expanded' : ''}`} role={expanded ? 'dialog' : undefined} aria-modal={expanded ? 'true' : undefined} aria-label={expanded ? 'Expanded game evaluation graph' : undefined}><div className="chart-stage-heading"><div><strong>Engine evaluation</strong><small>Tap any point to inspect that position</small></div><button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? 'Close large graph' : 'View large graph'}>{expanded ? 'Close' : 'View large graph'}</button></div><div className="chart-wrap chartjs-wrap"><canvas ref={canvasRef} aria-label="Interactive Chart.js evaluation graph" />{chartError && <div className="chart-fallback chart-fallback-overlay">Chart unavailable - use the turning points below.<small>{chartError}</small></div>}</div><div className="chart-footer"><span>Move 1</span><span>White win chance</span><span>Move {items.length}</span></div></div><div className="turning-points"><p className="label">TURNING POINTS</p>{turning.length ? turning.map((item) => <button key={item.ply} className={`review-move ${qualityClass(item.quality)}`} onClick={() => onOpen(item)}><span>{Math.ceil(item.ply / 2)}{item.ply % 2 ? '. White' : '... Black'} - {item.san}</span><b>{qualityLabel[item.quality]}</b></button>) : <p className="subtle">No major mistakes detected.</p>}</div></section>;
}

function GameReview({ items, onOpen }) {
  const [activePly, setActivePly] = useState(null);
  const white = items.filter((item) => item.ply % 2 === 1); const black = items.filter((item) => item.ply % 2 === 0);
  const summary = (side) => ({ accuracy: Math.max(0, Math.round(100 - side.reduce((sum, item) => sum + item.loss, 0) / Math.max(1, side.length))), counts: side.reduce((all, item) => ({ ...all, [item.quality]: (all[item.quality] || 0) + 1 }), {}) });
  const whiteSummary = summary(white); const blackSummary = summary(black);
  const x = (index) => items.length === 1 ? 50 : 4 + (index / (items.length - 1)) * 92; const y = (item) => 96 - ((item.actual?.whiteChance ?? 50) / 100) * 92;
  const points = items.map((item, index) => `${x(index)},${y(item)}`).join(' ');
  const turning = items.filter((item) => ['mistake', 'blunder', 'inaccuracy'].includes(item.quality));
  const active = items.find((item) => item.ply === activePly);
  return <section className="review"><div className="review-heading"><p className="label">GAME REVIEW · EVALUATION</p><span>{items.length} plies checked · tap a point to jump</span></div><div className="accuracy-grid"><Accuracy side="White" value={whiteSummary.accuracy} counts={whiteSummary.counts} /><Accuracy side="Black" value={blackSummary.accuracy} counts={blackSummary.counts} /></div><div className="chart-wrap"><div className="chart-labels"><span>White advantage</span><span>Black advantage</span></div><div className="chart-axis"><span>+100%</span><span>0</span><span>−100%</span></div><svg viewBox="0 0 100 100" className="chance-chart" aria-label="Interactive white win chance by move"><defs><linearGradient id="review-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b8f36a" stopOpacity=".38"/><stop offset="1" stopColor="#b8f36a" stopOpacity=".03"/></linearGradient></defs><line className="chart-zero" x1="0" y1="50" x2="100" y2="50" /><line x1="0" y1="25" x2="100" y2="25" /><line x1="0" y1="75" x2="100" y2="75" /><polygon className="chart-area" points={`0,50 ${points} 100,50`} /><polyline points={points} /></svg><div className="chart-points">{items.map((item, index) => <button key={item.ply} className={qualityClass(item.quality)} data-active={activePly === item.ply} style={{ left: `${x(index)}%`, top: `${y(item)}%` }} aria-label={`Move ${item.ply}, ${item.san}, ${qualityLabel[item.quality]}`} title={`${item.san}: ${qualityLabel[item.quality]}`} onMouseEnter={() => setActivePly(item.ply)} onFocus={() => setActivePly(item.ply)} onMouseLeave={() => setActivePly(null)} onBlur={() => setActivePly(null)} onClick={() => onOpen(item)} />)}</div>{active && <div className="chart-tooltip"><strong>{Math.ceil(active.ply / 2)}{active.ply % 2 ? '. White' : '… Black'} · {active.san}</strong><span>{qualityLabel[active.quality]} · {active.actual?.whiteChance ?? 50}% white win chance</span><small>Click to explore this position</small></div>}</div><div className="chart-footer"><span>Move 1</span><span>Each point is an engine-evaluated position</span><span>Move {items.length}</span></div><div className="turning-points"><p className="label">TURNING POINTS · TAP TO EXPLORE</p>{turning.length ? turning.map((item) => <button key={item.ply} className={`review-move ${qualityClass(item.quality)}`} onClick={() => onOpen(item)}><span>{Math.ceil(item.ply / 2)}{item.ply % 2 ? '. White' : '… Black'} · {item.san}</span><b>{qualityLabel[item.quality]}</b><small>{item.loss}% chance lost · click to open the position</small></button>) : <p className="subtle">No material mistakes detected at this engine depth.</p>}</div></section>;
}
function Accuracy({ side, value, counts }) { return <div className="accuracy"><span>{side}</span><strong>{value}%</strong><small>Accuracy</small><div>{['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'].filter((quality) => counts[quality]).map((quality) => <em key={quality} className={qualityClass(quality)}>{counts[quality]} {qualityLabel[quality]}</em>)}</div></div>; }
createRoot(document.getElementById('root')).render(<App />);
window.requestAnimationFrame(() => {
  document.body.classList.add('app-ready');
  window.setTimeout(() => document.getElementById('startup-loader')?.remove(), 180);
});
