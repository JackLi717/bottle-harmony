import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Bottle } from '../art/Bottle';
import { COMPLETION_EFFECTS, type CompletionEffect } from '../art/bottleCompletion';

type Props = { visible: boolean; value: CompletionEffect; reduceMotion: boolean; onSelect: (effect: CompletionEffect) => void; onClose: () => void };
const COLORS = ['jade', 'jade', 'jade', 'jade'] as const;
const POSITION = { x: 0, y: 0 };

export function CompletionEffectPicker({ visible, value, reduceMotion, onSelect, onClose }: Props) {
  const progress = useSharedValue(1);
  const [replay, setReplay] = useState(0);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={styles.panel}>
      <View style={styles.heading}><Text style={styles.title}>完成一瓶的效果</Text><Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="关闭完成效果" style={styles.close}><Text style={styles.gold}>关闭</Text></Pressable></View>
      <Text style={styles.note}>点选一种，查看完成一瓶时的动画。</Text>
      <View style={styles.options}>{COMPLETION_EFFECTS.map((effect, index) => <Pressable key={effect.id} accessibilityRole="radio" accessibilityLabel={effect.name} accessibilityState={{ checked: value === effect.id }} onPress={() => { onSelect(effect.id); setReplay(value => value + 1); }} style={[styles.option, value === effect.id && styles.selected]}>
        <View pointerEvents="none" style={styles.preview}><Bottle index={100 + index} colors={COLORS} selected={false} completed width={80} scale={0.8} position={POSITION} plan={null} pour={null} progress={progress} completionEffect={effect.id} completionReplay={replay} completionAnimations={visible && !reduceMotion} /></View>
        <Text style={styles.gold}>{effect.name}{value === effect.id ? ' ✓' : ''}</Text>
      </Pressable>)}</View>
      <Pressable accessibilityRole="button" onPress={() => setReplay(value => value + 1)} style={styles.replay}><Text style={styles.gold}>重播完成动画</Text></Pressable>
      <Text style={styles.note}>效果在整瓶同色、四层装满后出现；撤销或重来会随局面更新。</Text>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#020D19CC', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  panel: { width: '100%', maxWidth: 480, borderRadius: 24, backgroundColor: '#122C39', borderWidth: 1, borderColor: '#ADC6C540', padding: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#F2EAD7', fontSize: 18, fontWeight: '600' },
  close: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  gold: { color: '#E8CF93', fontSize: 13 },
  note: { color: '#A0B6B5', fontSize: 12, lineHeight: 20, marginVertical: 10 },
  options: { flexDirection: 'row', gap: 4 },
  option: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: '#ADC6C528', borderRadius: 14, paddingVertical: 12 },
  selected: { borderColor: '#B8F7E2', backgroundColor: '#B8F7E211' },
  preview: { width: 80, height: 148 },
  replay: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: '#ADC6C528' },
});
