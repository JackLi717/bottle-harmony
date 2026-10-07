import { UiText, useI18n } from '../i18n/I18n';
import { useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { GameButton } from './GameButton';
import { StalledNotice } from './StalledNotice';
import type { StalledReason } from './stalledNoticePolicy';

type Props = { won: boolean; continueVisible: boolean; compact: boolean; disabled: boolean; undoDisabled: boolean; searching: boolean; reduceMotion: boolean; nextLabel: string; hintStatus: string; onUndo: () => void; onHint: () => void; onReset: () => void; onContinue: () => void; stalledReason: StalledReason | null; onCloseStalled: () => void };
export function GameFooter({ won, continueVisible, compact, disabled, undoDisabled, searching, reduceMotion, nextLabel, hintStatus, onUndo, onHint, onReset, onContinue, stalledReason, onCloseStalled }: Props) {
  const { t, rtl } = useI18n();
  const entrance = useSharedValue(continueVisible ? 1 : 0);
  useEffect(() => {
    entrance.set(continueVisible ? reduceMotion ? 1 : withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }) : 0);
  }, [continueVisible, reduceMotion, entrance]);
  const celebrationStyle = useAnimatedStyle(() => ({ opacity: entrance.value, transform: [{ translateY: 8 * (1 - entrance.value) }] }));
  return <View style={styles.footer}>
    <View style={styles.content}>
    {/* An empty reserved area keeps bottle size fixed when the next button appears. */}
    <View style={[styles.continueArea, compact && styles.compactContinueArea]}>
      {continueVisible && <Animated.View style={[styles.continueButton, celebrationStyle]}>
        <GameButton compact={compact} kind="wide" tone="mint" icon="play" label={nextLabel} disabled={disabled} onPress={onContinue} />
      </Animated.View>}
      {(!continueVisible || !compact) && <UiText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.75} style={styles.hintStatus}>{hintStatus}</UiText>}
    </View>
    <LinearGradient colors={['#17313C99', '#11263199']} style={[styles.dock, compact && styles.compactDock, rtl && styles.reverse, stalledReason && styles.hiddenDock]}>
      {stalledReason ? <View style={[styles.toolSpace, compact && styles.compactToolSpace]} /> : <>
      <GameButton compact={compact} tone="violet" icon="undo" label={t('undo')} accessibilityLabel={t('undoHint')} disabled={undoDisabled} onPress={onUndo} />
      <GameButton compact={compact} tone="gold" icon="hint" label={t(searching ? 'searching' : 'hint')} accessibilityLabel={t('hintHint')} disabled={disabled || won} onPress={onHint} />
      <GameButton compact={compact} tone="blue" icon="reset" label={t('reset')} accessibilityLabel={t('resetHint')} disabled={disabled} onPress={onReset} />
      </>}
    </LinearGradient>
    </View>
    {stalledReason && <StalledNotice reason={stalledReason} compact={compact} canUndo={!undoDisabled} reduceMotion={reduceMotion} onClose={onCloseStalled} onUndo={onUndo} onReset={onReset} />}
  </View>;
}
const styles = StyleSheet.create({
  footer: { width: '100%', maxWidth: 420, alignSelf: 'center', alignItems: 'center', paddingTop: 4 },
  hiddenDock: { opacity: 0 },
  toolSpace: { width: 254, height: 68 },
  compactToolSpace: { height: 56 },
  content: { width: '100%', alignItems: 'center' },
  continueArea: { height: 66, width: '100%', alignItems: 'center', justifyContent: 'center' },
  compactContinueArea: { height: 52 },
  continueButton: { width: '100%', maxWidth: 280 },
  hintStatus: { color: '#CEBA8D', fontSize: 11, lineHeight: 13, textAlign: 'center', width: '100%' },
  reverse: { flexDirection: 'row-reverse' },
  dock: { flexDirection: 'row', gap: 16, padding: 10, borderWidth: .5, borderColor: '#C7AD7833', borderRadius: 22 },
  compactDock: { padding: 6 },
});
