import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { UiText, useI18n } from '../i18n/I18n';
import { GameButton } from './GameButton';
import { Icon } from './Icon';
import type { StalledReason } from './stalledNoticePolicy';

/** Fits over the existing footer, keeping all bottle coordinates unchanged. */
export function StalledNotice({ reason, compact, canUndo, reserveAvailable, heatAvailable, reduceMotion, onClose, onUndo, onReset, onHeat }: {
  reason: StalledReason; compact: boolean; canUndo: boolean; reserveAvailable: boolean; heatAvailable: boolean; reduceMotion: boolean; onClose: () => void; onUndo: () => void; onReset: () => void; onHeat: () => void;
}) {
  const { t, rtl } = useI18n();
  const entrance = useSharedValue(reduceMotion ? 1 : 0);
  const title = t(reason === 'noMoves' ? 'noMovesTitle' : 'unsolvableTitle');
  const help = heatAvailable ? 'solidInstruction' : reserveAvailable
    ? canUndo ? 'reserveStalledHelp' : 'reserveStalledRestartHelp'
    : canUndo ? 'stalledHelp' : 'stalledRestartHelp';
  useEffect(() => {
    entrance.set(reduceMotion ? 1 : withTiming(1, { duration: 180 }));
    AccessibilityInfo.announceForAccessibility(title);
  }, [entrance, reduceMotion, title]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: entrance.value }));
  return <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
    <LinearGradient colors={['#172630F5', '#101C26F5']} style={[styles.panel, compact && styles.compactPanel]}>
      <View style={styles.heading}>
        <UiText accessibilityRole="header" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={.8} style={[styles.title, compact && styles.compactTitle, rtl ? styles.rtlTitle : styles.ltrTitle]}>{title}</UiText>
        <Pressable accessibilityRole="button" accessibilityLabel={t('close')} onPress={onClose} style={[styles.close, rtl ? styles.closeLeft : styles.closeRight]}><Icon name="close" size={18} color="#BDCDD3" /></Pressable>
      </View>
      <UiText numberOfLines={2} adjustsFontSizeToFit minimumFontScale={.8} style={[styles.note, compact && styles.compactNote]}>{t(help)}</UiText>
      <View style={[styles.actions, rtl && styles.reverse]}>
        {heatAvailable && <View style={styles.action}><GameButton compact={compact} kind="wide" tone="gold" icon="fire" label={t('heat')} onPress={onHeat} /></View>}
        {canUndo && <View style={styles.action}><GameButton compact={compact} kind="wide" tone="mint" icon="undo" label={t(compact ? 'undo' : 'undoStep')} accessibilityLabel={t('undoStep')} onPress={onUndo} /></View>}
        <View style={styles.action}><GameButton compact={compact} kind="wide" tone="blue" icon="reset" label={t('reset')} accessibilityLabel={t('resetHint')} onPress={onReset} /></View>
      </View>
    </LinearGradient>
  </Animated.View>;
}
const styles = StyleSheet.create({
  panel: { flex: 1, borderWidth: .5, borderColor: '#A7BCC155', borderRadius: 20, padding: 10, justifyContent: 'space-between' },
  compactPanel: { padding: 6, borderRadius: 16 },
  heading: { minHeight: 36, justifyContent: 'center' },
  title: { color: '#DCE8EC', fontSize: 17, lineHeight: 20, fontWeight: '500' },
  compactTitle: { fontSize: 14, lineHeight: 17 },
  ltrTitle: { paddingRight: 42 },
  rtlTitle: { paddingLeft: 42 },
  close: { position: 'absolute', top: -4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeLeft: { left: -4 },
  closeRight: { right: -4 },
  note: { color: '#9FB3BE', fontSize: 12, lineHeight: 17, marginBottom: 6 },
  compactNote: { fontSize: 10, lineHeight: 13, marginBottom: 3 },
  actions: { flexDirection: 'row', gap: 8 },
  reverse: { flexDirection: 'row-reverse' },
  action: { flex: 1 },
});
