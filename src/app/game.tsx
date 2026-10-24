import React, { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Alert, Animated, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Chess, Square } from 'chess.js';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '../state/GameContext';
import { ChessBoard } from '../ui/ChessBoard';
import { Button, Header, Screen } from '../ui/components';
import { PieceIcon } from '../ui/PieceIcon';
import { palette } from '../ui/theme';

function clock(value: number, untimed: boolean) { if (untimed) return '∞'; return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`; }
const pieceValue = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export default function GameScreen() {
  const game = useGame(); const inset = useSafeAreaInsets();
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [eventOpacity] = useState(() => new Animated.Value(0));
  const [handshakeY] = useState(() => new Animated.Value(0));
  const last = game.moves.at(-1);
  const capturedBy = (side: 'w' | 'b') => game.moves.filter((move) => move.color === side && move.captured).map((move) => ({ type: move.captured!, color: side === 'w' ? 'b' as const : 'w' as const })).sort((a, b) => pieceValue[b.type] - pieceValue[a.type]);
  const materialLead = (side: 'w' | 'b') => capturedBy(side).reduce((sum, piece) => sum + pieceValue[piece.type], 0) - capturedBy(side === 'w' ? 'b' : 'w').reduce((sum, piece) => sum + pieceValue[piece.type], 0);
  const topSide = game.orientation === 'w' ? 'b' : 'w';
  const bottomSide = game.orientation;
  const sideName = (side: 'w' | 'b') => game.mode === 'online' ? game.onlinePlayers?.[side]?.name ?? 'Waiting for player' : side === game.playerColor ? 'You' : 'Guest';
  const boardEvent = game.status === 'finished' && game.reason === 'checkmate' ? 'CHECKMATE' : game.status === 'finished' && game.reason === 'draw' ? 'DRAW' : game.status === 'finished' && game.reason === 'timeout' ? 'TIME OUT' : new Chess(game.fen).isCheck() ? 'CHECK' : last?.captured ? 'CAPTURE' : '';
  useEffect(() => {
    if (!boardEvent) return;
    eventOpacity.setValue(0);
    const animation = Animated.sequence([Animated.timing(eventOpacity, { toValue: 1, duration: 170, useNativeDriver: true }), Animated.delay(1200), Animated.timing(eventOpacity, { toValue: 0, duration: 350, useNativeDriver: true })]);
    animation.start();
    if (boardEvent === 'DRAW') {
      handshakeY.setValue(0);
      Animated.sequence([
        Animated.delay(300),
        Animated.timing(handshakeY, { toValue: -2, duration: 180, useNativeDriver: true }),
        Animated.timing(handshakeY, { toValue: 2, duration: 180, useNativeDriver: true }),
        Animated.timing(handshakeY, { toValue: -1, duration: 140, useNativeDriver: true }),
        Animated.timing(handshakeY, { toValue: 0, duration: 140, useNativeDriver: true }),
      ]).start();
    }
    return () => { animation.stop(); handshakeY.stopAnimation(); };
  }, [boardEvent, last?.san, eventOpacity, handshakeY]);
  const onMove = (from: Square, to: Square) => {
    const position = new Chess(game.fen);
    const piece = position.get(from);
    if (piece?.type === 'p' && (to.endsWith('8') || to.endsWith('1'))) { setPromotion({ from, to }); return; }
    void game.play(from, to);
  };
  const askResign = () => Alert.alert('Resign game?', 'The game will end and remain available for analysis.', [{ text: 'Keep playing', style: 'cancel' }, { text: 'Resign', style: 'destructive', onPress: game.resign }]);
  return <Screen><View style={{ paddingTop: inset.top }}><Header title={game.mode === 'online' ? 'Online game' : 'Pass & play'} subtitle={game.gameId ?? undefined}/></View>
    <ScrollView contentContainerStyle={styles.content}>
      {game.mode === 'online' && game.status === 'waiting' && <View style={styles.waiting}><Text style={styles.waitTitle}>Waiting for your friend</Text><Text style={styles.roomCode}>{game.gameId}</Text><Button title="Share room code" onPress={() => void Share.share({ message: `Join my Senai Vyuham room: ${game.gameId}` })}/></View>}
      <Player name={sideName(topSide)} side={topSide} time={topSide === 'w' ? game.whiteTime : game.blackTime} active={game.turn === topSide && game.status === 'active'} untimed={game.time === 0} captured={capturedBy(topSide)} lead={materialLead(topSide)}/>
      <View style={styles.boardWrap}><ChessBoard fen={game.fen} orientation={game.orientation} theme={game.boardTheme} showCoordinates={game.showCoordinates} lastMove={last} onMove={onMove} enabled={game.status === 'active' && (game.mode === 'local' || game.playerColor === game.turn)}/>{boardEvent === 'CHECKMATE' && <Animated.View pointerEvents="none" style={[styles.mobileCage, { opacity: eventOpacity, transform: [{ scale: eventOpacity.interpolate({ inputRange: [0, 1], outputRange: [.7, 1] }) }] }]}><Text style={styles.cageBars}>╬</Text><Text style={styles.cageKing}>♔</Text></Animated.View>}{boardEvent === 'DRAW' && <Animated.View pointerEvents="none" style={[styles.mobileDraw, { opacity: eventOpacity }]}><Text style={styles.drawKing}>♔</Text><Animated.View style={[styles.drawHandshake, { transform: [{ translateY: handshakeY }] }]}><View style={[styles.drawArm, styles.drawArmLeft]}/><View style={[styles.drawArm, styles.drawArmRight]}/><View style={styles.drawCuff}/></Animated.View><Text style={styles.drawKing}>♚</Text></Animated.View>}{boardEvent === 'CHECKMATE' && <Animated.View pointerEvents="none" style={[styles.mobileVictory, { opacity: eventOpacity }]}><Text>✦ ✿ ✦</Text></Animated.View>}{boardEvent && <Animated.View pointerEvents="none" style={[styles.eventOverlay, { opacity: eventOpacity, transform: [{ scale: eventOpacity.interpolate({ inputRange: [0, 1], outputRange: [.78, 1] }) }] }]}><Text style={styles.eventText}>{boardEvent}</Text></Animated.View>}</View>
      <Player name={sideName(bottomSide)} side={bottomSide} time={bottomSide === 'w' ? game.whiteTime : game.blackTime} active={game.turn === bottomSide && game.status === 'active'} untimed={game.time === 0} captured={capturedBy(bottomSide)} lead={materialLead(bottomSide)}/>
      {game.status === 'finished' && <View style={styles.finished}><Text style={styles.finishedTitle}>{game.result === '1/2-1/2' ? 'Draw' : `${game.result === '1-0' ? 'White' : 'Black'} wins`}</Text><Text style={styles.finishedReason}>{game.reason}</Text><Button title="Analyze this game →" onPress={() => router.push('/analysis')}/></View>}
      {game.status === 'active' && <Text accessibilityLiveRegion="polite" style={[styles.status, new Chess(game.fen).isCheck() && styles.checkStatus]}>{game.mode === 'online' && !game.serverConnected ? 'Reconnecting…' : new Chess(game.fen).isCheck() ? `Check! ${game.turn === 'w' ? 'White' : 'Black'} must respond.` : last?.captured ? `Capture! ${game.turn === 'w' ? 'White' : 'Black'} to move.` : `${game.turn === 'w' ? 'White' : 'Black'} to move.`}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moveRow}>{game.moves.length ? game.moves.map((move, i) => <Text key={i} style={styles.move}>{i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ''}{move.san}</Text>) : <Text style={styles.empty}>Moves appear here as you play</Text>}</ScrollView>
      <View style={styles.actions}><Button title="Flip board" secondary onPress={game.flip}/><Button title="Analyze" secondary onPress={() => router.push('/analysis')}/><Button title="Offer draw" secondary onPress={game.offerDraw}/><Button title="Resign" secondary onPress={askResign}/></View>
    </ScrollView>
    {promotion && <View style={styles.modal}><View style={styles.modalCard}><Text style={styles.modalTitle}>Promote your pawn</Text><View style={styles.promotionRow}>{(['q','r','b','n'] as const).map((type) => <Pressable key={type} onPress={() => { void game.play(promotion.from, promotion.to, type); setPromotion(null); }} style={styles.promotionChoice}><PieceIcon type={type} color={game.turn} size={55}/></Pressable>)}</View><Button title="Cancel" secondary onPress={() => setPromotion(null)}/></View></View>}
  </Screen>;
}
function Player({ name, side, time, active, untimed, captured, lead }: { name: string; side: 'w' | 'b'; time: number; active: boolean; untimed: boolean; captured: { type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k'; color: 'w' | 'b' }[]; lead: number }) {
  const urgency = active && !untimed && time > 0 ? time <= 10 ? urgencyStyles.clockCritical : time <= 30 ? urgencyStyles.clockDanger : time <= 60 ? urgencyStyles.clockWarning : null : null;
  return <View style={[styles.player, active && styles.activePlayer]}><View style={styles.avatar}><Text style={styles.avatarPiece}>{side === 'w' ? '♙' : '♟'}</Text></View><View style={{ flex: 1 }}><Text style={styles.playerName}>{name}</Text><Text style={styles.playerSide}>{side === 'w' ? 'White' : 'Black'}</Text><View style={styles.capturedTray}>{captured.length ? captured.map((piece, index) => <PieceIcon key={`${piece.type}-${index}`} type={piece.type} color={piece.color} size={18}/>) : <Text style={styles.noCaptures}>No captures</Text>}{lead > 0 && <Text style={urgencyStyles.materialLead}>+{lead}</Text>}</View></View><Text style={[styles.clock, active && styles.clockActive, urgency]}>{clock(time, untimed)}</Text></View>;
}
const urgencyStyles = StyleSheet.create({
  materialLead: { marginLeft: 6, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, overflow: 'hidden', backgroundColor: palette.accent, color: palette.ink, fontWeight: '900', fontSize: 11 },
  clockWarning: { color: '#F1C760' }, clockDanger: { color: '#FF9A66' }, clockCritical: { color: '#FF6969' },
});
const styles = StyleSheet.create({ content: { paddingHorizontal: 14, paddingBottom: 40 }, waiting: { backgroundColor: palette.panel2, padding: 15, borderRadius: 17, marginBottom: 10, gap: 9 }, waitTitle: { color: palette.text, fontWeight: '800', fontSize: 15 }, roomCode: { color: palette.accent, fontSize: 25, fontWeight: '900', letterSpacing: 4 }, player: { minHeight: 66, backgroundColor: palette.panel, borderColor: palette.border, borderWidth: 1, borderRadius: 15, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginVertical: 10 }, activePlayer: { borderColor: palette.accent }, avatar: { height: 35, width: 35, borderRadius: 18, backgroundColor: '#405B46', alignItems: 'center', justifyContent: 'center', marginRight: 10 }, avatarPiece: { color: palette.text, fontSize: 23 }, playerName: { color: palette.text, fontSize: 14, fontWeight: '800' }, playerSide: { color: palette.muted, fontSize: 11, marginTop: 3 }, capturedTray: { minHeight: 18, flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 1 }, noCaptures: { color: palette.muted, fontSize: 10 }, clock: { color: palette.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }, clockActive: { color: palette.accent }, boardWrap: { position: 'relative' }, mobileCage: { position: 'absolute', zIndex: 3, alignSelf: 'center', top: '27%', height: 118, width: 94, alignItems: 'center', justifyContent: 'center' }, cageBars: { position: 'absolute', color: palette.accent, fontSize: 92, fontWeight: '300', lineHeight: 100, textShadowColor: '#b8f36a', textShadowRadius: 12 }, cageKing: { color: palette.white, fontSize: 46, textShadowColor: '#000', textShadowRadius: 5 }, mobileDraw: { position: 'absolute', zIndex: 3, top: '39%', alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: palette.accent, backgroundColor: 'rgba(10,18,12,.9)', flexDirection: 'row', alignItems: 'center', gap: 10 }, drawKing: { color: palette.accent, fontSize: 25, fontWeight: '900' }, drawHandshake: { width: 62, height: 30, justifyContent: 'center', position: 'relative' }, drawArm: { position: 'absolute', top: 11, width: 38, height: 10, borderRadius: 8, backgroundColor: '#a96f52', borderWidth: 1, borderColor: '#e0aa72' }, drawArmLeft: { left: 0, transform: [{ rotate: '22deg' }] }, drawArmRight: { right: 0, transform: [{ rotate: '-22deg' }] }, drawCuff: { position: 'absolute', left: 27, top: 9, width: 8, height: 14, borderRadius: 4, backgroundColor: '#c59b54' }, mobileVictory: { position: 'absolute', zIndex: 4, top: '22%', alignSelf: 'center' }, eventOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }, eventText: { color: palette.accent, fontSize: 32, fontWeight: '900', letterSpacing: 1, backgroundColor: 'rgba(10,18,12,.9)', paddingHorizontal: 22, paddingVertical: 13, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: palette.accent }, status: { color: palette.muted, textAlign: 'center', fontWeight: '700', marginTop: 8 }, checkStatus: { color: palette.red }, moveRow: { gap: 13, alignItems: 'center', minHeight: 46, paddingHorizontal: 6 }, move: { color: palette.text, fontSize: 13, fontWeight: '700' }, empty: { color: palette.muted, fontSize: 12 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, finished: { backgroundColor: palette.panel2, borderRadius: 16, padding: 16, gap: 7, marginTop: 10 }, finishedTitle: { color: palette.text, fontSize: 21, fontWeight: '900' }, finishedReason: { color: palette.muted, textTransform: 'capitalize', marginBottom: 5 }, modal: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,.75)', alignItems: 'center', justifyContent: 'center', padding: 20 }, modalCard: { backgroundColor: palette.panel, borderRadius: 20, padding: 20, width: '100%', gap: 18 }, modalTitle: { color: palette.text, fontSize: 19, fontWeight: '800', textAlign: 'center' }, promotionRow: { flexDirection: 'row', justifyContent: 'space-between' }, promotionChoice: { padding: 5, backgroundColor: palette.white, borderRadius: 12 } });
