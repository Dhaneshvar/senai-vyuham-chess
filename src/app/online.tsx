import React, { useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '../state/GameContext';
import { Button, Card, Chip, Header, Label, Screen } from '../ui/components';
import { palette } from '../ui/theme';

export default function Online() {
  const game = useGame(); const inset = useSafeAreaInsets();
  const [room, setRoom] = useState(''); const [busy, setBusy] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [color, setColor] = useState<'w' | 'b' | 'random'>('random');
  const [time, setTime] = useState(600);
  const create = async () => { if (!playerName.trim()) return Alert.alert('Player name required', 'Enter your name before creating a room.'); setBusy(true); try { await game.createRoom({ color, time, increment: 0, name: playerName }); router.replace('/game'); } catch (error) { Alert.alert('Could not create room', String(error)); } finally { setBusy(false); } };
  const join = async () => { if (!playerName.trim()) return Alert.alert('Player name required', 'Enter your name before joining a room.'); if (!room.trim()) return; setBusy(true); try { await game.joinRoom(room, playerName); router.replace('/game'); } catch (error) { Alert.alert('Could not join room', String(error)); } finally { setBusy(false); } };
  return <Screen><View style={{ paddingTop: inset.top }}><Header title="Play online" subtitle="Create a private room or join a friend"/></View><ScrollView contentContainerStyle={styles.content}>
    <Card><Text style={styles.cardTitle}>Server connection</Text><Text style={styles.status}>{game.serverConnected ? '● Connected' : '● Offline'}</Text><Text style={styles.help}>{game.apiUrl || 'Set your laptop or cloud server address in Settings first.'}</Text>{!game.apiUrl && <Button title="Open settings" secondary onPress={() => router.push('/settings')}/>}</Card>
    <Label>YOUR NAME - REQUIRED</Label><TextInput placeholder="Enter your display name" placeholderTextColor={palette.muted} maxLength={32} value={playerName} onChangeText={setPlayerName} style={styles.input}/>
    <Label>CREATE A ROOM</Label><View style={styles.row}><Chip title="White" selected={color === 'w'} onPress={() => setColor('w')}/><Chip title="Black" selected={color === 'b'} onPress={() => setColor('b')}/><Chip title="Random" selected={color === 'random'} onPress={() => setColor('random')}/></View>
    <View style={styles.row}><Chip title="5 min" selected={time === 300} onPress={() => setTime(300)}/><Chip title="10 min" selected={time === 600} onPress={() => setTime(600)}/><Chip title="No timer" selected={time === 0} onPress={() => setTime(0)}/></View>
    <Button title="Create room" onPress={create} disabled={!game.serverConnected || !playerName.trim() || busy}/>
    <Label>JOIN A FRIEND</Label><TextInput placeholder="Enter room code" placeholderTextColor={palette.muted} autoCapitalize="characters" value={room} onChangeText={setRoom} style={styles.input}/><Button title="Join room" secondary onPress={join} disabled={!game.serverConnected || !playerName.trim() || !room.trim() || busy}/>
    {busy && <ActivityIndicator color={palette.accent}/>}
  </ScrollView></Screen>;
}
const styles = StyleSheet.create({ content: { padding: 20, gap: 16, paddingBottom: 50 }, cardTitle: { color: palette.text, fontSize: 16, fontWeight: '800' }, status: { color: palette.accent, fontWeight: '800', marginTop: 9 }, help: { color: palette.muted, marginTop: 8, marginBottom: 10, lineHeight: 19, flexShrink: 1 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, input: { height: 55, borderRadius: 14, backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.border, color: palette.text, paddingHorizontal: 16, fontSize: 16, letterSpacing: 2 } });
