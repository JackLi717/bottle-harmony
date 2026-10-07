import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function Tutorial({ visible, notice, onStart, onSkip }: { visible: boolean; notice?: string; onStart: () => void; onSkip: () => void }) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onStart}>
    <View style={[styles.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}><View style={styles.panel}>
      <Text style={styles.title}>从两种颜色开始</Text>
      <Text style={styles.note}>一千个固定关卡，完成后解锁下一关。已通过的关卡可以随时重玩。</Text>
      {!!notice && <Text style={[styles.note, styles.gold]}>{notice}</Text>}
      <Text style={styles.note}>先点有水的瓶子，再点空瓶或顶部同色的瓶子。</Text>
      <Text style={styles.note}>连续同色会一起倒过去，空间不足时只倒能装下的部分。</Text>
      <Text style={styles.note}>把每种颜色装满一瓶就完成了。随时撤销、重来；卡住时可演示一步。</Text>
      <Pressable accessibilityRole="button" onPress={onStart} style={[styles.card, styles.selected]}><Text style={styles.name}>开始第一关</Text></Pressable>
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
