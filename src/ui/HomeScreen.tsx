import { ScrollView, StyleSheet, View } from 'react-native';
import type { VesselDesign, VesselId } from '../art/vesselDesigns';
import { VesselCarousel } from './VesselCarousel';
import { UiText, useI18n } from '../i18n/I18n';
import { GameButton } from './GameButton';
import { MAX_HINT_CREDITS } from '../game/mainline';

export function HomeScreen({ current, sideNumber, hintCredits, compact, landscape = false, onPlay, onMemory, onSettings, vessel, vesselSaved, reduceMotion, onVessel }: { current: number; sideNumber?: number | null; hintCredits: number; compact: boolean; landscape?: boolean; onPlay: () => void; onMemory: () => void; onSettings: () => void; vessel: VesselDesign; vesselSaved: boolean; reduceMotion: boolean; onVessel: (id: VesselId) => void }) {
  const { t, rtl } = useI18n();
  const currentLabel = sideNumber ? t('solidSideLabel', { n: sideNumber }) : t('continueLevel', { n: current });
  return <View style={styles.home}>
    <View style={[styles.top, rtl && styles.reverse]}><GameButton kind="icon" icon="settings" label={t('settings')} onPress={onSettings} /></View>
    <ScrollView contentContainerStyle={[styles.center, compact && styles.compactCenter, landscape && styles.landscape]} showsVerticalScrollIndicator={false}>
      <View style={[styles.showcase, landscape && styles.landscapeSection]}>
      <UiText style={[styles.brand, compact && styles.compactBrand]}>BOTTLE</UiText><UiText style={styles.subtitle}>HARMONY</UiText>
      <VesselCarousel vessel={vessel} compact={compact} saved={vesselSaved} reduceMotion={reduceMotion} onSelect={onVessel} />
      </View>
      <View style={[styles.actionSection, landscape && styles.landscapeSection]}>
      <View style={styles.actions}>
        <View style={styles.classicEntry}>
          <GameButton preferredFocus kind="wide" tone="mint" icon="play" label={t('classicMode')} accessibilityLabel={`${t('classicMode')} · ${currentLabel}`} onPress={onPlay} />
          <UiText style={styles.currentLevel}>{currentLabel}</UiText>
        </View>
        <GameButton kind="wide" tone="gold" icon="eye" label={t('memoryMode')} onPress={onMemory} />
      </View>
      <UiText style={styles.hintCredits}>{t('hintCredits', { n: hintCredits, max: MAX_HINT_CREDITS })}</UiText>
      </View>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  home: { flex: 1 },
  top: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end' },
  reverse: { flexDirection: 'row-reverse' },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 46 },
  showcase: { width: '100%', alignItems: 'center' },
  actionSection: { width: '100%', alignItems: 'center' },
  landscape: { flexDirection: 'row', alignSelf: 'center', width: '100%', maxWidth: 1000, gap: 24 },
  landscapeSection: { flex: 1, minWidth: 0 },
  compactCenter: { paddingBottom: 20 },
  brand: { color: '#EBD8AD', fontSize: 36, fontWeight: '500', letterSpacing: 7, textAlign: 'center', writingDirection: 'ltr' },
  compactBrand: { fontSize: 30 },
  subtitle: { color: '#9AAFBA', fontSize: 12, letterSpacing: 7, textAlign: 'center', writingDirection: 'ltr', marginTop: 10 },
  classicEntry: { gap: 5 },
  currentLevel: { color: '#9AAFBA', fontSize: 12, textAlign: 'center' },
  actions: { width: '100%', maxWidth: 280, gap: 12 },
  hintCredits: { color: '#CEBA8D', fontSize: 12, textAlign: 'center', marginTop: 12 },
});
