import { UiText, useI18n } from '../i18n/I18n';
import { useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { GameButton } from './GameButton';
import { StalledNotice } from './StalledNotice';
import type { StalledReason } from './stalledNoticePolicy';

type Props = { rail?: boolean; won: boolean; continueVisible: boolean; compact: boolean; disabled: boolean; undoDisabled: boolean; searching: boolean; reduceMotion: boolean; nextLabel: string; hintStatus: string; onUndo: () => void; onHint: () => void; onReset: () => void; onContinue: () => void; stalledReason: StalledReason | null; reserveAvailable?: boolean; heatAvailable?: boolean; onHeat?: () => void; onCloseStalled: () => void };
export function GameFooter({ rail = false, won, continueVisible, compact, disabled, undoDisabled, searching, reduceMotion, nextLabel, hintStatus, onUndo, onHint, onReset, onContinue, stalledReason, reserveAvailable = false, heatAvailable = false, onHeat = () => {}, onCloseStalled }: Props) {
  const { t, rtl } = useI18n();
  const entrance = useSharedValue(continueVisible ? 1 : 0);
  useEffect(() => {
    entrance.set(continueVisible ? reduceMotion ? 1 : withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }) : 0);
  }, [continueVisible, reduceMotion, entrance]);
  const celebrationStyle = useAnimatedStyle(() => ({ opacity: entrance.value, transform: [{ translateY: 8 * (1 - entrance.value) }] }));
  return <View style={[styles.footer, rail && styles.railFooter, rail && { width: Platform.isTV ? 240 : 168 }]}>
    <View style={styles.content}>
    {/* An empty reserved area keeps bottle size fixed when the next button appears. */}
    <View style={[styles.continueArea, compact && styles.compactContinueArea, rail && styles.railContinue]}>
      {continueVisible && <Animated.View style={[styles.continueButton, celebrationStyle]}>
        <GameButton preferredFocus compact={compact} kind="wide" tone="mint" icon="play" label={nextLabel} disabled={disabled} onPress={onContinue} />
      </Animated.View>}
      {heatAvailable && !won && !stalledReason ? <GameButton compact={compact} kind="wide" tone="gold" icon="fire" label={t('meltTarget')} disabled={disabled} onPress={onHeat} style={styles.heatButton} />
        : (!continueVisible || !compact) && <UiText numberOfLines={rail ? 4 : 1} adjustsFontSizeToFit minimumFontScale={.75} style={styles.hintStatus}>{hintStatus}</UiText>}
    </View>
    <LinearGradient colors={['#17313C99', '#11263199']} style={[styles.dock, compact && styles.compactDock, rtl && !rail && styles.reverse, rail && styles.railDock, stalledReason && styles.hiddenDock]}>
      {stalledReason ? <View style={[styles.toolSpace, compact && styles.compactToolSpace]} /> : <>
      <GameButton compact={compact} kind={rail ? 'wide' : 'tool'} tone="violet" icon="undo" label={t('undo')} accessibilityLabel={t('undoHint')} disabled={undoDisabled} onPress={onUndo} />
      <GameButton compact={compact} kind={rail ? 'wide' : 'tool'} tone="gold" icon="hint" label={t(searching ? 'searching' : 'hint')} accessibilityLabel={t('hintHint')} disabled={disabled || won} onPress={onHint} />
      <GameButton compact={compact} kind={rail ? 'wide' : 'tool'} tone="blue" icon="reset" label={t('reset')} accessibilityLabel={t('resetHint')} disabled={disabled} onPress={onReset} />
      </>}
    </LinearGradient>
    </View>
    {stalledReason && <StalledNotice rail={rail} reason={stalledReason} compact={compact} canUndo={!undoDisabled} reserveAvailable={reserveAvailable} heatAvailable={heatAvailable} reduceMotion={reduceMotion} onClose={onCloseStalled} onUndo={onUndo} onReset={onReset} onHeat={onHeat} />}
  </View>;
}
const styles = StyleSheet.create({
  footer: { width: '100%', maxWidth: 420, alignSelf: 'center', alignItems: 'center', paddingTop: 4 },
  railFooter: { alignSelf: 'stretch', justifyContent: 'center', paddingTop: 0 },
  railContinue: { minHeight: 80, height: 'auto', paddingVertical: 12 },
  railDock: { flexDirection: 'column', gap: 16, width: '100%' },
  hiddenDock: { opacity: 0 },
  toolSpace: { width: 254, height: 68 },
  compactToolSpace: { height: 56 },
  content: { width: '100%', alignItems: 'center' },
  continueArea: { height: 66, width: '100%', alignItems: 'center', justifyContent: 'center' },
  compactContinueArea: { height: 52 },
  continueButton: { width: '100%', maxWidth: 280 },
  heatButton: { width: '100%', maxWidth: 240, minHeight: 46 },
  hintStatus: { color: '#CEBA8D', fontSize: 11, lineHeight: 13, textAlign: 'center', width: '100%' },
  reverse: { flexDirection: 'row-reverse' },
  dock: { flexDirection: 'row', gap: 16, padding: 10, borderWidth: .5, borderColor: '#C7AD7833', borderRadius: 22 },
  compactDock: { padding: 6 },
});
