import React, { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listGames } from '../lib/storage';
import { SavedGame } from '../lib/types';
import { BottomNav, Button, Card, Header, Screen } from '../ui/components';
import { palette } from '../ui/theme';

export default function History() {
  const inset = useSafeAreaInsets(); const [games, setGames] = useState<SavedGame[]>([]);
  useFocusEffect(useCallback(() => { void listGames().then(setGames).catch(() => {}); }, []));
  return <Screen><View style={{ paddingTop: inset.top }}><Header title="Your games" subtitle="Saved on this device" back={false}/></View><ScrollView contentContainerStyle={styles.content}>
    {!games.length && <Card><Text style={styles.title}>Your first game is waiting</Text><Text style={styles.body}>Completed games appear here with their moves ready for analysis.</Text><Button title="Start a game" onPress={() => router.push('/setup')}/></Card>}
    {games.map((game) => <Card key={game.id}><View style={styles.row}><Text style={styles.title}>{game.white} vs {game.black}</Text><Text style={styles.result}>{game.result}</Text></View><Text style={styles.body}>{new Date(game.createdAt).toLocaleDateString()} · {game.mode === 'online' ? 'Online' : 'Pass & play'} · {game.reason}</Text><Button title="Review game →" secondary onPress={() => router.push({ pathname: '/analysis', params: { id: game.id } })}/></Card>)}
  </ScrollView><BottomNav active="history"/></Screen>;
}
const styles = StyleSheet.create({ content: { padding: 20, gap: 12 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, title: { color: palette.text, fontSize: 15, fontWeight: '800', flex: 1 }, body: { color: palette.muted, fontSize: 12, lineHeight: 18, marginVertical: 10 }, result: { color: palette.accent, fontWeight: '900' } });
