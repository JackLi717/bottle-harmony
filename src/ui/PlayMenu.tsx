import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PLAY_TIERS } from '../game/catalog';
import { TIER_NAMES } from '../game/calibration';
import type { PlayMode, PlayState } from '../game/play';
import { CATALOG } from './content';

type Props = { visible: boolean; play: PlayState; saveStatus: string; onClose: () => void; onStart: (mode: PlayMode) => void; onSkip: () => void; onSamples: () => void };
export function PlayMenu({ visible, play, saveStatus, onClose, onStart, onSkip, onSamples }: Props) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={[styles.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}><View style={styles.panel}>
      <View style={styles.heading}><Text style={styles.title}>自在游玩</Text><Pressable accessibilityRole="button" accessibilityLabel="关闭游玩菜单" onPress={onClose} style={styles.close}><Text style={styles.gold}>关闭</Text></Pressable></View>
      <ScrollView>
        <Text style={styles.note}>没有倒计时、体力和付费道具。可随时撤销、重来，或换一题。</Text>
        <Text style={styles.progress}>已完成 {play.completedIds.length} / {CATALOG.entries.length} 题 · {saveStatus}</Text>
        <Pressable accessibilityRole="button" onPress={onSkip} style={styles.card}><Text style={styles.name}>换一题</Text><Text style={styles.detail}>跳过不记完成，保持当前节奏和档位</Text></Pressable>
        <Text style={styles.note}>选择下方模式会开始新题，替换当前局面。每档 20 题，本档一轮玩完后可重玩。</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: play.mode === 'recommended' }} onPress={() => onStart('recommended')} style={[styles.card, play.mode === 'recommended' && styles.selected]}><Text style={styles.name}>推荐节奏</Text><Text style={styles.detail}>从轻松开始，穿插思考与挑战，再放松下来</Text></Pressable>
        {PLAY_TIERS.map(tier => <Pressable key={tier} accessibilityRole="button" accessibilityState={{ selected: play.mode === tier }} onPress={() => onStart(tier)} style={[styles.card, play.mode === tier && styles.selected]}><Text style={styles.name}>{tier} · {TIER_NAMES[tier]}</Text><Text style={styles.detail}>固定本档游玩 · 已完成 {CATALOG.entries.filter(entry => entry.difficulty.tier === tier && play.completedIds.includes(entry.content.level.id)).length} / 20</Text></Pressable>)}
        <Pressable accessibilityRole="button" onPress={onSamples} style={styles.card}><Text style={styles.name}>对照样题与原始体验</Text><Text style={styles.detail}>保留 C01–C08，便于比较和调试</Text></Pressable>
      </ScrollView>
    </View></View>
  </Modal>;
}
export function Tutorial({ visible, notice, onStart, onSkip }: { visible: boolean; notice?: string; onStart: () => void; onSkip: () => void }) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onStart}>
    <View style={[styles.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}><View style={styles.panel}>
      <Text style={styles.title}>从两种颜色开始</Text>
      {!!notice && <Text style={[styles.note, styles.gold]}>{notice}</Text>}
      <Text style={styles.note}>先点有水的瓶子，再点空瓶或顶部同色的瓶子。</Text>
      <Text style={styles.note}>连续同色会一起倒过去，空间不足时只倒能装下的部分。</Text>
      <Text style={styles.note}>把每种颜色装满一瓶就完成了。随时撤销、重来；卡住时可演示一步。</Text>
      <Pressable accessibilityRole="button" onPress={onStart} style={[styles.card, styles.selected]}><Text style={styles.name}>先体验一题</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onSkip} style={styles.card}><Text style={styles.name}>我会玩，直接开始</Text></Pressable>
    </View></View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#020D19CC', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  panel: { width: '100%', maxWidth: 520, maxHeight: '100%', flexShrink: 1, backgroundColor: '#122C39', borderRadius: 24, borderWidth: 1, borderColor: '#ADC6C540', padding: 18 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#F2EAD7', fontSize: 20, fontWeight: '600' },
  close: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  gold: { color: '#E8CF93', fontSize: 13 },
  note: { color: '#A0B6B5', fontSize: 12, lineHeight: 21, marginVertical: 8 },
  progress: { color: '#E8CF93', fontSize: 12, marginVertical: 8 },
  card: { borderRadius: 14, borderWidth: 1, borderColor: '#ADC6C51C', backgroundColor: '#FFFFFF05', padding: 14, marginVertical: 5, minHeight: 48 },
  selected: { borderColor: '#B8F7E2', backgroundColor: '#B8F7E211' },
  name: { color: '#E4EBDF', fontSize: 14, fontWeight: '600' },
  detail: { color: '#A0B6B5', fontSize: 12, lineHeight: 19, marginTop: 5 },
});
