import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GameProvider } from '../state/GameContext';
import { palette } from '../ui/theme';

export default function RootLayout() {
  return <SafeAreaProvider><GameProvider><StatusBar style="light"/><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg }, animation: 'fade' }}/></GameProvider></SafeAreaProvider>;
}
