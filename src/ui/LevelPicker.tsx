import { FocusablePressable as Pressable } from './FocusablePressable';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TIER_NAMES, TRIAL_TIERS, type CalibrationSample, type TrialTier } from '../game/calibration';
import { CALIBRATION_SAMPLES, DIFFICULTY } from './content';
import { MAINLINE } from './mainlineContent';
import { SOLID_SIDES } from './solidSideContent';
import { internalPreviewEntries } from './internalPreviewEntries';

type Props = { visible: boolean; currentCode: string | null; onClose: () => void; onSelect: (sample: CalibrationSample | null) => void; onPreview: (number: number) => void; onSidePreview: (number: number) => void };

export function LevelPicker({ visible, currentCode, onClose, onSelect, onPreview, onSidePreview }: Props) {
  const insets = useSafeAreaInsets();
  const [tier, setTier] = useState<TrialTier>('D1');
  const [sideVisible, setSideVisible] = useState(false);
  if (!visible) return null;
  return <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
    <View style={[styles.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.panel}>
        <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>选一题，慢慢玩</Text><Pressable accessibilityRole="button" accessibilityLabel="关闭选题" onPress={onClose} style={styles.close}><Text style={styles.closeText}>关闭</Text></Pressable></View>
        <Text style={styles.note}>内部题可用于对照，不解锁主线。返回主页后可继续原来的主线局面。</Text>
        <View accessibilityRole="tablist" style={styles.filters}>{TRIAL_TIERS.map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tier === value }} accessibilityLabel={`${value} ${TIER_NAMES[value]}试排题`} onPress={() => setTier(value)} style={[styles.filter, tier === value && styles.selected]}><Text style={styles.filterText}>{value}</Text><Text style={styles.filterText}>{TIER_NAMES[value]}</Text></Pressable>)}</View>
        <ScrollView contentContainerStyle={styles.list}>
          {internalPreviewEntries(MAINLINE.entries).map(entry => <Pressable key={entry.number} accessibilityRole="button" onPress={() => onPreview(entry.number)} style={styles.card}>
            <Text style={styles.name}>内部预览 · 第 {entry.number} 关</Text><Text style={styles.detail}>{entry.colorCount} 色 · {entry.bottleCount} 瓶 · 内部 {entry.rank} 级</Text>
          </Pressable>)}
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: sideVisible }} onPress={() => setSideVisible(value => !value)} style={styles.card}>
            <Text style={styles.name}>凝固目标瓶 · 50 道副关卡 {sideVisible ? '⌃' : '⌄'}</Text>
            <Text style={styles.detail}>可直接试玩任意一题；独立预览，不计入进度。</Text>
          </Pressable>
          {sideVisible && SOLID_SIDES.entries.map(entry => <Pressable key={entry.number} accessibilityRole="button" onPress={() => onSidePreview(entry.number)} style={styles.card}>
            <Text style={styles.name}>副关卡 {entry.number} · 主线 {entry.afterMainline} 后</Text>
            <Text style={styles.detail}>{entry.level.colors.length} 色 · {entry.level.bottles.length} 瓶 · 凝固最短 {entry.difficulty.frozenMoves} 步</Text>
          </Pressable>)}
          <Pressable accessibilityRole="button" accessibilityState={{ selected: currentCode === null }} onPress={() => onSelect(null)} style={[styles.card, currentCode === null && styles.selected]}>
            <Text style={styles.name}>原始体验 · 两色四瓶</Text><Text style={styles.detail}>保留已验证的倒水与画面基线</Text>
          </Pressable>
          <View>
            <Text accessibilityRole="header" style={styles.tier}>{tier} · {TIER_NAMES[tier]}（试排）</Text>
            {CALIBRATION_SAMPLES.filter(sample => sample.tier === tier).map(sample => <Pressable key={sample.code} accessibilityRole="button" accessibilityState={{ selected: currentCode === sample.code }} onPress={() => onSelect(sample)} style={[styles.card, currentCode === sample.code && styles.selected]}>
              <Text style={styles.name}>{sample.code} · {sample.content.metrics.colorCount} 色 · {sample.content.metrics.bottleCount} 瓶</Text>
              <Text style={styles.detail}>自动评级：{DIFFICULTY.get(sample.content.level.id)?.tier}（暂定）</Text>
              <Text style={styles.detail}>{sample.content.origin.config.emptyBottles} 个空瓶 · {sample.focus}</Text>
            </Pressable>)}
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#020D19CC', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  panel: { width: '100%', maxWidth: 520, maxHeight: '100%', flexShrink: 1, backgroundColor: '#122C39', borderRadius: 24, borderWidth: 1, borderColor: '#ADC6C540', padding: 18 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { color: '#F2EAD7', fontSize: 20, fontWeight: '600', flexShrink: 1 },
  close: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#E8CF93', fontSize: 13 },
  note: { color: '#A0B6B5', fontSize: 12, lineHeight: 20, marginBottom: 12 },
  list: { paddingBottom: 8 },
  filters: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  filter: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: '#ADC6C51C', alignItems: 'center', justifyContent: 'center', gap: 3 },
  filterText: { color: '#E4EBDF', fontSize: 12 },
  tier: { color: '#E8CF93', fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  card: { borderRadius: 14, borderWidth: 1, borderColor: '#ADC6C51C', backgroundColor: '#FFFFFF05', padding: 14, marginBottom: 8, minHeight: 68 },
  selected: { borderColor: '#B8F7E2', backgroundColor: '#B8F7E211' },
  name: { color: '#E4EBDF', fontSize: 14, fontWeight: '600' },
  detail: { color: '#A0B6B5', fontSize: 12, lineHeight: 19, marginTop: 5 },
});
