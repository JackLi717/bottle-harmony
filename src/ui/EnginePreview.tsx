import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Dimensions, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cancelAnimation, Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { UiText, useI18n } from '../i18n/I18n';
import type { MessageKey } from '../i18n/messages';
import { Bottle } from '../art/Bottle';
import { PourStream } from '../art/PourStream';
import { LIQUIDS, LIQUID_SYMBOLS } from '../art/palette';
import { vesselAtCapacity, type VesselDesign } from '../art/vesselDesigns';
import { createPourPlan, POUR_DURATION_MS, type PourPlan } from '../art/pourGeometry';
import { isBottleComplete } from '../art/bottleCompletion';
import { createEngineSession, moveEngineSession, resetEngineSession, undoEngineSession, visibleEngineState, type EngineAction, type EngineSession, type VisibleEngineContainer } from '../game/engine';
import { createEngineHintTask, type EngineHintTask } from '../game/engineSearch';
import { ENGINE_EXAMPLES } from '../game/engineExamples';
import { benchmarkEngine } from '../game/engineBenchmark';
import { benchmarkEngineStorage } from '../storage/engineStorageBenchmark';
import type { SortingGoal } from '../game/engineModel';
import type { Pour } from '../game/rules';
import { FocusablePressable as Pressable } from './FocusablePressable';
import { GameHeader } from './GameHeader';
import { GameButton } from './GameButton';
import { PourSound } from './PourSound';
import { boardLayout, bottleHitWidth } from './boardLayout';
import { bottleControlId, useBoardKeyboard } from './useBoardKeyboard';

const palette = { ...LIQUIDS, unknown: { light: '#B5AD99', main: '#766F60', dark: '#524E45', name: '?' } };
const symbols = { ...LIQUID_SYMBOLS, unknown: '?' };
type Animation = { before: readonly VisibleEngineContainer[]; pour: Pour; plan: PourPlan };
type Props = { vessel: VesselDesign; symbols: boolean; sound: boolean; reduceMotion: boolean; onBack: () => void };

/** Internal classic-board acceptance. Never persists, unlocks or credits player progress. */
export function EnginePreview({ vessel, symbols: showSymbols, sound, reduceMotion, onBack }: Props) {
  const { t, language } = useI18n(), zh = language.startsWith('zh'), insets = useSafeAreaInsets(), dimensions = useWindowDimensions();
  const [index, setIndex] = useState(0), [session, setSession] = useState(() => createEngineSession(ENGINE_EXAMPLES[0], 'preview-0'));
  const current = useRef(session);
  const [selected, setSelected] = useState<number | null>(null), [animation, setAnimation] = useState<Animation | null>(null), [notice, setNotice] = useState('');
  const [searching, setSearching] = useState(false), [active, setActive] = useState(AppState.currentState === 'active');
  const [benchmarking, setBenchmarking] = useState(false);
  const benchmarkToken = useRef({ value: 0 });
  const [stage, setStage] = useState({ width: dimensions.width, height: 400 });
  const busy = useRef(false), progress = useSharedValue(1), search = useRef<EngineHintTask | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { runtime } = session, puzzle = runtime.puzzle, layout = useMemo(() => boardLayout(puzzle.containers.length), [puzzle.containers.length]);
  const scale = Math.max(0, Math.min(stage.width / layout.width, stage.height / layout.height));
  const designs = useMemo(() => puzzle.containers.map(c => vesselAtCapacity(vessel, c.capacity)), [puzzle, vessel]);
  const visible = visibleEngineState(runtime, session.state, session.known, session.seen);
  const cancel = useCallback(() => {
    benchmarkToken.current.value++; setBenchmarking(false);
    cancelAnimation(progress); progress.set(1); busy.current = false; setAnimation(null); setSelected(null);
    search.current?.cancel(); search.current = null; setSearching(false);
    if (timer.current) clearTimeout(timer.current); timer.current = null;
  }, [progress]);
  const back = useCallback(() => { cancel(); onBack(); }, [cancel, onBack]);
  useEffect(() => {
    const cancellation = benchmarkToken.current;
    const background = AppState.addEventListener('change', state => { setActive(state === 'active'); if (state !== 'active') cancel(); });
    const resize = Dimensions.addEventListener('change', cancel), hardware = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; });
    return () => { cancellation.value++; background.remove(); resize.remove(); hardware.remove(); cancelAnimation(progress); search.current?.cancel(); if (timer.current) clearTimeout(timer.current); };
  }, [back, cancel, progress]);
  useEffect(() => {
    if (!reduceMotion) return;
    cancelAnimation(progress); progress.set(1);
    const timeout = setTimeout(cancel, 0);
    return () => clearTimeout(timeout);
  }, [reduceMotion, cancel, progress]);
  const finish = useCallback(() => { busy.current = false; setAnimation(null); setSelected(null); }, []);
  useLayoutEffect(() => {
    if (!animation) return;
    progress.set(withTiming(1, { duration: POUR_DURATION_MS, easing: Easing.linear }, done => { if (done) scheduleOnRN(finish); }));
    return () => cancelAnimation(progress);
  }, [animation, finish, progress]);
  function commit(next: EngineSession) { current.current = next; setSession(next); setNotice(''); }
  function execute(action: EngineAction, expectedRevision = current.current.revision) {
    if (busy.current) return false;
    const before = current.current, result = moveEngineSession(before, action, expectedRevision);
    if (!result) return false;
    const source = before.runtime.containerIndex.get(action.source)!, target = before.runtime.containerIndex.get(action.target)!;
    const frame = visibleEngineState(before.runtime, before.state, before.known, before.seen);
    const transfer = result.events.find(event => event.type === 'transfer');
    if (!transfer || transfer.type !== 'transfer') return false;
    const pour: Pour = { source, target, amount: transfer.units.length, color: frame[source].colors.at(-1)! };
    // Commit the complete logic before creating any presentation task.
    commit(result.session); setSelected(null);
    if (reduceMotion || before.runtime.puzzle.containers[source].fixed) return true;
    busy.current = true; progress.set(0);
    setAnimation({ before: frame, pour, plan: createPourPlan(layout.positions[source], layout.positions[target], frame[source].colors.length, pour.amount,
      -70, 12, layout.width, layout.height, designs[source], designs[target]) });
    return true;
  }
  const colorName = (color: string | null) => color === null ? '?' : Object.hasOwn(LIQUIDS, color) ? t(color as MessageKey) : color;
  function condition(container: string) {
    return puzzle.triggers.filter(trigger => trigger.unlock.includes(container)).map(trigger => trigger.when.type === 'empty'
      ? zh ? `清空瓶 ${runtime.containerIndex.get(trigger.when.container)! + 1}` : `Empty bottle ${runtime.containerIndex.get(trigger.when.container)! + 1}`
      : zh ? `装满四份${colorName(trigger.when.color)}` : `Fill four ${colorName(trigger.when.color)} portions`).join(' / ');
  }
  function chooseBottle(i: number) {
    if (busy.current || searching) return;
    if (visible[i].locked) { setNotice(condition(visible[i].id)); return; }
    if (session.status === 'solved') return;
    if (selected === i) { setSelected(null); return; }
    if (selected === null) { if (visible[i].canSource && visible[i].colors.length) setSelected(i); return; }
    const action: EngineAction = { type: 'transfer', source: visible[selected].id, target: visible[i].id };
    if (!execute(action)) setNotice(zh ? '这里暂时倒不进去。' : 'This transfer is unavailable.');
  }
  function hint() {
    if (busy.current || searching || session.status === 'solved') return;
    const task = createEngineHintTask(current.current); search.current = task; setSearching(true);
    const step = () => {
      if (search.current !== task) return;
      const result = task.step();
      if (!result) { timer.current = setTimeout(step, 0); return; }
      search.current = null; timer.current = null; setSearching(false);
      if (result.status === 'hint' && result.attempt === current.current.attempt && result.binding === current.current.runtime.binding && result.revision === current.current.revision) execute(result.action, result.revision);
      else setNotice(result.status === 'unsolvable' ? zh ? '已完整验证：这个局面无法完成。' : 'A complete search proved this position unsolvable.'
        : zh ? '当前预算或已知信息不足，尚未确定安全提示。' : 'A safe hint is not yet proven within the current information and budget.');
    };
    timer.current = setTimeout(step, 0);
  }
  function selectExample(next: number) { cancel(); setIndex(next); commit(createEngineSession(ENGINE_EXAMPLES[next], `preview-${next}`)); }
  async function benchmark() {
    cancel(); const token = ++benchmarkToken.current.value; setBenchmarking(true);
    try {
      const report = await benchmarkEngine(() => new Promise<void>(resolve => setTimeout(resolve, 0)), () => token !== benchmarkToken.current.value);
      const storage = await benchmarkEngineStorage(() => token !== benchmarkToken.current.value);
      if (token !== benchmarkToken.current.value) return;
      console.info('ENGINE_BENCHMARK', JSON.stringify({ runtime: Platform.OS, hermes: !!(globalThis as { HermesInternal?: unknown }).HermesInternal, ...report, storage }));
      setNotice(`CPU p95: move ${report.operations.move.p95.toFixed(2)} ms; restore slice ${report.history.restoreSlices.p95.toFixed(2)} ms; ${report.searches.filter(s => s.samples.every(r => r.status === 'solved')).length}/5 proofs. ${zh ? '详细数据见内部日志；渲染另测。' : 'Details in internal log; rendering measured separately.'}`);
    } catch (error) { if (token === benchmarkToken.current.value) setNotice(String(error)); }
    finally { if (token === benchmarkToken.current.value) setBenchmarking(false); }
  }
  function goalText(goal: SortingGoal): string {
    if (goal.type === 'sort') return zh ? '整理全部液体' : 'Sort all liquid';
    if (goal.type === 'all') return goal.goals.map(goalText).join(' · ');
    const target = runtime.containerIndex.get(goal.container)! + 1;
    return goal.type === 'collect' ? zh ? `瓶 ${target}：收集 ${goal.count} 份${colorName(goal.color)}` : `Bottle ${target}: collect ${goal.count} ${colorName(goal.color)} portions`
      : `${zh ? '从底到顶' : 'Bottom to top'}: ${goal.colors.map(colorName).join(' → ')}`;
  }
  useBoardKeyboard({ enabled: true, disabled: !!animation || searching, positions: layout.positions, onEscape: selected === null ? back : () => setSelected(null) });
  const shown = animation ? animation.before.map((c, i) => i === animation.pour.target ? { ...c, colors: [...c.colors, ...animation.before[animation.pour.source].colors.slice(-animation.pour.amount)] } : c) : visible;
  const names = zh ? ['底部钥匙', '颜色盖布', '逐层显色', '十二份收集', '彩虹层序'] : ['Bottom key', 'Color cover', 'Progressive reveal', 'Twelve portions', 'Ordered colors'];
  return <LinearGradient colors={['#11171E', '#090E16', '#070B12']} style={[styles.screen, { paddingTop: Math.max(10, insets.top), paddingBottom: Math.max(12, insets.bottom) }]}>
    <GameHeader label={`${zh ? '引擎验收' : 'Engine acceptance'} · ${index + 1}/5`} compact disabled={false} onBack={back} />
    <ScrollView horizontal style={styles.tabs} contentContainerStyle={styles.tabContent}>{names.map((name, i) => <Pressable key={name} accessibilityRole="button" accessibilityState={{ selected: i === index }} onPress={() => selectExample(i)} style={[styles.tab, i === index && styles.activeTab]}><UiText style={styles.text}>{name}</UiText></Pressable>)}</ScrollView>
    <UiText style={styles.goal}>{goalText(puzzle.goal)}</UiText>
    <Pressable accessibilityRole="button" disabled={benchmarking || !!animation || searching} onPress={benchmark} style={{ minHeight: 28, justifyContent: 'center' }}><UiText style={styles.capacity}>{benchmarking ? (zh ? '性能测量中…' : 'Measuring…') : (zh ? '测量引擎 CPU' : 'Measure engine CPU')}</UiText></Pressable>
    <View testID="engine-stage" style={styles.stage} onLayout={event => setStage(event.nativeEvent.layout)}>
      {scale > 0 && <View style={{ width: layout.width * scale, height: layout.height * scale, overflow: 'visible' }}>
        {shown.map((container, i) => {
          const position = layout.positions[i], colors = container.colors.map(c => c ?? 'unknown'), hidden = container.colors.map(c => c === null);
          const covered = container.locked && container.count === null;
          return <View key={container.id} pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Bottle index={i} vessel={designs[i]} colors={colors} hiddenLayers={hidden} palette={palette} symbolMap={symbols} selected={selected === i}
              completed={!hidden.some(Boolean) && isBottleComplete(colors, container.capacity)} position={position} width={100 * scale} scale={scale}
              plan={animation?.plan ?? null} pour={animation?.pour ?? null} progress={progress} symbols={showSymbols}
              completionEffect="cork" completionScene={puzzle.id} completionAnimations={active && !reduceMotion} />
            {covered && <View style={[styles.cover, { left: (position.x + 20) * scale, top: (position.y + 23) * scale, width: 60 * scale, height: 140 * scale }]}><UiText style={styles.lock}>⌑</UiText></View>}
            <View style={{ position: 'absolute', left: (position.x + 9) * scale, top: (position.y + 177) * scale, width: 82 * scale }}>
              <UiText style={styles.capacity}>{container.locked ? '🔒 ' : ''}{container.count === null ? '?' : container.colors.length}/{container.capacity}{container.fixed ? ' ▣' : ''}{puzzle.triggers.some(trigger => trigger.when.type === 'empty' && trigger.when.container === container.id) ? ' 🔑' : ''}</UiText>
              {container.locked ? <UiText numberOfLines={2} style={styles.condition}>{condition(container.id)}</UiText>
                : puzzle.containers[i].acceptColors && <UiText numberOfLines={2} style={styles.condition}>{puzzle.containers[i].acceptColors!.map(colorName).join(' / ')}</UiText>}
            </View>
          </View>;
        })}
        {shown.map((container, i) => <Pressable key={container.id} nativeID={bottleControlId(i)} testID={bottleControlId(i)} accessibilityRole="button"
          accessibilityLabel={`${i + 1}: ${container.locked ? `${zh ? '锁定' : 'Locked'}; ${condition(container.id)}; ` : ''}${container.count === null ? '?' : [...container.colors].reverse().map(colorName).join(', ')}; ${container.capacity}`}
          accessibilityState={{ selected: selected === i, disabled: !!animation || searching }} disabled={!Platform.isTV && (!!animation || searching)} onPress={() => chooseBottle(i)}
          style={{ position: 'absolute', left: (layout.positions[i].x + 50) * scale - bottleHitWidth(layout, scale) / 2, top: layout.positions[i].y * scale, width: bottleHitWidth(layout, scale), height: 180 * scale, zIndex: 3 }} />)}
        {animation && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 11 }]}><PourStream plan={animation.plan} color={animation.pour.color} progress={progress} /></View>}
      </View>}
    </View>
    <UiText accessibilityLiveRegion="polite" style={styles.notice}>{notice || (session.status === 'solved' && !animation ? t('finished') : session.status === 'stalled' ? zh ? '暂无合法移动，可撤销或重来。' : 'No legal transfer. Undo or reset.' : ' ')}</UiText>
    <View style={styles.tools}><GameButton icon="undo" label={t('undo')} disabled={!session.history.length} onPress={() => { cancel(); commit(undoEngineSession(current.current)); }} />
      <GameButton icon="hint" label={t('hint')} disabled={!!animation || searching || session.status === 'solved'} onPress={hint} />
      <GameButton icon="reset" label={t('reset')} onPress={() => { cancel(); commit(resetEngineSession(current.current)); }} /></View>
    <PourSound progress={progress} pouring={!!animation} vessel={vessel.id} receiverLayers={animation ? (animation.before[animation.pour.target].count ?? 0) / animation.before[animation.pour.target].capacity * 4 : 0} enabled={sound && active && !reduceMotion} />
  </LinearGradient>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, tabs: { flexGrow: 0, maxHeight: 52 }, tabContent: { gap: 8, paddingHorizontal: 12 }, tab: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#22303E' }, activeTab: { backgroundColor: '#365252' },
  text: { color: '#DFE9E8', fontSize: 13 }, goal: { color: '#D8C9A7', textAlign: 'center', fontSize: 13, minHeight: 34, padding: 8 }, stage: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  cover: { backgroundColor: '#454E57', borderRadius: 10, borderWidth: 1, borderColor: '#86929C', alignItems: 'center', justifyContent: 'center', zIndex: 2 }, lock: { color: '#E8D4A6', fontSize: 28 }, capacity: { textAlign: 'center', color: '#C4D4D7', fontSize: 11 },
  condition: { color: '#C8BCA0', fontSize: 9, textAlign: 'center' }, tools: { flexDirection: 'row', justifyContent: 'center', gap: 24, paddingVertical: 4 }, notice: { textAlign: 'center', color: '#C6D8D8', fontSize: 12, minHeight: 34, paddingHorizontal: 12 },
});
