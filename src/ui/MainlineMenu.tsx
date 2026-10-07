import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MainlineState } from '../game/mainline';
import { INTERNAL_TOOLS } from './buildConfig';

const NUMBERS = Array.from({ length: 1000 }, (_, i) => i + 1);
type Props = { visible: boolean; play: MainlineState; saveStatus: string; onClose: () => void; onResume: () => void; onSelect: (number: number) => void; onSamples: () => void; onSymbols: () => void; symbols: boolean; completionName: string; onCompletionEffects: () => void };
export function MainlineMenu({ visible, play, saveStatus, onClose, onResume, onSelect, onSamples, onSymbols, symbols, completionName, onCompletionEffects }: Props) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={[styles.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}><View style={styles.panel}>
      <View style={styles.heading}><Text style={styles.title}>一千关，慢慢归位</Text><Pressable accessibilityRole="button" accessibilityLabel="关闭选关" onPress={onClose} style={styles.close}><Text style={styles.gold}>关闭</Text></Pressable></View>
      <Text style={styles.note}>已通过 {play.completedThrough} / 1000 关 · {saveStatus}</Text>
      <Pressable accessibilityRole="button" onPress={onResume} style={styles.action}><Text style={styles.gold}>继续主线 · 第 {play.current} 关</Text></Pressable>
      <Text style={styles.note}>已通过的关卡可以重玩。每十关一次挑战，之后轻松下来。</Text>
      <FlatList data={NUMBERS} numColumns={5} keyExtractor={number => String(number)} initialScrollIndex={Math.floor((play.current - 1) / 5)}
        getItemLayout={(_, index) => ({ length: 60, offset: 60 * index, index })} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={5}
        style={styles.list} renderItem={({ item: number }) => {
          const unlocked = number <= play.completedThrough || number === play.current;
          return <Pressable accessibilityRole="button" accessibilityLabel={`第${number}关${unlocked ? number <= play.completedThrough ? '，已通过' : '，当前关卡' : '，未解锁'}`}
            accessibilityState={{ disabled: !unlocked, selected: number === play.current }} disabled={!unlocked} onPress={() => onSelect(number)}
            style={[styles.cell, number === play.current && styles.selected, !unlocked && styles.locked]}>
            <Text style={[styles.number, number % 10 === 0 && styles.challenge]}>{number}</Text><Text style={styles.mark}>{number <= play.completedThrough ? '✓' : unlocked ? '继续' : '·'}</Text>
          </Pressable>;
        }} />
      <Pressable accessibilityRole="button" onPress={onCompletionEffects} style={styles.close}><Text style={styles.gold}>完成效果：{completionName} ›</Text></Pressable>
      <View style={styles.heading}><Pressable accessibilityRole="button" onPress={onSymbols} style={styles.close}><Text style={styles.gold}>辅助符号：{symbols ? '开' : '关'}</Text></Pressable>
        {INTERNAL_TOOLS && <Pressable accessibilityRole="button" onPress={onSamples} style={styles.close}><Text style={styles.note}>内部对照题</Text></Pressable>}</View>
    </View></View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#020D19CC', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  panel: { width: '100%', maxWidth: 520, height: '85%', backgroundColor: '#122C39', borderRadius: 24, borderWidth: 1, borderColor: '#ADC6C540', padding: 16 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#F2EAD7', fontSize: 19, fontWeight: '600' },
  close: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  gold: { color: '#E8CF93', fontSize: 13 },
  note: { color: '#A0B6B5', fontSize: 12, lineHeight: 20, marginVertical: 7 },
  action: { borderWidth: 1, borderColor: '#B8F7E260', backgroundColor: '#B8F7E211', minHeight: 48, padding: 14, borderRadius: 14 },
  list: { flex: 1, marginVertical: 6 },
  cell: { flex: 1, height: 52, margin: 4, borderWidth: 1, borderColor: '#ADC6C528', borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF08' },
  selected: { borderColor: '#B8F7E2', backgroundColor: '#B8F7E218' },
  locked: { opacity: 0.35 },
  number: { color: '#E4EBDF', fontSize: 13, fontWeight: '600' },
  mark: { color: '#A0B6B5', fontSize: 9, marginTop: 3 },
  challenge: { color: '#E8CF93' },
});
