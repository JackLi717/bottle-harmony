import { UiText, useI18n } from '../i18n/I18n';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue } from 'react-native-reanimated';
import { Bottle } from '../art/Bottle';
import { GameButton } from './GameButton';

export function Tutorial({ visible, notice, onStart, onSkip }: { visible: boolean; notice?: string; onStart: () => void; onSkip: () => void }) {
  const { t, rtl } = useI18n();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(1);
  const compact = useWindowDimensions().height < 720;
  const bottleScale = compact ? .48 : .64;
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onStart}>
    <View style={[styles.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <LinearGradient colors={['#203745', '#102230']} style={styles.panel}><ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <UiText style={styles.brand}>BOTTLE HARMONY</UiText><UiText style={[styles.title, compact && styles.compactTitle]}>{t('tutorialTitle')}</UiText>
        <View pointerEvents="none" style={[styles.preview, compact && styles.compactPreview]}>
          <Bottle index={200} colors={['jade', 'jade', 'coral', 'coral']} selected={false} completed={false} width={100 * bottleScale} scale={bottleScale} position={{ x: 0, y: 0 }} plan={null} pour={null} progress={progress} completionAnimations={false} />
          <UiText style={[styles.arrow, compact && styles.compactArrow]}>→</UiText>
          <Bottle index={201} colors={['jade', 'jade', 'jade', 'jade']} selected={false} completed width={100 * bottleScale} scale={bottleScale} position={{ x: 144 / bottleScale, y: 0 }} plan={null} pour={null} progress={progress} completionEffect="cork" completionAnimations={false} />
        </View>
        {[[t('step1'), t('step1Note')], [t('step2'), t('pourTarget')], [t('step3'), t('objective')]].map(([title, note], index) => <View key={title} style={[styles.step, compact && styles.compactStep, rtl && styles.reverse]}><View style={styles.stepNumber}><UiText style={styles.number}>{index + 1}</UiText></View><View style={styles.stepCopy}><UiText style={styles.stepTitle}>{title}</UiText><UiText style={[styles.note, compact && styles.compactNote]}>{note}</UiText></View></View>)}
        {!!notice && <UiText style={styles.notice}>{notice}</UiText>}
        <UiText style={[styles.tip, compact && styles.compactTip]}>{t('tutorialTip')}</UiText>
      </ScrollView>
        <GameButton kind="wide" tone="mint" icon="play" label={t('start')} onPress={onStart} />
        <Pressable accessibilityRole="button" onPress={onSkip} style={styles.skip}><UiText style={styles.note}>{t('skip')}</UiText></Pressable>
      </LinearGradient>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#050E19CC', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  panel: { width: '100%', maxWidth: 420, maxHeight: '100%', flexShrink: 1, borderRadius: 28, borderWidth: 1, borderColor: '#C7AD7866', padding: 18 },
  content: { alignItems: 'center' },
  scroll: { flexShrink: 1 },
  brand: { color: '#C7AD78', fontSize: 10, fontWeight: '500', letterSpacing: 2, marginTop: 4 },
  title: { color: '#EBD8AD', fontSize: 24, fontWeight: '500', marginTop: 12, textAlign: 'center' },
  compactTitle: { fontSize: 20 },
  compactNote: { fontSize: 11, lineHeight: 17 },
  preview: { width: 208, height: 122, marginTop: 15, marginBottom: 8 },
  compactPreview: { height: 76, marginTop: 10 },
  arrow: { position: 'absolute', left: 91, top: 38, color: '#F4D38C', fontSize: 28 },
  compactArrow: { top: 25 },
  step: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  compactStep: { paddingVertical: 4 },
  reverse: { flexDirection: 'row-reverse' },
  stepCopy: { flex: 1 },
  stepNumber: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#243F4C', borderWidth: 1, borderColor: '#C7AD7855', alignItems: 'center', justifyContent: 'center' },
  number: { color: '#EBD8AD', fontSize: 15, fontWeight: '600' },
  stepTitle: { color: '#D7E3E7', fontSize: 15, fontWeight: '500' },
  note: { color: '#9AAFBA', fontSize: 12, lineHeight: 19, marginTop: 3 },
  notice: { color: '#F4D38C', fontSize: 12, lineHeight: 19, marginVertical: 8 },
  tip: { color: '#ADBFCA', fontSize: 11, marginVertical: 14, textAlign: 'center' },
  compactTip: { marginVertical: 8 },
  skip: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
});
