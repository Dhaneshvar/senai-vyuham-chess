import React, { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '../state/GameContext';
import { Button, Card, Chip, Header, Label, Screen } from '../ui/components';
import { palette } from '../ui/theme';

const controls = [
  { title: '1 min', time: 60, increment: 0 }, { title: '3 min', time: 180, increment: 0 },
  { title: '3 + 2', time: 180, increment: 2 }, { title: '5 min', time: 300, increment: 0 },
  { title: '10 min', time: 600, increment: 0 }, { title: '10 + 5', time: 600, increment: 5 },
  { title: '15 + 10', time: 900, increment: 10 }, { title: 'No timer', time: 0, increment: 0 },
];
export default function Setup() {
  const game = useGame(); const inset = useSafeAreaInsets();
  const [color, setColor] = useState<'w' | 'b' | 'random'>('random');
  const [control, setControl] = useState(4);
  return <Screen><View style={{ paddingTop: inset.top }}><Header title="Set up your game" subtitle="Pass & play on this phone"/></View><ScrollView contentContainerStyle={styles.content}>
    <Label>YOUR SIDE</Label><View style={styles.row}><Chip title="White" selected={color === 'w'} onPress={() => setColor('w')}/><Chip title="Black" selected={color === 'b'} onPress={() => setColor('b')}/><Chip title="Random" selected={color === 'random'} onPress={() => setColor('random')}/></View>
    <Label>TIME CONTROL</Label><View style={styles.wrap}>{controls.map((item, index) => <Chip key={item.title} title={item.title} selected={index === control} onPress={() => setControl(index)}/>)}</View>
    <Card><Text style={styles.cardTitle}>What happens after the game?</Text><Text style={styles.cardBody}>Your moves are saved on this phone. Open Analysis Lab to review each position and create a separate what-if line.</Text></Card>
    <Button title="Begin game →" onPress={() => { game.startLocal({ color, time: controls[control].time, increment: controls[control].increment }); router.replace('/game'); }}/>
  </ScrollView></Screen>;
}
const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 60, gap: 18 }, row: { flexDirection: 'row', gap: 8 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 14 }, cardTitle: { color: palette.text, fontWeight: '800', fontSize: 16 }, cardBody: { color: palette.muted, fontSize: 13, lineHeight: 20, marginTop: 8 } });
