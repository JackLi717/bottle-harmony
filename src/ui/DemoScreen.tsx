import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Dimensions, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cancelAnimation, Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Bottle } from '../art/Bottle';
import { PourStream } from '../art/PourStream';
import { StageArt } from '../art/StageArt';
import { LIQUIDS } from '../art/palette';
import { createPourPlan, type PourPlan } from '../art/pourGeometry';
import { DEMO_LEVEL } from '../game/demo';
import { getPour, type Board, type Pour } from '../game/rules';
import { moveMainline, editMainline, nextMainline, selectMainline, visibleSession } from '../game/mainline';
import { createSession, moveSession, resetSession, undoSession, type GameSession } from '../game/session';
import { createSolver, type SolveResult, type SolverTask } from '../game/solver';
import { Icon } from './Icon';
import { DifficultyDebug } from './DifficultyDebug';
import { LevelPicker } from './LevelPicker';
import { CALIBRATION_SAMPLES, DIFFICULTY, LEVEL_LABELS } from './content';
import { MAINLINE, mainlineReport } from './mainlineContent';
import type { DifficultyReport, PlanningDepthReport } from '../game/difficulty';
import { MainlineMenu } from './MainlineMenu';
import { INTERNAL_TOOLS } from './buildConfig';
import { Tutorial } from './PlayMenu';
import { usePlayProgress } from './usePlayProgress';
import { boardLayout, fitBoard } from './boardLayout';
import { referenceHint, TIER_NAMES, type CalibrationSample } from '../game/calibration';

type Animation = { before: Board; pour: Pour; plan: PourPlan };

export function DemoScreen() {
  const insets = useSafeAreaInsets();
  const dimensions = useWindowDimensions();
  const compact = dimensions.height < 720;
  const { play, setPlay, ready, notice, saveStatus } = usePlayProgress();
  const [internalSession, setInternalSession] = useState<GameSession | null>(null);
  const session = internalSession ?? visibleSession(play);
  const sample = CALIBRATION_SAMPLES.find(item => item.content.level.id === session.level.id) ?? null;
  const entry = MAINLINE.entries.find(item => item.level.id === session.level.id);
  const label = entry ? `第 ${entry.number} 关` : LEVEL_LABELS.get(session.level.id)!;
  const [menuVisible, setMenuVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [difficultyVisible, setDifficultyVisible] = useState(false);
  const [debugReport, setDebugReport] = useState<DifficultyReport | PlanningDepthReport | null>(null);
  const { board, history } = session;
  const [searching, setSearching] = useState(false);
  const search = useRef<SolverTask | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [animation, setAnimation] = useState<Animation | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0, y: 0 });
  const [message, setMessage] = useState('点选有水的瓶子，再点空瓶');
  const [reduceMotion, setReduceMotion] = useState(false);
  // A synchronous gate prevents consecutive touches from accepting overlapping moves.
  const busy = useRef(false);
  const progress = useSharedValue(1);
  const safeTop = insets.top + (compact ? 8 : 14);
  // Keep the current bottle slots, while allowing art to use existing space
  // above the board. Reserve at least 130 design units without crossing the notch.
  const layout = boardLayout(board.length);
  const { scale, minY } = fitBoard(layout, stage, safeTop);
  const difficulty = entry ?? DIFFICULTY.get(session.level.id)!;
  const won = session.status === 'solved';
  const finished = useCallback(() => {
    busy.current = false;
    setAnimation(null);
    setSelected(null);
  }, [setAnimation, setSelected]);

  useLayoutEffect(() => {
    if (!animation) return;
    // Start after the persistent bottle views receive the new plan, rather than
    // advancing the UI clock while React is still switching their props.
    progress.set(withTiming(1, { duration: 1900, easing: Easing.linear }, done => {
      if (done) scheduleOnRN(finished);
    }));
    return () => cancelAnimation(progress);
  }, [animation, finished, progress]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); }).catch(() => {});
    const preference = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        search.current?.cancel();
        search.current = null;
        setSearching(false);
        // The logical move was already committed; interruption displays that result.
        cancelAnimation(progress);
        progress.set(1);
        busy.current = false;
        setAnimation(null);
        setSelected(null);
      }
    });
    return () => {
      mounted = false;
      preference.remove();
      subscription.remove();
      cancelAnimation(progress);
      search.current?.cancel();
      search.current = null;
    };
  }, [progress]);

  useEffect(() => {
    // A window resize ends the visual move; it never rolls back accepted liquid state.
    const subscription = Dimensions.addEventListener('change', () => {
      cancelAnimation(progress);
      progress.set(1);
      setAnimation(null);
      setSelected(null);
      if (!search.current) busy.current = false;
    });
    return () => subscription.remove();
  }, [progress]);

  function chooseSample(next: CalibrationSample | null) {
    if (busy.current) return;
    setInternalSession(createSession(next?.content.level ?? DEMO_LEVEL));
    setSelected(null);
    setMessage('点选有水的瓶子，再点空瓶');
    setPickerVisible(false);
  }

  function nextLevel() {
    if (busy.current) return;
    setInternalSession(null);
    if (!internalSession) setPlay(nextMainline(play, MAINLINE));
    setSelected(null); setMenuVisible(false);
    setMessage('点选有水的瓶子，再点空瓶');
  }

  function chooseNumber(number: number) {
    if (busy.current) return;
    setInternalSession(null); setPlay(selectMainline(play, MAINLINE, number));
    setSelected(null); setMenuVisible(false); setMessage('点选有水的瓶子，再点空瓶');
  }

  function startPour(pour: Pour) {
    if (busy.current) return;
    const accepted = internalSession ? moveSession(internalSession, pour.source, pour.target) : moveMainline(play, pour.source, pour.target);
    if (!accepted) return;
    busy.current = true;
    if ('state' in accepted) setPlay(accepted.state);
    else setInternalSession(accepted.session);
    const resultingSession = 'state' in accepted ? visibleSession(accepted.state) : accepted.session;
    setMessage(resultingSession.status === 'solved' ? '色彩归位了，可以继续下一题' : resultingSession.status === 'stalled' ? '暂时没有可倒的瓶子，可以撤销或重来' : '慢慢来，让相同的颜色相遇');
    if (reduceMotion) { busy.current = false; setSelected(null); return; }
    progress.set(0);
    const { before, pour: committedPour } = accepted.event;
    setAnimation({ before, pour: committedPour, plan: createPourPlan(layout.positions[committedPour.source], layout.positions[committedPour.target], before[committedPour.source].length, committedPour.amount, minY, selected === committedPour.source ? 12 : 0, layout.width, layout.height) });
  }

  function selectBottle(index: number) {
    if (busy.current) return;
    if (won) { setMessage('色彩归位了。可以继续下一题、撤销或重来'); return; }
    if (selected === index) { setSelected(null); return; }
    if (selected === null) {
      if (!board[index].length) { setMessage('先选一个有水的瓶子'); return; }
      setSelected(index);
      setMessage('再点空瓶，或顶部同色的瓶子');
      return;
    }
    const pour = getPour(board, selected, index, session.level.capacity);
    if (!pour) {
      setMessage(board[index].length === session.level.capacity ? '这个瓶子已经装满了' : '只能倒入空瓶，或顶部同色的瓶子');
      return;
    }
    startPour(pour);
  }

  function reset() {
    if (busy.current) return;
    if (internalSession) setInternalSession(resetSession(internalSession)); else setPlay(editMainline(play, 'reset')); setSelected(null);
    setMessage('点选有水的瓶子，再点空瓶');
  }

  function undo() {
    if (busy.current || !history.length) return;
    if (internalSession) setInternalSession(undoSession(internalSession)); else setPlay(editMainline(play, 'undo'));
    setSelected(null); setMessage('已退回上一步');
  }

  async function demonstrate() {
    if (busy.current) return;
    if (won) { nextLevel(); return; }
    const content = entry ?? sample?.content;
    const referencePour = content ? referenceHint(content, board) : null;
    if (referencePour) { startPour(referencePour); return; }
    const task = createSolver(board, { capacity: session.level.capacity, maxStates: 30000, maxMilliseconds: 200 });
    search.current = task;
    busy.current = true;
    setSearching(true);
    let result: SolveResult | null = null;
    do {
      // Yield to rendering/input between small CPU slices; no search inside animation frames.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      if (search.current !== task) return;
      result = task.step(32, 4);
    } while (!result);
    search.current = null;
    busy.current = false;
    setSearching(false);
    if (result.status === 'solved' && result.route.length) startPour(result.route[0]);
    else if (result.status === 'limitReached') setMessage('这次没有及时找到解法，可以继续尝试、撤销或重来');
    else setMessage('试试撤销一步，或重新开始');
  }

  const displayBoard = animation ? animation.before.map((bottle, index) => index === animation.pour.target
    ? [...bottle, ...Array(animation.pour.amount).fill(animation.pour.color)]
    : bottle) : board;

  if (!ready) return <LinearGradient colors={['#102B37', '#0B1B2F']} style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}><StatusBar style="light" /><Text style={styles.message}>正在恢复本地进度…</Text></LinearGradient>;

  return (
    <LinearGradient colors={['#102B37', '#0B1B2F', '#111C30']} locations={[0, 0.58, 1]} style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.safe, { paddingTop: insets.top + (compact ? 8 : 14), paddingHorizontal: board.length >= 9 ? 8 : 22, paddingBottom: Math.max(insets.bottom, 14) }]}>
        <View style={styles.brandRow}>
          <View style={styles.brand}><View style={styles.emblem}><Icon name="spark" color="#DEC793" size={25} /></View><View><Text style={styles.brandTitle}>BOTTLE</Text><Text style={styles.brandSubtitle}>H A R M O N Y</Text></View></View>
          <Pressable accessibilityRole="button" accessibilityLabel="打开游玩菜单" disabled={!!animation || searching} onPress={() => { if (!busy.current) setMenuVisible(true); }} style={[styles.demoBadge, (!!animation || searching) && styles.disabled]}><Text style={styles.demoBadgeText}>游玩菜单</Text></Pressable>
        </View>
        <View style={[styles.intro, compact && styles.introCompact]}>
          <Text style={[styles.title, compact && styles.titleCompact]}>让色彩，慢慢归位</Text>
          <Text style={styles.subtitle}>{entry ? `${label} / 1000 · ${TIER_NAMES[difficulty.tier!]}${internalSession ? ' · 内部预览' : play.replay ? ' · 重玩' : ''} · ${session.level.colors.length} 色` : sample ? `${sample.code} · ${TIER_NAMES[sample.tier]}（试排）· ${session.level.colors.length} 色` : '一瓶色彩，一刻宁静。'}</Text>
        </View>
        <View style={styles.stageSpace} onLayout={event => {
          const layout = event.nativeEvent.layout;
          setStage(old => old.width === layout.width && old.height === layout.height && old.y === layout.y ? old : layout);
        }}>
          {scale > 0 && <View collapsable={false} style={{ width: layout.width * scale, height: layout.height * scale, overflow: 'visible' }}>
            <View style={StyleSheet.absoluteFill}><StageArt layout={layout} /></View>
            {/* Art stays mounted in one layer for selection, pouring and return.
                Fixed hit areas below never reparent or reposition the artwork. */}
            {layout.positions.map((position, index) => {
              const bottle = displayBoard[index];
              return <Bottle key={`${session.level.id}-${session.level.bottles[index].id}`} index={index} position={position} colors={bottle} selected={selected === index} completed={!animation && bottle.length === session.level.capacity && bottle.every(c => c === bottle[0])} width={100 * scale} scale={scale} plan={animation?.plan ?? null} pour={animation?.pour ?? null} progress={progress} symbols={play.symbols} />;
            })}
            {layout.positions.map((position, index) => {
              const bottle = displayBoard[index];
              const label = `${index + 1}号瓶，${bottle.length ? [...bottle].reverse().map(c => LIQUIDS[c as keyof typeof LIQUIDS].name).join('、') : '空瓶'}`;
              return <Pressable key={index} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="先选源瓶，再选目标瓶" accessibilityState={{ selected: selected === index, disabled: !!animation || searching }} disabled={!!animation || searching} onPress={() => selectBottle(index)} style={{ position: 'absolute', left: position.x * scale - Math.max(0, (44 - 100 * scale) / 2), top: position.y * scale, width: Math.max(44, 100 * scale), height: 180 * scale, zIndex: 3 }}>
                {selected === index && !animation && <View style={[styles.selectionDot, { bottom: -5 * scale }]} />}
              </Pressable>;
            })}
            {animation && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 11 }]}><PourStream plan={animation.plan} color={animation.pour.color} progress={progress} /></View>}
          </View>}
        </View>
        <View style={[styles.footer, compact && styles.footerCompact]}>
          <Text accessibilityLiveRegion="polite" style={[styles.message, won && styles.success]}>{notice || (won ? !internalSession && !play.replay && play.current === 1000 ? '一千关全部通过了！可以在选关中重玩' : '色彩归位了，可以继续下一题' : session.status === 'stalled' ? '暂时没有可倒的瓶子，可以撤销或重来' : message)}</Text>
          <View style={styles.controls}>
            <Pressable onPress={undo} disabled={!history.length || !!animation || searching} accessibilityRole="button" accessibilityLabel="撤销上一步" style={({ pressed }) => [styles.secondary, (!history.length || !!animation || searching) && styles.disabled, pressed && styles.pressed]}><Icon name="undo" /><Text style={styles.secondaryText}>撤销</Text></Pressable>
            <Pressable onPress={demonstrate} disabled={!!animation || searching} accessibilityRole="button" accessibilityLabel={won ? '下一题' : '演示一次倒水'} style={({ pressed }) => [styles.primaryWrap, (!!animation || searching) && styles.disabled, pressed && styles.pressed]}><LinearGradient colors={['#F0DCAD', '#CEAD72']} style={styles.primary}><Icon name="play" color="#263B3D" size={21} /><Text style={styles.primaryText}>{searching ? '正在寻找…' : won ? play.replay || internalSession ? '回到主线' : play.current === 1000 ? '主线完成' : '下一关' : '演示一步'}</Text></LinearGradient></Pressable>
            <Pressable onPress={reset} disabled={!!animation || searching} accessibilityRole="button" accessibilityLabel="重新开始" style={({ pressed }) => [styles.secondary, (!!animation || searching) && styles.disabled, pressed && styles.pressed]}><Icon name="reset" /><Text style={styles.secondaryText}>重来</Text></Pressable>
          </View>
          {INTERNAL_TOOLS ? <Pressable accessibilityRole="button" accessibilityLabel="查看当前关卡的调试难度" disabled={!!animation || searching} onPress={() => { if (!busy.current) { setDebugReport(entry ? mainlineReport(entry.number).evidence : DIFFICULTY.get(session.level.id)!); setDifficultyVisible(true); } }} style={[styles.difficultyButton, (!!animation || searching) && styles.disabled]}><Text style={styles.footnote}>{history.length} 次倒水 · 调试难度：{difficulty.tier ?? '未知'}（暂定） ›</Text></Pressable> : <View style={styles.difficultyButton}><Text style={styles.footnote}>{history.length} 次倒水</Text></View>}
        </View>
      </View>
      {debugReport && <DifficultyDebug visible={difficultyVisible} report={debugReport} sample={sample} label={label} onClose={() => setDifficultyVisible(false)} />}
      <MainlineMenu visible={menuVisible} play={play} saveStatus={saveStatus} onClose={() => setMenuVisible(false)} onResume={() => chooseNumber(play.current)} onSelect={chooseNumber} onSamples={() => { setMenuVisible(false); setPickerVisible(true); }} symbols={play.symbols} onSymbols={() => setPlay(Object.freeze({ ...play, symbols: !play.symbols }))} />
      <Tutorial visible={ready && !play.tutorialDone} notice={notice} onStart={() => setPlay(Object.freeze({ ...play, tutorialDone: true }))} onSkip={() => setPlay(Object.freeze({ ...play, tutorialDone: true }))} />
      {INTERNAL_TOOLS && <LevelPicker visible={pickerVisible} currentCode={sample?.code ?? null} onClose={() => setPickerVisible(false)} onSelect={chooseSample} onPreview={number => { setInternalSession(createSession(MAINLINE.entries[number - 1].level)); setSelected(null); setPickerVisible(false); setMessage('内部预览，不改变主线进度'); }} />}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 22 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emblem: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#FFFFFF06', borderWidth: 1, borderColor: '#DBCBA52B', alignItems: 'center', justifyContent: 'center' },
  brandTitle: { color: '#EFE6CD', fontSize: 15, fontWeight: '700', letterSpacing: 3.5 },
  brandSubtitle: { color: '#96ACA9', fontSize: 8, marginTop: 4, letterSpacing: 0.5 },
  demoBadge: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#ADC6C528' },
  demoBadgeText: { color: '#AEC4C0', fontSize: 11, letterSpacing: 1 },
  intro: { marginTop: 30, marginBottom: 4, alignItems: 'center' },
  introCompact: { marginTop: 15, marginBottom: 0 },
  title: { color: '#F2EAD7', fontSize: 27, fontWeight: '600', letterSpacing: 2 },
  titleCompact: { fontSize: 23 },
  subtitle: { marginTop: 10, color: '#A0B6B5', fontSize: 12, letterSpacing: 2 },
  stageSpace: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 4 },
  selectionDot: { position: 'absolute', alignSelf: 'center', width: 4, height: 4, borderRadius: 2, backgroundColor: '#B8F7E2' },
  footer: { alignSelf: 'center', width: '100%', maxWidth: 480, paddingTop: 10 },
  footerCompact: { paddingTop: 3 },
  message: { color: '#B5C9C3', textAlign: 'center', fontSize: 12, lineHeight: 19, minHeight: 38, paddingHorizontal: 8 },
  success: { color: '#E8CF93' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  secondary: { minWidth: 56, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 5 },
  secondaryText: { color: '#A7BCBA', fontSize: 11 },
  primaryWrap: { flex: 1, maxWidth: 230, borderRadius: 19, overflow: 'hidden' },
  primary: { minHeight: 54, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingHorizontal: 12 },
  primaryText: { color: '#263B3D', fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  disabled: { opacity: 0.38 },
  pressed: { opacity: 0.7 },
  difficultyButton: { minHeight: 44, justifyContent: 'center', marginTop: 4 },
  footnote: { color: '#ADC4C4', textAlign: 'center', fontSize: 11 },
});
