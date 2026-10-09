import { nextMemoryNumber } from '../game/memoryCatalog.ts';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, BackHandler, Dimensions, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cancelAnimation, Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Bottle } from '../art/Bottle';
import { GameBackdrop } from '../art/GameBackdrop';
import { StageArt } from '../art/StageArt';
import { PourStream } from '../art/PourStream';
import { createPourPlan, POUR_DURATION_MS, type PourPlan } from '../art/pourGeometry';
import { isBottleComplete } from '../art/bottleCompletion';
import type { VesselDesign } from '../art/vesselDesigns';
import { moveMemory, peekMemory, readyMemory, resetMemory, undoMemory, revealMemory, continueMemory, getMemoryPour, type MemorySession } from '../game/memory';
import { createMemorySolver, memoryReferenceHint } from '../game/memorySolver';
import { type Board, type Pour } from '../game/rules';
import { createSolver, type SolveResult, type SolverTask } from '../game/solver';
import type { MessageKey } from '../i18n/messages';
import { monotonicNow } from '../storage/gameplayClock';
import { useI18n, UiText } from '../i18n/I18n';
import { FocusablePressable as Pressable } from './FocusablePressable';
import { GameHeader } from './GameHeader';
import { GameButton } from './GameButton';
import { Icon } from './Icon';
import { MemoryTutorial } from './MemoryTutorial';
import { useMemoryProgress } from './useMemoryProgress';
import { boardLayout, bottleHitWidth, fitBoard } from './boardLayout';
import { bottleControlId, useBoardKeyboard } from './useBoardKeyboard';
import { deviceLayout } from './deviceLayout';
import { PourSound } from './PourSound';
import { Celebration } from './Celebration';
import { GameNotice } from './GameNotice';
import { memoryDisplay, newlyRevealedMemory } from './memoryPresentation';
import { MEMORY_REVEAL_MS } from '../art/memoryPresentation';

type Animation = { before: MemorySession; pour: Pour; plan: PourPlan; revealed: readonly number[] };
export function MemoryScreen({ vessel, symbols, sound, reduceMotion, onBack, visible = true, onReady }: { vessel: VesselDesign; symbols: boolean; sound: boolean; reduceMotion: boolean; onBack: () => void; visible?: boolean; onReady?: () => void }) {
  const { t } = useI18n();
  const { session, commit, record, tutorial, finishTutorial, availability, saved, repository } = useMemoryProgress(visible);
  const { game } = session;
  const dimensions = useWindowDimensions(), insets = useSafeAreaInsets();
  const { compact, rail, horizontalInset, verticalInset } = deviceLayout(dimensions.width, dimensions.height, Platform.isTV);
  const safeTop = Math.max(insets.top, verticalInset) + (compact ? 8 : 14);
  const [stage, setStage] = useState({ width: 0, height: 0, y: 0 }), [bodyY, setBodyY] = useState(0);
  const layout = boardLayout(game.board.length);
  const entryReady = useRef(false);
  function boardLaidOut() {
    if (entryReady.current) return;
    entryReady.current = true;
    onReady?.();
  }
  const { scale, minY } = fitBoard(layout, { ...stage, y: stage.y + bodyY }, safeTop);
  const [selected, setSelected] = useState<number | null>(null);
  const [animation, setAnimation] = useState<Animation | null>(null);
  const [reveal, setReveal] = useState<{ key: number; units: readonly number[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [assessment, setAssessment] = useState<SolveResult | null>(null);
  const checked = useRef<MemorySession | null>(null);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [pendingWin, setPendingWin] = useState(false), [celebrating, setCelebrating] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [dismissedStalled, setDismissedStalled] = useState<Board | null>(null);
  const progress = useSharedValue(1), busy = useRef(false), search = useRef<SolverTask | null>(null);
  const pouring = useRef<Animation | null>(null);
  const revealProgress = useSharedValue(1), revealSequence = useRef(0);
  const request = useRef<{ id: string; started: number } | null>(null);
  function current() { return repository.state ?? session; }
  const won = game.status === 'solved', observing = session.phase === 'observe', peeking = session.phase === 'peek';
  useEffect(() => { availability(!!animation || searching || !!notice || tutorial || session.judgement === 'wrong'); }, [animation, searching, notice, tutorial, session.judgement, availability]);
  const stopReveal = useCallback(() => {
    cancelAnimation(revealProgress); revealProgress.set(1); setReveal(null);
  }, [revealProgress]);
  const finished = useCallback(() => {
    if (!animation || pouring.current !== animation) return;
    pouring.current = null;
    if (animation?.revealed.length && !reduceMotion) {
      revealProgress.set(0);
      setReveal({ key: ++revealSequence.current, units: animation.revealed });
    }
    busy.current = false; setAnimation(null); setSelected(null);
  }, [animation, reduceMotion, revealProgress]);
  const finishReveal = useCallback((key: number) => setReveal(current => current?.key === key ? null : current), []);
  useLayoutEffect(() => {
    if (!animation) return;
    progress.set(withTiming(1, { duration: POUR_DURATION_MS, easing: Easing.linear }, done => { if (done) scheduleOnRN(finished); }));
    return () => cancelAnimation(progress);
  }, [animation, progress, finished]);
  useLayoutEffect(() => {
    if (!reveal) return;
    const key = reveal.key;
    revealProgress.set(withTiming(1, { duration: MEMORY_REVEAL_MS, easing: Easing.linear }, done => { if (done) scheduleOnRN(finishReveal, key); }));
    return () => cancelAnimation(revealProgress);
  }, [reveal, revealProgress, finishReveal]);
  const reportHint = useCallback((result: string) => {
    if (!request.current) return;
    record('hint-result', { requestId: request.current.id, result, durationMs: monotonicNow() - request.current.started }); request.current = null;
  }, [record]);
  const stopPresentation = useCallback(() => {
    search.current?.cancel(); search.current = null; reportHint('cancelled'); setSearching(false);
    pouring.current = null; cancelAnimation(progress); progress.set(1); busy.current = false; setAnimation(null); setSelected(null);
    stopReveal();
    setPendingWin(false); setCelebrating(false); setEpoch(n => n + 1);
    checked.current = null; setAssessment(null);
  }, [progress, reportHint, stopReveal]);
  const back = useCallback(() => { stopPresentation(); onBack(); }, [stopPresentation, onBack]);
  useEffect(() => {
    const app = AppState.addEventListener('change', value => { setActive(value === 'active'); if (value !== 'active') stopPresentation(); });
    const resize = Dimensions.addEventListener('change', stopPresentation);
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { if (value) stopPresentation(); });
    const hardware = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; });
    return () => { app.remove(); resize.remove(); motion.remove(); hardware.remove(); search.current?.cancel(); pouring.current = null; cancelAnimation(progress); cancelAnimation(revealProgress); };
  }, [back, stopPresentation, progress, revealProgress]);
  useEffect(() => {
    if (!pendingWin || animation || !active || !won) return;
    const timer = setTimeout(() => { setPendingWin(false); setCelebrating(!reduceMotion); }, reduceMotion ? 0 : 1000);
    return () => clearTimeout(timer);
  }, [pendingWin, animation, active, won, reduceMotion]);
  const celebrationFinished = useCallback(() => setCelebrating(false), []);
  const assess = useCallback(async (value: MemorySession) => {
    const task = createSolver(value.game.board, { capacity: 4, maxStates: 100000, maxMilliseconds: 1500 });
    search.current = task; busy.current = true; setSearching(true); setAssessment(null); availability(true);
    record('answer-check-request');
    let result: SolveResult | null = null;
    do {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      if (search.current !== task) return;
      result = task.step(32, 4);
    } while (!result);
    search.current = null; busy.current = false; setSearching(false); availability(false);
    if (result.status === 'solved') continueMemory(value, result.route);
    setAssessment(result); record('answer-check-result', { status: result.status });
  }, [availability, record]);
  useEffect(() => {
    if (visible && session.judgement === 'wrong' && !animation && !reveal && active && !tutorial && checked.current !== session) {
      checked.current = session; void assess(session);
    }
  }, [visible, session, animation, reveal, active, tutorial, assess, epoch]);
  function pour(source: number, target: number, hinted = false, requestId?: string) {
    if (busy.current || tutorial) return;
    const before = current(), accepted = moveMemory(before, source, target, hinted);
    if (!accepted) return;
    stopReveal();
    busy.current = true; availability(true);
    commit(accepted.session, 'pour', { source, target, amount: accepted.event.pour.amount, hinted, requestId });
    if (accepted.session.game.status === 'solved') setPendingWin(true);
    if (reduceMotion) { busy.current = false; setSelected(null); availability(false); return; }
    progress.set(0);
    const p = accepted.event.pour;
    const presentation = { before, pour: p, revealed: newlyRevealedMemory(before, accepted.session), plan: createPourPlan(layout.positions[p.source], layout.positions[p.target], before.game.board[p.source].length, p.amount, minY, selected === p.source ? 12 : 0, layout.width, layout.height, vessel) };
    pouring.current = presentation; setAnimation(presentation);
  }
  function select(index: number) {
    if (busy.current || tutorial || session.phase !== 'play' || session.judgement === 'wrong' || won) return;
    stopReveal();
    if (selected === index) { setSelected(null); return; }
    if (selected === null) {
      if (game.board[index].length) { setSelected(index); AccessibilityInfo.announceForAccessibility(t('pourTarget')); }
      else AccessibilityInfo.announceForAccessibility(t('emptySource'));
      return;
    }
    if (getMemoryPour(current(), selected, index)) pour(selected, index);
    else AccessibilityInfo.announceForAccessibility(t(game.board[index].length === 4 ? 'fullBottle' : 'pourTarget'));
  }
  function undo() { if (pouring.current) return; stopPresentation(); commit(undoMemory(current()), 'undo'); }
  function reset() { if (pouring.current) return; stopPresentation(); commit(resetMemory(current()), 'reset'); }
  function view() { if (busy.current) return; stopReveal(); setSelected(null); const next = peekMemory(current()); commit(next, next.phase === 'peek' ? 'peek-open' : 'peek-close'); }
  async function hint() {
    if (busy.current || session.phase !== 'play' || session.judgement === 'wrong' || won || tutorial) return;
    stopReveal();
    const id = `${repository.player.installation}:memory-hint:${session.attempt}:${session.pours}:${monotonicNow()}`;
    request.current = { id, started: monotonicNow() }; record('hint-request', { requestId: id });
    const reference = memoryReferenceHint(current());
    if (reference) { reportHint('solved'); pour(reference.source, reference.target, true, id); return; }
    const task = createMemorySolver(current(), { capacity: 4, maxStates: 100000, maxMilliseconds: 700 });
    search.current = task; busy.current = true; availability(true); setSearching(true);
    let result: SolveResult | null = null;
    do {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      if (search.current !== task) return;
      result = task.step(32, 4);
    } while (!result);
    search.current = null; busy.current = false; setSearching(false);
    reportHint(result.status === 'solved' ? 'solved' : result.status === 'unsolvable' ? 'unsolvable' : 'unknown');
    if (result.status === 'solved' && result.route.length) pour(result.route[0].source, result.route[0].target, true, id);
    else { availability(false); setNotice({ title: t('hint'), message: t(result.status === 'solved' ? 'memoryReveal' : result.status === 'unsolvable' ? 'unsolvableTitle' : 'searchLimit') }); }
  }
  function next() {
    if (busy.current) return;
    stopReveal();
    setPendingWin(false); setCelebrating(false); setSelected(null);
    commit(repository.select(nextMemoryNumber(session.puzzle.number, repository.content.memory.length)), 'next');
  }
  function submit() {
    if (busy.current || tutorial || current().judgement !== 'hidden' || current().phase !== 'play') return;
    const before = current(), next = revealMemory(before);
    stopReveal(); setSelected(null); commit(next, 'reveal-answer');
    if (!reduceMotion) { revealProgress.set(0); setReveal({ key: ++revealSequence.current, units: newlyRevealedMemory(before, next) }); }
    if (next.game.status === 'solved') setPendingWin(true);
  }
  function continueSorting() {
    if (assessment?.status !== 'solved' || busy.current) return;
    commit(continueMemory(current(), assessment.route), 'continue-after-reveal'); setAssessment(null);
  }
  const { units: displayedUnits, board: displayBoard, hidden, reveals } = memoryDisplay(session, animation, reveal?.units);
  const controlsDisabled = !visible || !!animation || searching || tutorial;
  const hiddenPour = !!animation && animation.before.revealed[animation.before.units[animation.pour.source].at(-1)!] < 0;
  useBoardKeyboard({ enabled: visible && !tutorial && !notice, disabled: controlsDisabled || observing || peeking || session.judgement === 'wrong', positions: layout.positions, onEscape: () => selected === null ? back() : setSelected(null) });
  return <LinearGradient colors={['#11171E', '#090E16', '#070B12']} locations={[0,.58,1]} style={[styles.screen, Platform.OS === 'web' && { height: Math.max(dimensions.height, rail ? 400 : 520), flexGrow: 0, flexShrink: 0, flexBasis: 'auto' }]}>
    <StatusBar style="light" />
    <PourSound progress={progress} pouring={!!animation} vessel={vessel.id} receiverLayers={animation?.before.game.board[animation.pour.target].length ?? 0} enabled={visible && sound && active && !reduceMotion} />
    <View pointerEvents="none" style={StyleSheet.absoluteFill}><GameBackdrop width={dimensions.width} height={dimensions.height} /></View>
    <View style={[styles.safe, { paddingTop: safeTop, paddingBottom: Math.max(insets.bottom, verticalInset, 14), paddingLeft: Math.max(insets.left, horizontalInset), paddingRight: Math.max(insets.right, horizontalInset) }]}>
      <GameHeader label={`Level ${session.puzzle.number}`} compact={compact} disabled={false} onBack={back} />
      <View style={[styles.body, rail && styles.bodyRail]} onLayout={e => setBodyY(e.nativeEvent.layout.y)}>
        <View testID="memory-stage" style={styles.stage} onLayout={e => { const l = e.nativeEvent.layout; setStage(old => old.width === l.width && old.height === l.height && old.y === l.y ? old : l); }}>
          {scale > 0 && <View collapsable={false} onLayout={boardLaidOut} style={{ width: layout.width * scale, height: layout.height * scale, overflow: 'visible' }}>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}><StageArt layout={layout} /></View>
            {layout.positions.map((position, index) => <Bottle key={index} index={index} vessel={vessel} position={position} colors={displayBoard[index]} hiddenLayers={hidden[index]} revealingLayers={reveals[index]} revealProgress={revealProgress} markedLayers={observing ? session.units[index].map(id => session.revealed[id] < 0) : []} selected={selected === index} completed={!hidden[index].some(Boolean) && isBottleComplete(displayBoard[index], 4)} hiddenPour={hiddenPour} width={100 * scale} scale={scale} plan={animation?.plan ?? null} pour={animation?.pour ?? null} progress={progress} symbols={symbols} completionEffect="cork" completionScene={`memory:${game.level.id}:${session.attempt}:${epoch}`} completionAnimations={active && !reduceMotion} />)}
            {layout.positions.map((position, index) => {
              const b = displayBoard[index], label = t('memoryBottle', { n: index + 1, layers: b.length, space: 4 - b.length,
                colors: b.length ? b.map((c, d) => hidden[index][d] ? t('memoryUnknown') : observing && session.revealed[displayedUnits[index][d]] < 0 ? t('memoryMarked', { color: t(c as MessageKey) }) : t(c as MessageKey)).reverse().join(', ') : t('empty') });
              const width = bottleHitWidth(layout, scale), disabled = controlsDisabled || observing || peeking || won || session.judgement === 'wrong';
              return <Pressable key={index} hasTVPreferredFocus={visible && Platform.isTV && index === 0} focusIndicatorStyle={{ position: 'absolute', alignSelf: 'center', top: 15 * scale, width: 64 * scale, height: 160 * scale, borderRadius: 12 * scale }} nativeID={bottleControlId(index)} testID={bottleControlId(index)} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected: selected === index }} disabled={disabled} onPress={() => select(index)} style={{ position: 'absolute', left: (position.x + 50) * scale - width / 2, top: position.y * scale, width, height: 180 * scale, zIndex: 3 }} />;
            })}
            {animation && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 11 }]}><PourStream plan={animation.plan} color={animation.pour.color} progress={progress} hidden={hiddenPour} /></View>}
          </View>}
          {celebrating && active && !reduceMotion && <Celebration count={2} width={stage.width} height={stage.height} sound={sound} onComplete={celebrationFinished} />}
        </View>
        <View style={[styles.footer, rail && styles.railFooter]}>
          <View style={[styles.feedback, compact && styles.compactFeedback]}>
            {won && !animation && !pendingWin && !celebrating ? <GameButton preferredFocus kind="wide" tone="mint" icon="play" label={t(session.puzzle.number === repository.content.memory.length ? 'memoryReplay' : 'memoryNext')} onPress={next} />
              : !saved ? <UiText accessibilityLiveRegion="polite" style={styles.note}>{t('saveFailed')}</UiText>
              : session.judgement === 'wrong' ? <View style={styles.stalled}><UiText accessibilityLiveRegion="polite" style={[styles.note, { flex: 1 }]}>{t(searching ? 'memoryChecking' : assessment?.status === 'unsolvable' ? 'unsolvableTitle' : assessment?.status === 'solved' ? 'memoryWrong' : 'memoryCheckUnknown')}</UiText>{assessment?.status === 'solved' && <GameButton compact kind="wide" tone="mint" icon="play" style={{ flex: 1, width: 'auto' }} label={t('memoryContinue')} onPress={continueSorting} />}</View>
              : session.judgement === 'hidden' && !observing && !peeking ? <GameButton compact={compact} kind="wide" icon="spark" label={t('memoryReveal')} onPress={submit} disabled={controlsDisabled} />
                : game.status === 'stalled' && !animation && !searching && dismissedStalled !== game.board ? <View style={styles.stalled}><UiText style={[styles.note, { flex: 1 }]}>{t('stalled')}</UiText><GameButton kind="icon" icon="close" label={t('close')} onPress={() => { setDismissedStalled(game.board); record('dismiss-stalled'); }} /></View>
                  : session.peeks > 0 && <UiText style={styles.note}>{t('memoryPeeks', { n: session.peeks })}</UiText>}
          </View>
          <View style={[styles.dock, compact && styles.compactDock, rail && styles.railDock]}>
            {observing ? <Pressable hasTVPreferredFocus={visible && Platform.isTV} accessibilityRole="button" accessibilityLabel={t('memoryReady')} disabled={!visible || tutorial} onPress={() => commit(readyMemory(current()), 'ready')} style={[styles.ready, rail && styles.readyRail]}>
              <Icon name="eye" size={38} color="#DDF9EC" /><UiText style={styles.readyText}>{t('memoryReady')}</UiText>
            </Pressable> : <>
              <GameButton kind={rail ? 'wide' : 'tool'} style={!rail && styles.tool} compact={compact} icon="undo" label={t('undo')} accessibilityLabel={t('undoHint')} onPress={undo} disabled={!!animation || tutorial || peeking || !game.history.length} />
              <GameButton kind={rail ? 'wide' : 'tool'} style={!rail && styles.tool} compact={compact} tone="gold" icon="hint" label={t(searching ? 'searching' : 'hint')} accessibilityLabel={t(searching ? 'searching' : 'hintHint')} onPress={hint} disabled={controlsDisabled || peeking || won || session.judgement === 'wrong'} />
              <GameButton kind={rail ? 'wide' : 'tool'} style={!rail && styles.tool} compact={compact} tone="blue" icon="reset" label={t('reset')} accessibilityLabel={t('resetHint')} onPress={reset} disabled={!!animation || tutorial} />
              <GameButton kind={rail ? 'wide' : 'tool'} style={!rail && styles.tool} compact={compact} tone="mint" icon={peeking ? 'eye-off' : 'eye'} label={t(peeking ? 'memorySort' : 'memoryView')} onPress={view} disabled={controlsDisabled || won || session.judgement !== 'hidden'} />
            </>}
          </View>
        </View>
      </View>
    </View>
    <MemoryTutorial visible={visible && tutorial} vessel={vessel} onStart={finishTutorial} onBack={back} />
    <GameNotice notice={notice} onClose={() => setNotice(null)} />
  </LinearGradient>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' }, safe: { flex: 1, paddingHorizontal: 22 }, body: { flex: 1, minHeight: 0 }, bodyRail: { flexDirection: 'row', gap: 24 },
  stage: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', marginHorizontal: -22, marginTop: 8, marginBottom: 4 },
  footer: { width: '100%', maxWidth: 420, alignSelf: 'center', paddingTop: 4 }, railFooter: { width: Platform.isTV ? 240 : 168, alignSelf: 'stretch', justifyContent: 'center' },
  feedback: { height: 66, alignItems: 'center', justifyContent: 'center' }, compactFeedback: { height: 52 }, note: { color: '#CEBA8D', fontSize: 11, textAlign: 'center' },
  dock: { height: 90, width: '100%', flexDirection: 'row', gap: 10, padding: 10, backgroundColor: '#11263199', borderWidth: .5, borderColor: '#C7AD7833', borderRadius: 22 },
  compactDock: { height: 70, padding: 6 }, railDock: { flexDirection: 'column', height: 340, justifyContent: 'center' }, tool: { flex: 1, width: 'auto', minWidth: 44 },
  ready: { flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 14, borderRadius: 14, borderWidth: 1, borderColor: '#85C8B977', backgroundColor: '#193C40' },
  readyText: { color: '#DDF9EC', fontSize: 18, fontWeight: '500' },
  readyRail: { flex: 0, height: 90, width: '100%', flexDirection: 'column', gap: 6 },
  stalled: { flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%' },
});
