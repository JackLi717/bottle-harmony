import { Modal, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Bottle } from '../art/Bottle';
import type { VesselDesign } from '../art/vesselDesigns';
import { UiText, useI18n } from '../i18n/I18n';
import { GameButton } from './GameButton';
import { ReadableScrollView } from './ReadableScrollView';

export function MemoryTutorial({ visible, vessel, onStart, onBack }: { visible: boolean; vessel: VesselDesign; onStart: () => void; onBack: () => void }) {
  const { t } = useI18n();
  const progress = useSharedValue(1);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onBack}>
    <View style={styles.backdrop}><LinearGradient colors={['#203745', '#102230']} style={styles.panel}>
      <ReadableScrollView contentContainerStyle={styles.content}>
        <UiText style={styles.title}>{t('memoryMode')}</UiText>
        <View pointerEvents="none" style={styles.preview}>
          {[false, true].map((hidden, i) => <Bottle key={i} index={300 + i} vessel={vessel} colors={['jade', 'coral', 'amber', 'amber']} hiddenLayers={hidden ? [false, true, false, true] : []} markedLayers={hidden ? [] : [false, true, false, true]} selected={false} completed={false} width={65} scale={.65} position={{ x: i * 205, y: 0 }} plan={null} pour={null} progress={progress} completionAnimations={false} />)}
          <UiText style={styles.arrow}>→</UiText>
        </View>
        {(['memoryStep1', 'memoryStep2', 'memoryStep3'] as const).map((key, i) => <UiText key={key} style={styles.step}>{i + 1}. {t(key)}</UiText>)}
      </ReadableScrollView>
      <GameButton preferredFocus kind="wide" tone="mint" icon="play" label={t('memoryStart')} onPress={onStart} />
      <GameButton kind="wide" icon="back" label={t('back')} onPress={onBack} style={styles.back} />
    </LinearGradient></View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#050E19EE' },
  panel: { width: '100%', maxWidth: 420, maxHeight: '100%', padding: 20, borderRadius: 24, borderWidth: 1, borderColor: '#C7AD7866' },
  content: { alignItems: 'center', paddingBottom: 20 },
  title: { color: '#EBD8AD', fontSize: 24, textAlign: 'center' },
  preview: { width: 200, height: 125, marginVertical: 20 },
  arrow: { position: 'absolute', left: 88, top: 40, fontSize: 24, color: '#EBD8AD' },
  step: { width: '100%', color: '#D7E3E7', fontSize: 14, lineHeight: 23, marginTop: 12 },
  back: { marginTop: 10 },
});
