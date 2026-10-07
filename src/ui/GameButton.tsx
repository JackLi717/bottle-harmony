import { UiText, useI18n } from '../i18n/I18n';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from './Icon';

const TONES = {
  violet: { colors: ['#263444', '#1C2938'] as const, edge: '#ACBECC55', base: '#192838', ink: '#DCE8EC' },
  blue: { colors: ['#23384B', '#192D3E'] as const, edge: '#8AAEC466', base: '#192838', ink: '#C2E1F0' },
  mint: { colors: ['#234E51', '#193C40'] as const, edge: '#85C8B977', base: '#193C40', ink: '#DDF9EC' },
  gold: { colors: ['#2E3741', '#222F3C'] as const, edge: '#C7AD7866', base: '#222F3C', ink: '#E8D2A3' },
};
type Props = { label: string; icon: IconName; onPress: () => void; disabled?: boolean; tone?: keyof typeof TONES; kind?: 'icon' | 'tool' | 'wide'; compact?: boolean; accessibilityLabel?: string; style?: StyleProp<ViewStyle> };

/** Fine borders and restrained glass surfaces keep controls light and modern. */
export function GameButton({ label, icon, onPress, disabled = false, tone = 'violet', kind = 'tool', compact = false, accessibilityLabel = label, style }: Props) {
  const { rtl } = useI18n();
  const paint = TONES[tone];
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    style={({ pressed }) => [styles.frame, { backgroundColor: paint.base, borderColor: paint.edge }, kind === 'icon' ? styles.iconFrame : kind === 'wide' ? styles.wideFrame : styles.toolFrame,
      compact && kind === 'tool' && styles.compactTool, compact && kind === 'wide' && styles.compactWide, disabled && styles.disabled, pressed && styles.pressed, style]}>
    <LinearGradient colors={paint.colors} style={[styles.face, kind === 'wide' && styles.wideFace, kind === 'wide' && rtl && styles.reverse, kind === 'icon' && styles.iconFace, compact && styles.compactFace]}>
      <View pointerEvents="none" style={styles.shine} />
      <Icon name={icon} size={kind === 'tool' ? compact ? 22 : 30 : 23} color={paint.ink} />
      {kind !== 'icon' && <UiText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.75} style={[styles.label, { color: paint.ink }, kind === 'wide' && styles.wideLabel, compact && kind === 'tool' && styles.compactLabel, compact && kind === 'wide' && styles.compactWideLabel]}>{label}</UiText>}
    </LinearGradient>
  </Pressable>;
}
const styles = StyleSheet.create({
  frame: { borderWidth: 1, borderRadius: 14, padding: 0 },
  toolFrame: { width: 74, minHeight: 68 },
  compactTool: { minHeight: 56 },
  iconFrame: { width: 46, height: 46, borderRadius: 14 },
  wideFrame: { width: '100%', minHeight: 52, borderRadius: 14 },
  compactWide: { minHeight: 46 },
  face: { flex: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 6, gap: 5, overflow: 'hidden' },
  reverse: { flexDirection: 'row-reverse' },
  wideFace: { flexDirection: 'row', gap: 9 },
  iconFace: { borderRadius: 13, paddingVertical: 0 },
  compactFace: { paddingVertical: 4 },
  shine: { position: 'absolute', top: 0, left: 12, right: 12, height: .5, backgroundColor: '#FFFFFF22' },
  label: { fontSize: 12, fontWeight: '500', textAlign: 'center' },
  wideLabel: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  compactLabel: { fontSize: 11 },
  compactWideLabel: { fontSize: 16 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: .7, transform: [{ scale: 0.98 }] },
});
