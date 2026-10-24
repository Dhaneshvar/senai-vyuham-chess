import React, { useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Square } from 'chess.js';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '../state/GameContext';
import { ChessBoard } from '../ui/ChessBoard';
import { ThreeBoard } from '../ui/ThreeBoard';
import { Button, Chip, Header, Screen } from '../ui/components';
import { palette } from '../ui/theme';

export default function Immersive() {
  const inset = useSafeAreaInsets(); const game = useGame();
  const [mode, setMode] = useState<'three' | 'camera'>('three');
  const [permission, requestPermission] = useCameraPermissions();
  const [scale, setScale] = useState(270);
  const move = (from: Square, to: Square) => { if (game.status !== 'active') return; void game.play(from, to); };
  const camera = () => { if (!permission?.granted) void requestPermission().then((result) => { if (result.granted) setMode('camera'); else Alert.alert('Camera access needed', 'Allow camera access to view the board over a live camera feed.'); }); else setMode('camera'); };
  return <Screen><View style={{ paddingTop: inset.top }}><Header title="Immersive board" subtitle={mode === 'three' ? '3D play mode' : 'Camera composition preview'}/></View><View style={styles.selector}><Chip title="3D board" selected={mode === 'three'} onPress={() => setMode('three')}/><Chip title="Camera view" selected={mode === 'camera'} onPress={camera}/><Chip title="⚙ Settings" selected={false} onPress={() => router.push('/settings')}/></View>
    {mode === 'three' ? <ScrollView contentContainerStyle={styles.content}><ThreeBoard fen={game.fen} moves={game.moves} orientation={game.orientation} pieceStyle={game.threePieceStyle} quality={game.graphicsQuality} showCoordinates={game.showCoordinates} cameraPreset={game.cameraPreset} onMove={move}/><Text style={styles.copy}>Tap a piece, then a destination square. Change the character set, camera, and graphics in Global Settings.</Text><Button title="Open standard board" secondary onPress={() => router.push('/game')}/></ScrollView>
      : <View style={styles.cameraWrap}>{permission?.granted ? <CameraView style={StyleSheet.absoluteFill} facing="back"/> : <Text style={styles.copy}>Camera permission is required.</Text>}<View style={styles.cameraContent}><Text style={styles.cameraTag}>MANUAL CAMERA PREVIEW</Text><Text style={styles.cameraHint}>Move your phone to frame a table or floor. This overlay can be resized, but it does not yet detect or anchor to a physical surface.</Text><View style={{ width: scale, alignSelf: 'center', opacity: .94 }}><ChessBoard fen={game.fen} orientation={game.orientation} theme={game.boardTheme} showCoordinates={game.showCoordinates} onMove={move} enabled={game.status === 'active'}/></View><View style={styles.resize}><Button title="−" secondary onPress={() => setScale((value) => Math.max(200, value - 25))}/><Button title="+" secondary onPress={() => setScale((value) => Math.min(360, value + 25))}/></View></View></View>}
  </Screen>;
}
const styles = StyleSheet.create({ selector: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, marginBottom: 10 }, content: { padding: 15, gap: 18 }, copy: { color: palette.muted, fontSize: 13, lineHeight: 20 }, cameraWrap: { flex: 1, backgroundColor: '#1E2821' }, cameraContent: { flex: 1, justifyContent: 'space-around', alignItems: 'center', padding: 20 }, cameraTag: { color: palette.accent, backgroundColor: 'rgba(0,0,0,.7)', padding: 8, borderRadius: 10, fontSize: 10, fontWeight: '900', letterSpacing: 1 }, cameraHint: { color: palette.text, backgroundColor: 'rgba(0,0,0,.7)', padding: 10, borderRadius: 10, fontSize: 12, lineHeight: 18 }, resize: { flexDirection: 'row', gap: 12, justifyContent: 'center' } });
