import { StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Bottle } from '../art/Bottle';
import { UiText, useI18n } from '../i18n/I18n';
import { GameButton } from './GameButton';

export function HomeScreen({ current, compact, notice, onPlay, onLevels, onSettings }: { current: number; compact: boolean; notice?: string; onPlay: () => void; onLevels: () => void; onSettings: () => void }) {
  const { t, rtl } = useI18n();
  const progress = useSharedValue(1);
  const scale = compact ? .75 : 1;
  return <View style={styles.home}>
    <View style={[styles.top, rtl && styles.reverse]}><GameButton kind="icon" icon="settings" label={t('settings')} onPress={onSettings} /></View>
    <View style={[styles.center, compact && styles.compactCenter]}>
      <UiText style={[styles.brand, compact && styles.compactBrand]}>BOTTLE</UiText><UiText style={styles.subtitle}>HARMONY</UiText>
      <View pointerEvents="none" style={[styles.art, { width: 220 * scale, height: 185 * scale }]}>
        <Bottle index={300} colors={['jade','jade','jade','jade']} completed selected={false} width={100 * scale} scale={scale} position={{ x: 0, y: 0 }} plan={null} pour={null} progress={progress} completionEffect="cork" completionAnimations={false} />
        <Bottle index={301} colors={['amber','amber','amber','amber']} completed selected={false} width={100 * scale} scale={scale} position={{ x: 120, y: 0 }} plan={null} pour={null} progress={progress} completionEffect="cork" completionAnimations={false} />
      </View>
      <View style={styles.actions}>
        <GameButton kind="wide" tone="mint" icon="play" label={`Level ${current}`} accessibilityLabel={t('continueLevel', { n: current })} onPress={onPlay} />
        <GameButton kind="wide" tone="violet" icon="levels" label={t('levels')} onPress={onLevels} />
      </View>
      {!!notice && <UiText style={styles.notice}>{notice}</UiText>}
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
  art: { marginVertical: 26 },
  actions: { width: '100%', maxWidth: 280, gap: 12 },
  notice: { color: '#DEC797', fontSize: 12, textAlign: 'center', marginTop: 16 },
});
