import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TIER_NAMES, type CalibrationSample } from '../game/calibration';
import type { DifficultyReport, PlanningDepthReport } from '../game/difficulty';
import type { HumanDifficultyReport } from '../game/humanDifficulty';

type Props = { visible: boolean; report: DifficultyReport | PlanningDepthReport; human?: HumanDifficultyReport | null; sample: CalibrationSample | null; label?: string; onClose: () => void };
const PLANNING_NAMES = { P1: '直接整理', P2: '短程取舍', P3: '多步协调', P4: '全局规划' };
const STATUS_NAMES = { passed: '通过', failed: '未通过', unknown: '未知' };

/** Only presents bundled offline evidence; never evaluates the playing board. */
export function DifficultyDebug({ visible, report, human, sample, label, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { metrics } = report;
  const metric = (value: number | null) => value === null ? '未知' : String(value);
  return <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
    <View style={[styles.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.panel}>
        <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>难度调试</Text><Pressable accessibilityRole="button" accessibilityLabel="关闭难度调试" onPress={onClose} style={styles.close}><Text style={styles.closeText}>关闭</Text></Pressable></View>
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.rating}>{label ?? sample?.code ?? '原始体验'} · {human?.score ? `人类代理 ${human.score.total} 分` : report.tier ? `${report.tier} ${TIER_NAMES[report.tier]}` : report.status === 'unsolvable' ? '已证明无解' : '评级未知'}</Text>
          <Text style={styles.note}>针对初始关卡，倒水后评级不变。{'rank' in report ? `内部规划级：${report.rank} / 8。` : '对照题使用原始四档报告。'}新分数尚待真人校准。</Text>
          {human?.score && <View style={styles.card}>
            <Text style={styles.section}>人类决策代理 · {human.model}</Text>
            <Text style={styles.detail}>选择风险 {human.score.trapPeak} / 35 · 反复风险 {human.score.trapRepeat} / 10 · 规划 {human.score.planning} / 10</Text>
            <Text style={styles.detail}>空间 {human.score.space} / 15 · 视觉 {human.score.visual} / 15 · 操作 {human.score.operations} / 15</Text>
            {human.decisions.map(decision => <Text key={decision.moveIndex} style={styles.detail}>第 {decision.moveIndex + 1} 步：{decision.choices} 种选择，{decision.deadEnds} 死路，{decision.costlyDetours} 高成本绕路，风险 {decision.risk.toFixed(2)}</Text>)}
          </View>}
          {sample && <Text style={styles.note}>人工试排：{sample.tier} {TIER_NAMES[sample.tier]}。分类仍保留试排，便于对照。</Text>}
          <View style={styles.card}>
            <Text style={styles.section}>空间与操作量</Text>
            <Text style={styles.detail}>{metrics.colors} 色 · {metrics.bottles} 瓶 · {metrics.initialEmptyBottles} 个初始空瓶</Text>
            <Text style={styles.detail}>空瓶 / 颜色：{metrics.spareColorRatio.toFixed(3)}（越小通常越需腾空间）</Text>
            <Text style={styles.detail}>初始颜色段：{metrics.colorRuns} · 最短倒水：{metric(metrics.shortestMoves)} 次</Text>
            <Text style={styles.detail}>参考路线最少剩余空瓶：{metric(metrics.minimumEmptyBottlesOnRoute)}</Text>
            <Text style={styles.detail}>最长连续准备：{metric(metrics.maximumPreparationMovesOnRoute)} 次倒水</Text>
            <Text style={styles.detail}>最少非等价合法选择：{metric(metrics.minimumLegalChoicesOnRoute)}</Text>
            <Text style={styles.note}>后三项描述一条独立最短路线，不能代表所有解法。准备动作指颜色段数未减少的倒水。</Text>
          </View>
          <Text style={styles.section}>规划层次验证</Text>
          {report.policies.map((policy, index) => <View key={index} style={styles.card}>
            <Text style={styles.section}>{policy.tier} {PLANNING_NAMES[policy.tier]} · {STATUS_NAMES[policy.status]}</Text>
            {policy.chainLimit === null ? <Text style={styles.detail}>低层均有失败反例；完整规则解法已回放。</Text> : <>
              <Text style={styles.detail}>整理段 ≤ {policy.chainLimit} 次倒水 · 前瞻 {policy.lookahead} 个整理段</Text>
              <Text style={styles.detail}>检查 {policy.checkedStates} 个局面 · 最多 {policy.maximumChoices} 个前沿选择</Text>
              <Text style={styles.detail}>排除 {policy.excludedChoices} 个短程卡点选择</Text>
            </>}
            <Text style={styles.note}>{policy.status === 'passed' ? `代表解法 ${policy.witness.length} 次倒水，已完整回放。` : policy.status === 'failed' ? `有 ${policy.witness.length} 步反例到策略卡点；不等于整关无解。统计截至找到反例。` : '达到预算，不能据此判高难或无解。'}</Text>
          </View>)}
          <Text style={styles.note}>本档位来自指定整理策略能否保障完成，不是所有人类技巧的最低能力证明。搜索工作量仅作工具预算，不计入难度分。</Text>
          <Text selectable style={styles.method}>方法：{report.policy}{report.reason ? ` · ${report.reason}` : ''}</Text>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#020D19CC', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  panel: { width: '100%', maxWidth: 520, maxHeight: '100%', flexShrink: 1, backgroundColor: '#122C39', borderRadius: 24, borderWidth: 1, borderColor: '#ADC6C540', padding: 18 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { color: '#F2EAD7', fontSize: 20, fontWeight: '600' },
  close: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#E8CF93', fontSize: 13 },
  list: { paddingBottom: 8 },
  rating: { color: '#B8F7E2', fontSize: 17, fontWeight: '600', marginBottom: 8 },
  note: { color: '#A0B6B5', fontSize: 12, lineHeight: 20, marginVertical: 5 },
  card: { borderRadius: 14, borderWidth: 1, borderColor: '#ADC6C51C', backgroundColor: '#FFFFFF05', padding: 12, marginVertical: 6 },
  section: { color: '#E8CF93', fontSize: 14, fontWeight: '600', marginVertical: 3 },
  detail: { color: '#E4EBDF', fontSize: 12, lineHeight: 21 },
  method: { color: '#819D9F', fontSize: 11, lineHeight: 18, marginTop: 4 },
});
