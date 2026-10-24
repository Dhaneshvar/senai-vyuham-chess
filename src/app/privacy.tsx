import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Header, Label, Screen } from '../ui/components';
import { palette } from '../ui/theme';

export default function Privacy() {
  const inset = useSafeAreaInsets();
  return <Screen><View style={{ paddingTop: inset.top }}><Header title="Privacy" subtitle="Senai Vyuham data practices"/></View><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.updated}>LAST UPDATED · OCTOBER 18, 2026</Text>
    <Card><Text style={styles.title}>What the app stores</Text><Text style={styles.body}>Senai Vyuham stores your completed-game history, board preferences, server address, and an anonymous reconnect token on your device. This lets you continue a game after a temporary connection loss.</Text></Card>
    <Card><Text style={styles.title}>Online games and analysis</Text><Text style={styles.body}>When you choose online play or engine analysis, your current game position, moves, display name, room code, and anonymous reconnect token are sent to the server address you configure. A hosted Senai Vyuham service may retain finished games if its database is enabled. No account profile is created by this app.</Text></Card>
    <Card><Text style={styles.title}>Camera</Text><Text style={styles.body}>Camera access is only requested when you open Camera view in Immersive mode. The current app displays the live preview and does not upload, record, or save camera images.</Text></Card>
    <Card><Text style={styles.title}>Advertising and sharing</Text><Text style={styles.body}>The app contains no advertising SDK, analytics SDK, contacts access, or precise location collection. Your room code is shared only when you choose the system share action.</Text></Card>
    <Card><Text style={styles.title}>Delete your data</Text><Text style={styles.body}>Settings → Erase on-device data removes the local game history, preferences, and reconnect token. For data held by a future hosted Senai Vyuham server, the public privacy-policy URL and support contact must be added before Play Store submission.</Text></Card>
    <Label>RELEASE NOTE</Label><Text style={styles.note}>This in-app summary is not a substitute for the public privacy-policy URL required in a Play Console listing.</Text>
  </ScrollView></Screen>;
}
const styles = StyleSheet.create({ content: { padding: 20, gap: 13, paddingBottom: 50 }, updated: { color: palette.accent, fontSize: 10, letterSpacing: 1.2, fontWeight: '900' }, title: { color: palette.text, fontSize: 16, fontWeight: '900', marginBottom: 8 }, body: { color: palette.muted, fontSize: 13, lineHeight: 20 }, note: { color: palette.muted, fontSize: 12, lineHeight: 18 } });
