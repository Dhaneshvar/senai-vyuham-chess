import React from 'react';
import { router } from 'expo-router';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNav, Button, Card, Label, Screen } from '../ui/components';
import { palette } from '../ui/theme';

export default function Home() {
  const inset = useSafeAreaInsets();
  return <Screen><ScrollView contentContainerStyle={[styles.content, { paddingTop: inset.top + 20 }]}>
    <View style={styles.brandLockup}>
      <Image source={require('../../assets/vyuha-chess-ai-logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="Senai Vyuham logo"/>
      <Text style={styles.brandName}>SENAI VYUHAM</Text>
      <Text style={styles.kicker}>YOUR CHESS LAB</Text>
    </View>
    <Text style={styles.hero}>Play closer to the board.{`\n`}Understand every move.</Text>
    <Text style={styles.description}>Play live, see the battle in 3D, and improve with AI insight—learning from every decision.</Text>
    <Button title="Start a game →" onPress={() => router.push('/setup')}/>
    <Card style={styles.feature}><Text style={styles.featureOverline}>SIGNATURE EXPERIENCE</Text><Text style={styles.featureTitle}>Explore what could have happened.</Text><Text style={styles.featureBody}>Analysis shows strong moves with arrows. Try one, continue playing, and watch the position change.</Text><Text style={styles.featurePieces}>♞  ↗  ♙</Text></Card>
    <Label>DISCOVER</Label>
    <View style={styles.grid}>
      <Card style={styles.tile}><Text style={styles.tileIcon}>◒</Text><Text style={styles.tileTitle}>Pass & play</Text><Text style={styles.tileBody}>One phone, two players</Text><Button title="Set up" secondary onPress={() => router.push('/setup')}/></Card>
      <Card style={styles.tile}><Text style={styles.tileIcon}>⌁</Text><Text style={styles.tileTitle}>Online room</Text><Text style={styles.tileBody}>Share a code with a friend</Text><Button title="Connect" secondary onPress={() => router.push('/online')}/></Card>
    </View>
    <View style={styles.grid}><Card style={styles.tile}><Text style={styles.tileIcon}>⌘</Text><Text style={styles.tileTitle}>Analysis Lab</Text><Text style={styles.tileBody}>Review and branch from any game</Text><Button title="Open" secondary onPress={() => router.push('/analysis')}/></Card><Card style={styles.tile}><Text style={styles.tileIcon}>◈</Text><Text style={styles.tileTitle}>Immersive</Text><Text style={styles.tileBody}>Perspective and camera views</Text><Button title="Explore" secondary onPress={() => router.push('/immersive')}/></Card></View>
  </ScrollView><BottomNav active="home"/></Screen>;
}
const styles = StyleSheet.create({ content: { paddingHorizontal: 20, paddingBottom: 40, gap: 18 }, brandLockup: { alignItems: 'center', alignSelf: 'stretch', gap: 4, marginBottom: 4 }, logo: { width: 128, height: 128 }, brandName: { color: palette.text, fontSize: 23, fontWeight: '900', letterSpacing: 2, textAlign: 'center' }, kicker: { color: palette.accent, fontSize: 10, fontWeight: '900', letterSpacing: 2, textAlign: 'center' }, hero: { color: palette.text, fontSize: 38, fontWeight: '900', letterSpacing: -1.5, lineHeight: 42 }, description: { color: palette.muted, fontSize: 15, lineHeight: 22, maxWidth: 340 }, feature: { backgroundColor: '#21372B', minHeight: 200 }, featureOverline: { color: palette.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 }, featureTitle: { color: palette.text, fontSize: 22, fontWeight: '800', marginTop: 12, maxWidth: 245 }, featureBody: { color: '#C5D1C6', fontSize: 13, lineHeight: 19, marginTop: 10, maxWidth: 260 }, featurePieces: { color: palette.accent, position: 'absolute', right: 15, bottom: 10, fontSize: 25 }, grid: { flexDirection: 'row', gap: 10 }, tile: { flex: 1, minHeight: 190, padding: 13, justifyContent: 'space-between' }, tileIcon: { color: palette.accent, fontSize: 23 }, tileTitle: { color: palette.text, fontSize: 16, fontWeight: '800' }, tileBody: { color: palette.muted, fontSize: 12, lineHeight: 17, minHeight: 34 } });
