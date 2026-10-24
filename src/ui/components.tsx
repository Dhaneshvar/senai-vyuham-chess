import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { palette } from './theme';

export function Screen({ children, scroll = false }: { children: React.ReactNode; scroll?: boolean }) {
  return <View style={styles.screen}>{children}</View>;
}
export function Header({ title, subtitle, back = true }: { title: string; subtitle?: string; back?: boolean }) {
  return <View style={styles.header}>{back && <Pressable onPress={() => router.back()} hitSlop={12}><Text style={styles.back}>‹</Text></Pressable>}<View style={{ flex: 1 }}><Text style={styles.title}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View></View>;
}
export function Button({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[styles.button, secondary && styles.secondary, disabled && { opacity: .45 }]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text></Pressable>;
}
export function Chip({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{title}</Text></Pressable>;
}
export function Card({ children, style }: { children: React.ReactNode; style?: object }) { return <View style={[styles.card, style]}>{children}</View>; }
export function Label({ children }: { children: React.ReactNode }) { return <Text style={styles.label}>{children}</Text>; }
export function BottomNav({ active }: { active: 'home' | 'history' | 'settings' }) {
  return <View style={styles.nav}>{([['⌂','Home','/'],['▤','Games','/history'],['⚙','Settings','/settings']] as const).map(([icon, title, route]) => <Pressable key={title} onPress={() => router.replace(route)} style={styles.navItem}><Text style={[styles.navIcon,active === title.toLowerCase() && styles.navActive]}>{icon}</Text><Text style={[styles.navText,active === title.toLowerCase() && styles.navActive]}>{title}</Text></Pressable>)}</View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, gap: 15 }, back: { color: palette.text, fontSize: 34, lineHeight: 35, width: 28 }, title: { color: palette.text, fontSize: 24, fontWeight: '800' }, subtitle: { color: palette.muted, fontSize: 13, marginTop: 3 }, button: { minHeight: 55, borderRadius: 15, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }, buttonText: { color: palette.ink, fontSize: 15, fontWeight: '800' }, secondary: { backgroundColor: palette.panel2, borderWidth: 1, borderColor: palette.border }, secondaryText: { color: palette.text }, chip: { borderWidth: 1, borderColor: palette.border, backgroundColor: palette.panel, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, minWidth: 82, alignItems: 'center' }, chipSelected: { backgroundColor: palette.accent, borderColor: palette.accent }, chipText: { color: palette.text, fontSize: 13, fontWeight: '700' }, chipTextSelected: { color: palette.ink }, card: { backgroundColor: palette.panel, borderRadius: 20, borderWidth: 1, borderColor: palette.border, padding: 18 }, label: { color: palette.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 10 }, nav: { height: 72, borderTopWidth: 1, borderColor: palette.border, backgroundColor: '#141C17', flexDirection: 'row' }, navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }, navIcon: { color: palette.muted, fontSize: 22 }, navText: { color: palette.muted, fontSize: 11, fontWeight: '700' }, navActive: { color: palette.accent },
});
