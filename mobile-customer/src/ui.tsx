import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, ScrollView } from 'react-native';
export const colors = { olive: '#414827', ivory: '#EBE5D9', white: '#FFFCF5' };
export function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={onPress} style={[styles.button, disabled && { opacity: 0.4 }]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
export function Page({ title, children }: { title: string; children: ReactNode }) {
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}><Text style={styles.brand}>ATELIER ELUNORA</Text><Text style={styles.title}>{title}</Text>{children}</ScrollView>;
}
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ivory }, content: { padding: 24, gap: 18 },
  brand: { color: colors.olive, fontSize: 12, letterSpacing: 3 }, title: { fontSize: 34, color: colors.olive },
  body: { fontSize: 16, lineHeight: 24, color: colors.olive }, button: { padding: 16, borderRadius: 24, backgroundColor: colors.olive, alignItems: 'center' },
  buttonText: { color: colors.white, fontSize: 16 },
});
