import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, Move, Square } from 'chess.js';
import { io, Socket } from 'socket.io-client';
import * as Haptics from 'expo-haptics';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { setSetting, setting, saveGame } from '../lib/storage';
import { GameMode, Result, Side, WireGame } from '../lib/types';
import { GraphicsQuality, ThreeCameraPreset, ThreePieceStyle } from '../lib/preferences';
import { boardThemes, BoardTheme, PieceFinish } from '../ui/theme';

const threePieceStyles: Record<ThreePieceStyle, true> = { warrior: true, family: true, bharat: true, frontier: true, rangers: true, redstar: true, dragon: true, lanka: true, obsidian: true, royal: true };

type Setup = { time: number; increment: number; color: 'w' | 'b' | 'random'; name?: string };
type Ack = { ok: boolean; error?: string; color?: Side; game?: WireGame };
type GameContextValue = {
  fen: string; pgn: string; moves: Move[]; turn: Side; status: 'idle' | 'waiting' | 'active' | 'finished';
  mode: GameMode; orientation: Side; playerColor: Side; gameId: string | null; lastRoomId: string | null;
  whiteTime: number; blackTime: number; time: number; increment: number;
  result: Result; reason: string; apiUrl: string; haptics: boolean; sound: boolean; music: boolean; showCoordinates: boolean; graphicsQuality: GraphicsQuality; cameraPreset: ThreeCameraPreset; boardTheme: BoardTheme; pieceFinish: PieceFinish; threePieceStyle: ThreePieceStyle;
  serverConnected: boolean; onlinePlayers: WireGame['players'] | null;
  startLocal: (setup: Setup) => void; createRoom: (setup: Setup) => Promise<string>; joinRoom: (roomId: string, playerName?: string) => Promise<void>; leaveRoom: () => Promise<void>; rejoinRoom: () => Promise<void>;
  play: (from: Square, to: Square, promotion?: string) => Promise<boolean>; resign: () => void; offerDraw: () => void;
  setApiUrl: (url: string) => void; setHaptics: (enabled: boolean) => void; setSound: (enabled: boolean) => void; setMusic: (enabled: boolean) => void; setShowCoordinates: (enabled: boolean) => void; setGraphicsQuality: (quality: GraphicsQuality) => void; setCameraPreset: (preset: ThreeCameraPreset) => void; setBoardTheme: (theme: BoardTheme) => void; setPieceFinish: (finish: PieceFinish) => void; setThreePieceStyle: (style: ThreePieceStyle) => void;
  flip: () => void;
};
const Context = createContext<GameContextValue | null>(null);
const boardSnapshot = (game: Chess) => ({ fen: game.fen(), pgn: game.pgn(), moves: game.history({ verbose: true }), turn: game.turn() });

export function GameProvider({ children }: { children: React.ReactNode }) {
  const chess = useRef(new Chess());
  const socket = useRef<Socket | null>(null);
  const token = useRef<string | null>(null);
  const onlineRoom = useRef<string | null>(null);
  const lastTick = useRef(0);
  const savedId = useRef<string | null>(null);
  const lastSound = useRef({ id: '', count: 0 });
  const lastClockSound = useRef('');
  const moveAudio = useAudioPlayer(require('../../assets/sounds/move.wav'));
  const clockAudio = useAudioPlayer(require('../../assets/sounds/move.wav'));
  const captureAudio = useAudioPlayer(require('../../assets/sounds/capture.wav'));
  const checkAudio = useAudioPlayer(require('../../assets/sounds/check.wav'));
  const musicAudio = useAudioPlayer(require('../../assets/sounds/ambient.wav'));
  const [boardState, setBoardState] = useState(() => boardSnapshot(new Chess()));
  const [mode, setMode] = useState<GameMode>('local');
  const [orientation, setOrientation] = useState<Side>('w');
  const [playerColor, setPlayerColor] = useState<Side>('w');
  const [gameId, setGameId] = useState<string | null>(null);
  const [lastRoomId, setLastRoomId] = useState<string | null>(null);
  const [status, setStatus] = useState<GameContextValue['status']>('idle');
  const [time, setTime] = useState(600);
  const [increment, setIncrement] = useState(0);
  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  const [result, setResult] = useState<Result>('*');
  const [reason, setReason] = useState('');
  const [apiUrlState, setApiUrlState] = useState(process.env.EXPO_PUBLIC_API_URL ?? '');
  const [hapticsState, setHapticsState] = useState(true);
  const [soundState, setSoundState] = useState(true);
  const [musicState, setMusicState] = useState(false);
  const [showCoordinates, setShowCoordinatesState] = useState(true);
  const [graphicsQuality, setGraphicsQualityState] = useState<GraphicsQuality>('medium');
  const [cameraPreset, setCameraPresetState] = useState<ThreeCameraPreset>('angle');
  const [boardTheme, setBoardThemeState] = useState<BoardTheme>('ivory');
  const [pieceFinish, setPieceFinishState] = useState<PieceFinish>('ivory');
  const [threePieceStyle, setThreePieceStyleState] = useState<ThreePieceStyle>('warrior');
  const [serverConnected, setServerConnected] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [onlinePlayers, setOnlinePlayers] = useState<WireGame['players'] | null>(null);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  useEffect(() => {
    // expo-audio exposes playback configuration as mutable native player properties.
    // eslint-disable-next-line react-hooks/immutability
    musicAudio.loop = true; musicAudio.volume = .12;
    if (musicState) musicAudio.play(); else musicAudio.pause();
  }, [musicState, musicAudio]);
  useEffect(() => {
    // A short, softer click makes the last minute audible without masking moves.
    // eslint-disable-next-line react-hooks/immutability
    clockAudio.volume = .12;
  }, [clockAudio]);
  useEffect(() => {
    if (!soundState || status !== 'active' || time === 0) return;
    const side = boardState.turn;
    const remaining = side === 'w' ? whiteTime : blackTime;
    if (remaining <= 0 || remaining > 60) return;
    const key = `${side}:${remaining}:${boardState.moves.length}`;
    if (lastClockSound.current === key) return;
    lastClockSound.current = key;
    void clockAudio.seekTo(0).then(() => clockAudio.play()).catch(() => {});
  }, [soundState, status, time, boardState.turn, boardState.moves.length, whiteTime, blackTime, clockAudio]);

  useEffect(() => {
    const count = boardState.moves.length;
    if (!gameId || lastSound.current.id !== gameId) { lastSound.current = { id: gameId ?? '', count }; return; }
    if (count <= lastSound.current.count) return;
    lastSound.current.count = count;
    const move = boardState.moves.at(-1);
    if (hapticsState) void Haptics.impactAsync(move?.flags.includes('c') || move?.flags.includes('e') ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (!soundState) return;
    const player = move?.san.includes('+') || move?.san.includes('#') ? checkAudio : move?.flags.includes('c') || move?.flags.includes('e') ? captureAudio : moveAudio;
    void player.seekTo(0).then(() => player.play()).catch(() => {});
    if (move?.san.includes('#')) { Speech.stop(); Speech.speak(`Checkmate. ${move.color === 'w' ? 'White' : 'Black'} wins.`, { rate: .95 }); }
    else if (move?.san.includes('+')) { Speech.stop(); Speech.speak(`Check. ${move.color === 'w' ? 'Black' : 'White'} to move.`, { rate: .95 }); }
    else if (move?.flags.includes('c') || move?.flags.includes('e')) { Speech.stop(); Speech.speak(`Capture. ${move.color === 'w' ? 'White' : 'Black'} to move.`, { rate: .95 }); }
  }, [boardState, gameId, soundState, hapticsState, moveAudio, captureAudio, checkAudio]);

  useEffect(() => {
    void Promise.all([setting('apiUrl'), setting('haptics'), setting('sound'), setting('music'), setting('showCoordinates'), setting('graphicsQuality'), setting('cameraPreset'), setting('token'), setting('boardTheme'), setting('pieceFinish'), setting('threePieceStyle')]).then(([url, h, s, music, coordinateValue, quality, cameraValue, identity, theme, finish, threeStyle]) => {
      if (url) setApiUrlState(url);
      if (h) setHapticsState(h === 'true');
      if (s) setSoundState(s === 'true');
      if (music) setMusicState(music === 'true');
      if (coordinateValue) setShowCoordinatesState(coordinateValue === 'true');
      if (quality === 'low' || quality === 'medium' || quality === 'high') setGraphicsQualityState(quality);
      if (cameraValue === 'angle' || cameraValue === 'top' || cameraValue === 'side' || cameraValue === 'cinema') setCameraPresetState(cameraValue);
      token.current = identity;
      if (theme && theme in boardThemes) setBoardThemeState(theme as BoardTheme);
      if (finish === 'ivory' || finish === 'onyx' || finish === 'gold') setPieceFinishState(finish);
      if (threeStyle && threeStyle in threePieceStyles) setThreePieceStyleState(threeStyle as ThreePieceStyle);
    }).catch(() => {}).finally(() => setSettingsReady(true));
  }, []);

  const sync = useCallback((wire: WireGame) => {
    const next = new Chess();
    if (wire.pgn) next.loadPgn(wire.pgn);
    chess.current = next;
    onlineRoom.current = wire.id;
    setBoardState(boardSnapshot(next));
    setGameId(wire.id); setLastRoomId(wire.id); setStatus(wire.status); setResult(wire.result ?? '*'); setReason(wire.reason ?? '');
    setTime(wire.time); setIncrement(wire.increment);
    setWhiteTime(wire.clocks.w); setBlackTime(wire.clocks.b); setOnlinePlayers(wire.players);
  }, []);
  useEffect(() => {
    if (!settingsReady || !apiUrlState) return;
    const client = io(apiUrlState, { autoConnect: true, reconnection: true, auth: { token: token.current }, timeout: 8000 });
    socket.current = client;
    client.on('connect', () => { setServerConnected(true); const room = onlineRoom.current; if (room) client.emit('game:join', { gameId: room }, (ack: Ack) => { if (ack.ok && ack.game) sync(ack.game); }); });
    client.on('disconnect', () => setServerConnected(false));
    client.on('identity', ({ token: value }: { token: string }) => { token.current = value; void setSetting('token', value); });
    client.on('game:state', sync);
    return () => { client.disconnect(); socket.current = null; setServerConnected(false); };
  }, [apiUrlState, settingsReady, sync]);

  useEffect(() => {
    if (status !== 'active' || time === 0) return;
    lastTick.current = Date.now();
    const timer = setInterval(() => {
      const now = Date.now(); const elapsed = Math.floor((now - lastTick.current) / 1000);
      if (elapsed < 1) return;
      lastTick.current += elapsed * 1000;
      if (chess.current.turn() === 'w') setWhiteTime((value) => Math.max(0, value - elapsed));
      else setBlackTime((value) => Math.max(0, value - elapsed));
    }, 250);
    return () => clearInterval(timer);
  }, [status, time, boardState.fen]);
  useEffect(() => {
    if (mode !== 'local' || status !== 'active' || time === 0) return;
    if (whiteTime === 0 || blackTime === 0) {
      const timer = setTimeout(() => { setResult(whiteTime === 0 ? '0-1' : '1-0'); setReason('timeout'); setStatus('finished'); }, 0);
      return () => clearTimeout(timer);
    }
  }, [whiteTime, blackTime, mode, status, time]);
  useEffect(() => {
    if (status !== 'finished' || !gameId || savedId.current === gameId || !boardState.moves.length) return;
    savedId.current = gameId;
    void saveGame({ id: gameId, createdAt: new Date().toISOString(), mode, pgn: boardState.pgn, result, reason,
      white: onlinePlayers?.w?.name ?? 'White', black: onlinePlayers?.b?.name ?? 'Black' }).catch(() => { savedId.current = null; });
  }, [status, gameId, mode, result, reason, boardState, onlinePlayers]);

  const setupLocal = useCallback((setup: Setup) => {
    chess.current = new Chess(); savedId.current = null;
    onlineRoom.current = null;
    const side = setup.color === 'random' ? (Math.random() < .5 ? 'w' : 'b') : setup.color;
    const id = `local-${Date.now()}`;
    lastSound.current = { id, count: 0 };
    setMode('local'); setOrientation(side); setPlayerColor(side); setGameId(id);
    setStatus('active'); setResult('*'); setReason(''); setTime(setup.time); setIncrement(setup.increment);
    setWhiteTime(setup.time); setBlackTime(setup.time); setOnlinePlayers(null);
    setBoardState(boardSnapshot(chess.current));
  }, []);
  const online = useCallback(async (event: 'game:create' | 'game:join', payload: object) => {
    const client = socket.current;
    if (!client?.connected) throw new Error('Cannot reach the server. Check its address in Settings.');
    const ack = await client.timeout(10000).emitWithAck(event, payload) as Ack;
    if (!ack.ok || !ack.game || !ack.color) throw new Error(ack.error ?? 'Could not join game');
    setMode('online'); setPlayerColor(ack.color); setOrientation(ack.color); sync(ack.game);
    return ack.game.id;
  }, [sync]);
  const createRoom = useCallback((setup: Setup) => online('game:create', { time: setup.time, increment: setup.increment, color: setup.color, playerName: setup.name?.trim() || 'Player 1' }), [online]);
  const joinRoom = useCallback(async (roomId: string, playerName?: string) => { await online('game:join', { gameId: roomId.trim().toUpperCase(), playerName: playerName?.trim() || 'Player 2' }); }, [online]);
  const leaveRoom = useCallback(async () => {
    const client = socket.current; const room = gameId;
    if (!client?.connected || !room) return;
    const ack = await client.timeout(10000).emitWithAck('game:leave', { gameId: room }) as Ack;
    if (!ack.ok) throw new Error(ack.error ?? 'Could not leave room');
    onlineRoom.current = null; setLastRoomId(room); setGameId(null); setOnlinePlayers(null); setStatus('idle');
  }, [gameId]);
  const rejoinRoom = useCallback(async () => {
    if (!lastRoomId) throw new Error('No recent room is available');
    await online('game:join', { gameId: lastRoomId });
  }, [lastRoomId, online]);
  const play = useCallback(async (from: Square, to: Square, promotion = 'q') => {
    if (status !== 'active') return false;
    if (mode === 'online') {
      if (!gameId || chess.current.turn() !== playerColor || !socket.current?.connected) return false;
      try { const ack = await socket.current.timeout(10000).emitWithAck('game:move', { gameId, from, to, promotion }) as Ack; return ack.ok; }
      catch { return false; }
    }
    const side = chess.current.turn();
    try {
      chess.current.move({ from, to, promotion });
      if (time) { if (side === 'w') setWhiteTime((value) => value + increment); else setBlackTime((value) => value + increment); }
      if (chess.current.isGameOver()) {
        setStatus('finished'); setReason(chess.current.isCheckmate() ? 'checkmate' : 'draw');
        setResult(chess.current.isCheckmate() ? (chess.current.turn() === 'w' ? '0-1' : '1-0') : '1/2-1/2');
      }
      setBoardState(boardSnapshot(chess.current));
      return true;
    } catch { return false; }
  }, [status, mode, gameId, playerColor, time, increment]);
  const resign = useCallback(() => {
    if (status !== 'active') return;
    if (mode === 'online' && gameId) { socket.current?.emit('game:resign', { gameId }); return; }
    setResult(chess.current.turn() === 'w' ? '0-1' : '1-0'); setReason('resignation'); setStatus('finished');
  }, [status, mode, gameId]);
  const offerDraw = useCallback(() => {
    if (status !== 'active') return;
    if (mode === 'online' && gameId) { socket.current?.emit('game:draw:offer', { gameId }); return; }
    setResult('1/2-1/2'); setReason('draw agreement'); setStatus('finished');
  }, [status, mode, gameId]);
  const setApiUrl = (value: string) => { const next = value.trim().replace(/\/$/, ''); setApiUrlState(next); void setSetting('apiUrl', next); };
  const setHaptics = (value: boolean) => { setHapticsState(value); void setSetting('haptics', String(value)); };
  const setSound = (value: boolean) => { setSoundState(value); void setSetting('sound', String(value)); };
  const setMusic = (value: boolean) => { setMusicState(value); void setSetting('music', String(value)); };
  const setShowCoordinates = (value: boolean) => { setShowCoordinatesState(value); void setSetting('showCoordinates', String(value)); };
  const setGraphicsQuality = (value: GraphicsQuality) => { setGraphicsQualityState(value); void setSetting('graphicsQuality', value); };
  const setCameraPreset = (value: ThreeCameraPreset) => { setCameraPresetState(value); void setSetting('cameraPreset', value); };
  const setBoardTheme = (value: BoardTheme) => { setBoardThemeState(value); void setSetting('boardTheme', value); };
  const setPieceFinish = (value: PieceFinish) => { setPieceFinishState(value); void setSetting('pieceFinish', value); };
  const setThreePieceStyle = (value: ThreePieceStyle) => { setThreePieceStyleState(value); void setSetting('threePieceStyle', value); };
  const value = useMemo<GameContextValue>(() => ({
    ...boardState, status, mode, orientation, playerColor, gameId, lastRoomId,
    whiteTime, blackTime, time, increment, result, reason, apiUrl: apiUrlState, haptics: hapticsState, sound: soundState, music: musicState, showCoordinates, graphicsQuality, cameraPreset, boardTheme, pieceFinish, threePieceStyle, serverConnected, onlinePlayers,
    startLocal: setupLocal, createRoom, joinRoom, leaveRoom, rejoinRoom, play, resign, offerDraw, setApiUrl, setHaptics, setSound, setMusic, setShowCoordinates, setGraphicsQuality, setCameraPreset, setBoardTheme, setPieceFinish, setThreePieceStyle, flip: () => setOrientation((value) => value === 'w' ? 'b' : 'w'),
  }), [boardState, status, mode, orientation, playerColor, gameId, lastRoomId, whiteTime, blackTime, time, increment, result, reason, apiUrlState, hapticsState, soundState, musicState, showCoordinates, graphicsQuality, cameraPreset, boardTheme, pieceFinish, threePieceStyle, serverConnected, onlinePlayers, setupLocal, createRoom, joinRoom, leaveRoom, rejoinRoom, play, resign, offerDraw]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useGame() { const value = useContext(Context); if (!value) throw new Error('GameProvider missing'); return value; }
