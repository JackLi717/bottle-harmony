import { StyleSheet, View } from 'react-native';
import type { VesselDesign, VesselId } from '../art/vesselDesigns';
import { VesselCarousel } from './VesselCarousel';
import { UiText, useI18n } from '../i18n/I18n';
import { GameButton } from './GameButton';
import { MAX_HINT_CREDITS } from '../game/mainline';

export function HomeScreen({ current, sideNumber, hintCredits, compact, onPlay, onLevels, onSettings, vessel, vesselSaved, reduceMotion, onVessel }: { current: number; sideNumber?: number | null; hintCredits: number; compact: boolean; onPlay: () => void; onLevels: () => void; onSettings: () => void; vessel: VesselDesign; vesselSaved: boolean; reduceMotion: boolean; onVessel: (id: VesselId) => void }) {
  const { t, rtl } = useI18n();
  return <View style={styles.home}>
    <View style={[styles.top, rtl && styles.reverse]}><GameButton kind="icon" icon="settings" label={t('settings')} onPress={onSettings} /></View>
    <View style={[styles.center, compact && styles.compactCenter]}>
      <UiText style={[styles.brand, compact && styles.compactBrand]}>BOTTLE</UiText><UiText style={styles.subtitle}>HARMONY</UiText>
      <VesselCarousel vessel={vessel} compact={compact} saved={vesselSaved} reduceMotion={reduceMotion} onSelect={onVessel} />
      <View style={styles.actions}>
        <GameButton kind="wide" tone="mint" icon="play" label={sideNumber ? t('solidSideLabel', { n: sideNumber }) : `Level ${current}`} accessibilityLabel={sideNumber ? t('solidSideLabel', { n: sideNumber }) : t('continueLevel', { n: current })} onPress={onPlay} />
        <GameButton kind="wide" tone="violet" icon="levels" label={t('levels')} onPress={onLevels} />
      </View>
      <UiText style={styles.hintCredits}>{t('hintCredits', { n: hintCredits, max: MAX_HINT_CREDITS })}</UiText>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  home: { flex: 1 },
  top: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end' },
  reverse: { flexDirection: 'row-reverse' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 46 },
  compactCenter: { paddingBottom: 20 },
  brand: { color: '#EBD8AD', fontSize: 36, fontWeight: '500', letterSpacing: 7, textAlign: 'center', writingDirection: 'ltr' },
  compactBrand: { fontSize: 30 },
  subtitle: { color: '#9AAFBA', fontSize: 12, letterSpacing: 7, textAlign: 'center', writingDirection: 'ltr', marginTop: 10 },
  actions: { width: '100%', maxWidth: 280, gap: 12 },
  hintCredits: { color: '#CEBA8D', fontSize: 12, textAlign: 'center', marginTop: 12 },
});
