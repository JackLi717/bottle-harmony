import { FocusablePressable as Pressable } from './FocusablePressable';
import { UiText, useI18n } from '../i18n/I18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Bottle } from '../art/Bottle';
import { COMPLETION_EFFECTS, type CompletionEffect } from '../art/bottleCompletion';
import { GameButton } from './GameButton';
import { vesselCompletionEffect, type VesselDesign } from '../art/vesselDesigns';

type Props = { visible: boolean; value: CompletionEffect; reduceMotion: boolean; onSelect: (effect: CompletionEffect) => void; onClose: () => void; vessel: VesselDesign };
const COLORS = ['jade', 'jade', 'jade', 'jade'] as const;
const POSITION = { x: 0, y: 0 };

export function CompletionEffectPicker({ visible, value, reduceMotion, onSelect, onClose, vessel }: Props) {
  const { t, rtl } = useI18n();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(1);
  const [replay, setReplay] = useState(0);
  const effective = vesselCompletionEffect(vessel, value);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={[styles.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}><View style={styles.panel}>
      <View style={[styles.heading, rtl && styles.reverse]}><UiText style={styles.title}>{t('effects')}</UiText><GameButton kind="icon" icon="close" label={t('close')} onPress={onClose} /></View>
      <ScrollView style={styles.scroll}><UiText style={styles.note}>{t('effectsNote')}</UiText>
      <View style={styles.options}>{COMPLETION_EFFECTS.filter(effect => effect.id !== 'cork' || vessel.cork).map((effect, index) => <Pressable key={effect.id} accessibilityRole="radio" accessibilityLabel={t(effect.id)} accessibilityState={{ checked: effective === effect.id }} onPress={() => { onSelect(effect.id); setReplay(value => value + 1); }} style={[styles.option, effective === effect.id && styles.selected]}>
        <View pointerEvents="none" style={styles.preview}><Bottle index={100 + index} vessel={vessel} colors={COLORS} selected={false} completed width={80} scale={0.8} position={POSITION} plan={null} pour={null} progress={progress} completionEffect={effect.id} completionReplay={replay} completionAnimations={visible && !reduceMotion} /></View>
        <UiText style={styles.gold}>{t(effect.id)}{effective === effect.id ? ' ✓' : ''}</UiText>
      </Pressable>)}</View>
      <GameButton kind="wide" tone="gold" icon="play" label={t('replayAnimation')} onPress={() => setReplay(value => value + 1)} style={styles.replay} />
      <UiText style={styles.note}>{t('effectsRule')}</UiText></ScrollView>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#050E19CC', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexShrink: 1 },
  panel: { maxHeight: '100%', width: '100%', maxWidth: 480, borderRadius: 28, backgroundColor: '#172B38', borderWidth: 1, borderColor: '#C7AD7866', padding: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reverse: { flexDirection: 'row-reverse' },
  title: { flex: 1, color: '#EBD8AD', fontSize: 20, fontWeight: '500' },
  gold: { color: '#E8CF93', fontSize: 12, textAlign: 'center', paddingHorizontal: 3 },
  note: { color: '#9AAFBA', fontSize: 12, lineHeight: 20, marginVertical: 10 },
  options: { flexDirection: 'row', gap: 4 },
  option: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: '#809AA855', borderRadius: 18, paddingVertical: 12 },
  selected: { borderColor: '#B8F7E2', backgroundColor: '#B8F7E211' },
  preview: { width: 80, height: 148 },
  replay: { marginTop: 8 },
});
