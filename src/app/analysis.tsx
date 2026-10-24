import React, { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Chess, Square } from 'chess.js';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { analyzePosition, getReview, startReview } from '../lib/api';
import { getGame } from '../lib/storage';
import { PositionAnalysis, ReviewJob, ReviewItem } from '../lib/types';
import { useGame } from '../state/GameContext';
import { ChessBoard } from '../ui/ChessBoard';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { Button, Card, Header, Screen } from '../ui/components';
import { palette } from '../ui/theme';

function scoreLabel(score?: { cp?: number; mate?: number }) {
  if (!score) return '—';
  if (score.mate != null) return `M${Math.abs(score.mate)} ${score.mate > 0 ? 'White' : 'Black'}`;
  return `${(score.cp ?? 0) >= 0 ? '+' : ''}${((score.cp ?? 0) / 100).toFixed(2)}`;
}
function qualityColor(value?: string) { return value === 'blunder' || value === 'mistake' ? palette.red : value === 'inaccuracy' ? palette.amber : palette.accent; }
function uciMove(fen: string, uci: string) {
  const chess = new Chess(fen);
  chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
  return chess;
}

export default function Analysis() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const game = useGame(); const inset = useSafeAreaInsets();
  const [pgn, setPgn] = useState(id ? '' : game.pgn);
  const [selectedPly, setSelectedPly] = useState(1);
  const [job, setJob] = useState<ReviewJob | null>(null);
  const [error, setError] = useState('');
  const [branch, setBranch] = useState<Chess | null>(null);
  const [branchMoves, setBranchMoves] = useState<string[]>([]);
  const [branchAnalysis, setBranchAnalysis] = useState<PositionAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoReply, setAutoReply] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => { if (id) void getGame(id).then((saved) => { if (saved) { setPgn(saved.pgn); setSelectedPly(1); setJob(null); setBranch(null); setBranchMoves([]); } }); }, [id]);
  const timeline = useMemo(() => {
    const replay = new Chess(); const entries = [{ fen: replay.fen(), san: 'Start', from: '', to: '' }];
    if (pgn) { try { replay.loadPgn(pgn); const history = replay.history({ verbose: true }); replay.reset(); for (const move of history) { replay.move(move); entries.push({ fen: replay.fen(), san: move.san, from: move.from, to: move.to }); } } catch {} }
    return entries;
  }, [pgn]);
  useEffect(() => {
    if (!pgn || !game.apiUrl) return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout> | undefined;
    void startReview(game.apiUrl, pgn).then(({ id: reviewId }) => {
      const poll = async () => {
        try { const next = await getReview(game.apiUrl, reviewId); if (cancelled) return; setJob(next); if (next.status === 'running' || next.status === 'queued') timer = setTimeout(poll, 2500); }
        catch (issue) { if (!cancelled) setError(String(issue)); }
      };
      void poll();
    }).catch((issue) => { if (!cancelled) setError(String(issue)); });
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [pgn, game.apiUrl, retry]);
  const shareAnalysis = () => {
    if (job?.status !== 'complete') return;
    const white = job.items.filter((item) => item.ply % 2 === 1);
    const black = job.items.filter((item) => item.ply % 2 === 0);
    const accuracy = (items: ReviewItem[]) => Math.max(0, Math.round(100 - items.reduce((sum, item) => sum + item.loss, 0) / Math.max(1, items.length)));
    const turning = job.items.filter((item) => ['inaccuracy', 'mistake', 'blunder'].includes(item.quality)).slice(0, 6);
    const keyMoves = turning.map((item) => `${Math.ceil(item.ply / 2)}${item.ply % 2 ? '.' : '…'} ${item.san} (${item.quality})`).join(', ');
    void Share.share({ message: `Senai Vyuham · Game review\nWhite ${accuracy(white)}% · Black ${accuracy(black)}% accuracy\n${keyMoves ? `Key moments: ${keyMoves}` : 'No major mistakes detected.'}\n\nPGN: ${pgn}` });
  };
  const review: ReviewItem | undefined = job?.items[selectedPly - 1];
  const actualFen = timeline[Math.min(selectedPly, timeline.length - 1)]?.fen ?? new Chess().fen();
  const shownFen = branch?.fen() ?? review?.before ?? (selectedPly ? timeline[selectedPly - 1]?.fen : actualFen) ?? actualFen;
  const best = branch ? branchAnalysis?.lines[0] : review?.best[0];
  const chance = best?.whiteChance;
  const arrows = best?.pv[0] ? [{ from: best.pv[0].slice(0, 2), to: best.pv[0].slice(2, 4), color: palette.accent }] : [];
  const selected = timeline[selectedPly];
  const analyzeBranch = async (position: Chess) => {
    if (!game.apiUrl) return;
    setBusy(true);
    try { setBranchAnalysis(await analyzePosition(game.apiUrl, position.fen(), 11, 3)); }
    catch (issue) { setError(String(issue)); }
    finally { setBusy(false); }
  };
  const beginBranch = () => {
    if (!best?.pv[0]) return;
    try { const line = uciMove(review?.before ?? shownFen, best.pv[0]); setBranch(line); setBranchMoves(line.history()); setBranchAnalysis(null); void analyzeBranch(line); }
    catch { Alert.alert('Line unavailable', 'Could not apply this move to the selected position.'); }
  };
  const moveBranch = async (from: Square, to: Square, promotion = 'q') => {
    if (!branch || busy) return;
    try {
      const next = new Chess(branch.fen()); const played = next.move({ from, to, promotion }); setBranch(next); setBranchMoves((moves) => [...moves, played.san]); setBranchAnalysis(null);
      if (next.isGameOver()) return;
      if (autoReply && game.apiUrl) {
        setBusy(true);
        try {
          const response = await analyzePosition(game.apiUrl, next.fen(), 11, 1);
          if (response.lines[0]?.pv[0]) {
            const answered = uciMove(next.fen(), response.lines[0].pv[0]); setBranch(answered); setBranchMoves((moves) => [...moves, answered.history()[0]]);
            setBranchAnalysis(await analyzePosition(game.apiUrl, answered.fen(), 11, 3));
          }
        } catch (issue) { setError(String(issue)); }
        finally { setBusy(false); }
      } else void analyzeBranch(next);
    } catch { Alert.alert('Illegal move', 'Choose a highlighted destination.'); }
  };
  return <Screen><View style={{ paddingTop: inset.top }}><Header title="Analysis Lab" subtitle={branch ? 'Exploring a new possibility' : 'Move by move review'}/></View><ScrollView contentContainerStyle={styles.content}>
    {branch && <View style={styles.branchBanner}><Text style={styles.branchText}>WHAT-IF LINE · Original game preserved</Text><Pressable onPress={() => { setBranch(null); setBranchMoves([]); setBranchAnalysis(null); }}><Text style={styles.returnText}>Return</Text></Pressable></View>}
    {!pgn && <Card><Text style={styles.title}>No game to review yet</Text><Text style={styles.body}>Finish a pass-and-play or online game, then return here.</Text><Button title="Start a game" onPress={() => router.push('/setup')}/></Card>}
    <ChessBoard fen={shownFen} orientation={game.orientation} theme={game.boardTheme} showCoordinates={game.showCoordinates} arrows={arrows} onMove={branch ? moveBranch : undefined} enabled={Boolean(branch) && !busy} lastMove={branch ? undefined : selected ? { from: selected.from, to: selected.to } : undefined}/>
    <View style={styles.evalRow}><Text style={styles.muted}>WHITE</Text><Text style={styles.eval}>{scoreLabel(best?.whiteScore)}</Text><Text style={styles.muted}>BLACK</Text></View>
    <View style={styles.bar}><View style={[styles.barFill, { width: `${chance ?? 50}%` }]}/></View>
    <Text style={styles.chance}>{chance == null ? 'Engine estimate appears when analysis completes' : `Engine estimate: White ${chance}% · Black ${100 - chance}%`}</Text>
    {job?.items?.length ? <EvaluationGraph items={job.items} selectedPly={selectedPly} onSelect={setSelectedPly}/> : null}
    {job?.status === 'complete' && <Button title="Share game analysis" secondary onPress={shareAnalysis}/>}
    {branch ? <Card><Text style={styles.title}>{branch.isGameOver() ? 'This line is complete' : busy ? 'Engine thinking…' : 'Continue the line'}</Text><Text style={styles.body}>Tap a piece to see legal squares. {autoReply ? 'The engine plays the strongest reply after your move.' : 'You control both sides.'}</Text><Button title={autoReply ? 'Switch to free exploration' : 'Let engine reply'} secondary onPress={() => setAutoReply((value) => !value)}/><Text style={styles.line}>{branchMoves.join('  ')}</Text></Card> : <Card>
      <View style={styles.insightHeader}><Text style={styles.moveTitle}>{selectedPly ? `${Math.ceil(selectedPly / 2)}${selectedPly % 2 === 1 ? '.' : '...'} ${selected?.san}` : 'Starting position'}</Text><Text style={[styles.quality, { color: qualityColor(review?.quality) }]}>{review?.quality.toUpperCase() ?? 'REVIEW'}</Text></View>
      {review ? <><Text style={styles.body}>{review.explanation ?? (review.loss === 0 ? 'This move kept the strongest engine continuation.' : `This move reduced your estimated chances by ${review.loss} points. Explore the engine's alternative below.`)}</Text><Text style={styles.line}>Best line: {best?.san.slice(0, 6).join('  ') || '—'}</Text><Button title={`Try ${best?.san[0] ?? 'best move'} →`} onPress={beginBranch} disabled={!best?.pv[0]}/></> : <Text style={styles.body}>{game.apiUrl ? job ? `Reviewing ${job.completed} of ${job.total} moves…` : 'Starting engine review…' : 'Set the server address in Settings to get Stockfish arrows and move quality.'}</Text>}
    </Card>}
    {busy && <ActivityIndicator color={palette.accent}/>}{error ? <Text style={styles.error}>{error}</Text> : null}
    {!branch && timeline.length > 1 && <><Text style={styles.timelineTitle}>GAME TIMELINE</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeline}>{timeline.slice(1).map((entry, index) => <Pressable key={index} onPress={() => setSelectedPly(index + 1)} style={[styles.moveChip,selectedPly === index + 1 && styles.moveChipOn]}><Text style={[styles.moveChipText,selectedPly === index + 1 && styles.moveChipTextOn]}>{index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ''}{entry.san}</Text>{job?.items[index] && <View style={[styles.qualityDot, { backgroundColor: qualityColor(job.items[index].quality) }]}/>}</Pressable>)}</ScrollView></>}
    {(job?.status === 'failed' || error) && <Button title="Retry analysis" secondary onPress={() => { setError(''); setJob(null); setRetry((value) => value + 1); }}/>} 
    {job?.status === 'failed' && <Text style={styles.error}>{job.error}</Text>}
  </ScrollView></Screen>;
}
function EvaluationGraph({ items, selectedPly, onSelect }: { items: ReviewItem[]; selectedPly: number; onSelect: (ply: number) => void }) {
  const points = items.map((item, index) => `${items.length === 1 ? 50 : 4 + (index / (items.length - 1)) * 92},${96 - (item.actual.whiteChance / 100) * 92}`).join(' ');
  return <View style={styles.mobileGraph}><View style={styles.graphHeader}><Text style={styles.timelineTitle}>EVALUATION GRAPH</Text><Text style={styles.graphHint}>Tap a point to open that position</Text></View><View style={styles.graphPlot}><Svg viewBox="0 0 100 100" width="100%" height="150"><Line x1="0" y1="50" x2="100" y2="50" stroke="#8A9B87" strokeWidth="1"/><Line x1="0" y1="25" x2="100" y2="25" stroke="#3C5142" strokeWidth=".5" strokeDasharray="2 2"/><Line x1="0" y1="75" x2="100" y2="75" stroke="#3C5142" strokeWidth=".5" strokeDasharray="2 2"/><Polyline points={points} fill="none" stroke={palette.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>{items.map((item, index) => { const x = items.length === 1 ? 50 : 4 + (index / (items.length - 1)) * 92; const y = 96 - (item.actual.whiteChance / 100) * 92; return <Circle key={item.ply} cx={x} cy={y} r={selectedPly === item.ply ? 3 : 1.8} fill={qualityColor(item.quality)} stroke={selectedPly === item.ply ? palette.text : '#101812'} strokeWidth="1" onPress={() => onSelect(item.ply)}/>; })}</Svg><View style={styles.graphScale}><Text>White better</Text><Text>Equal</Text><Text>Black better</Text></View></View></View>;
}
const styles = StyleSheet.create({ content: { padding: 14, paddingBottom: 70, gap: 15 }, mobileGraph: { backgroundColor: palette.panel2, borderColor: palette.border, borderWidth: 1, borderRadius: 14, padding: 12 }, graphHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, graphHint: { color: palette.muted, fontSize: 10 }, graphPlot: { height: 175, marginTop: 8, position: 'relative' }, graphScale: { position: 'absolute', top: 6, left: 6, right: 6, flexDirection: 'row', justifyContent: 'space-between' }, branchBanner: { backgroundColor: palette.panel2, borderRadius: 12, padding: 12, flexDirection: 'row', justifyContent: 'space-between' }, branchText: { color: palette.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1 }, returnText: { color: palette.text, fontSize: 12, fontWeight: '800' }, evalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, muted: { color: palette.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 }, eval: { color: palette.text, fontSize: 19, fontWeight: '900' }, bar: { height: 8, borderRadius: 8, backgroundColor: '#33433A', overflow: 'hidden' }, barFill: { height: '100%', backgroundColor: palette.white }, chance: { color: palette.muted, textAlign: 'center', fontSize: 11 }, title: { color: palette.text, fontSize: 17, fontWeight: '800', marginBottom: 8 }, body: { color: palette.muted, fontSize: 13, lineHeight: 20, marginBottom: 12 }, insightHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }, moveTitle: { color: palette.text, fontSize: 17, fontWeight: '900' }, quality: { fontSize: 10, fontWeight: '900', letterSpacing: 1 }, line: { color: palette.accent, fontSize: 13, lineHeight: 20, marginVertical: 12 }, error: { color: palette.red, fontSize: 12 }, timelineTitle: { color: palette.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 }, timeline: { gap: 8, paddingBottom: 4 }, moveChip: { backgroundColor: palette.panel, borderColor: palette.border, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 11, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7 }, moveChipOn: { backgroundColor: palette.accent }, moveChipText: { color: palette.text, fontWeight: '700', fontSize: 12 }, moveChipTextOn: { color: palette.ink }, qualityDot: { width: 5, height: 5, borderRadius: 3 } });
