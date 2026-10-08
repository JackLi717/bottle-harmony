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
import { hiddenMemory, moveMemory, peekMemory, readyMemory, resetMemory, undoMemory, type MemorySession } from '../game/memory';
import { getPour, type Board, type Pour } from '../game/rules';
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

type Animation = { before: MemorySession; pour: Pour; plan: PourPlan };
export function MemoryScreen({ vessel, symbols, sound, reduceMotion, onBack }: { vessel: VesselDesign; symbols: boolean; sound: boolean; reduceMotion: boolean; onBack: () => void }) {
  const { t } = useI18n();
  const { session, commit, record, tutorial, finishTutorial, availability, saved, repository } = useMemoryProgress();
  const { game } = session;
  const dimensions = useWindowDimensions(), insets = useSafeAreaInsets();
  const { compact, rail, horizontalInset, verticalInset } = deviceLayout(dimensions.width, dimensions.height, Platform.isTV);
  const safeTop = Math.max(insets.top, verticalInset) + (compact ? 8 : 14);
  const [stage, setStage] = useState({ width: 0, height: 0, y: 0 }), [bodyY, setBodyY] = useState(0);
  const layout = boardLayout(game.board.length);
  const { scale, minY } = fitBoard(layout, { ...stage, y: stage.y + bodyY }, safeTop);
  const [selected, setSelected] = useState<number | null>(null);
  const [animation, setAnimation] = useState<Animation | null>(null);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [pendingWin, setPendingWin] = useState(false), [celebrating, setCelebrating] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [dismissedStalled, setDismissedStalled] = useState<Board | null>(null);
  const progress = useSharedValue(1), busy = useRef(false), search = useRef<SolverTask | null>(null);
  const request = useRef<{ id: string; started: number } | null>(null);
  function current() { return repository.state ?? session; }
  const won = game.status === 'solved', observing = session.phase === 'observe', peeking = session.phase === 'peek';
  useEffect(() => { availability(!!animation || searching || !!notice || tutorial); }, [animation, searching, notice, tutorial, availability]);
  const finished = useCallback(() => { busy.current = false; setAnimation(null); setSelected(null); }, []);
  useLayoutEffect(() => {
    if (!animation) return;
    progress.set(withTiming(1, { duration: POUR_DURATION_MS, easing: Easing.linear }, done => { if (done) scheduleOnRN(finished); }));
    return () => cancelAnimation(progress);
  }, [animation, progress, finished]);
  const reportHint = useCallback((result: string) => {
    if (!request.current) return;
    record('hint-result', { requestId: request.current.id, result, durationMs: monotonicNow() - request.current.started }); request.current = null;
  }, [record]);
  const stopPresentation = useCallback(() => {
    search.current?.cancel(); search.current = null; reportHint('cancelled'); setSearching(false);
    cancelAnimation(progress); progress.set(1); busy.current = false; setAnimation(null); setSelected(null);
    setPendingWin(false); setCelebrating(false); setEpoch(n => n + 1);
  }, [progress, reportHint]);
  const back = useCallback(() => { stopPresentation(); onBack(); }, [stopPresentation, onBack]);
  useEffect(() => {
    const app = AppState.addEventListener('change', value => { setActive(value === 'active'); if (value !== 'active') stopPresentation(); });
    const resize = Dimensions.addEventListener('change', stopPresentation);
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { if (value) stopPresentation(); });
    const hardware = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; });
    return () => { app.remove(); resize.remove(); motion.remove(); hardware.remove(); search.current?.cancel(); cancelAnimation(progress); };
  }, [back, stopPresentation, progress]);
  useEffect(() => {
    if (!pendingWin || animation || !active || !won) return;
    const timer = setTimeout(() => { setPendingWin(false); setCelebrating(!reduceMotion); }, reduceMotion ? 0 : 1000);
    return () => clearTimeout(timer);
  }, [pendingWin, animation, active, won, reduceMotion]);
  const celebrationFinished = useCallback(() => setCelebrating(false), []);
  function pour(source: number, target: number, hinted = false, requestId?: string) {
    if (busy.current || tutorial) return;
    const before = current(), accepted = moveMemory(before, source, target, hinted);
    if (!accepted) return;
    busy.current = true; availability(true);
    commit(accepted.session, 'pour', { source, target, amount: accepted.event.pour.amount, hinted, requestId });
    if (accepted.session.game.status === 'solved') setPendingWin(true);
    if (reduceMotion) { busy.current = false; setSelected(null); availability(false); return; }
    progress.set(0);
    const p = accepted.event.pour;
    setAnimation({ before, pour: p, plan: createPourPlan(layout.positions[p.source], layout.positions[p.target], before.game.board[p.source].length, p.amount, minY, selected === p.source ? 12 : 0, layout.width, layout.height, vessel) });
  }
  function select(index: number) {
    if (busy.current || tutorial || session.phase !== 'play' || won) return;
    if (selected === index) { setSelected(null); return; }
    if (selected === null) {
      if (game.board[index].length) { setSelected(index); AccessibilityInfo.announceForAccessibility(t('pourTarget')); }
      else AccessibilityInfo.announceForAccessibility(t('emptySource'));
      return;
    }
    if (getPour(game.board, selected, index, 4)) pour(selected, index);
    else AccessibilityInfo.announceForAccessibility(t(game.board[index].length === 4 ? 'fullBottle' : 'pourTarget'));
  }
  function undo() { if (busy.current) return; setPendingWin(false); setCelebrating(false); setSelected(null); commit(undoMemory(current()), 'undo'); }
  function reset() { if (busy.current) return; setPendingWin(false); setCelebrating(false); setSelected(null); commit(resetMemory(current()), 'reset'); }
  function view() { if (busy.current) return; setSelected(null); const next = peekMemory(current()); commit(next, next.phase === 'peek' ? 'peek-open' : 'peek-close'); }
  async function hint() {
    if (busy.current || session.phase !== 'play' || won || tutorial) return;
    const id = `${repository.player.installation}:memory-hint:${session.attempt}:${session.pours}:${monotonicNow()}`;
    request.current = { id, started: monotonicNow() }; record('hint-request', { requestId: id });
    const task = createSolver(game.board, { capacity: 4, maxStates: 100000, maxMilliseconds: 700 });
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
    else { availability(false); setNotice({ title: t('hint'), message: t(result.status === 'unsolvable' ? 'unsolvableTitle' : 'searchLimit') }); }
  }
  function next() {
    if (busy.current) return;
    setPendingWin(false); setCelebrating(false); setSelected(null);
    commit(repository.select(nextMemoryNumber(session.puzzle.number, repository.content.memory.length)), 'next');
  }
  const displayedUnits = animation ? animation.before.units.map((b, i) => i === animation.pour.target
    ? [...b, ...animation.before.units[animation.pour.source].slice(-animation.pour.amount)] : b) : session.units;
  const displayBoard = animation ? animation.before.game.board.map((b, i) => i === animation.pour.target
    ? [...b, ...Array<string>(animation.pour.amount).fill(animation.pour.color)] : b) : game.board;
  const hidden = hiddenMemory(session, displayedUnits);
  const controlsDisabled = !!animation || searching || tutorial;
  useBoardKeyboard({ enabled: !tutorial && !notice, disabled: controlsDisabled || observing || peeking, positions: layout.positions, onEscape: () => selected === null ? back() : setSelected(null) });
  return <LinearGradient colors={['#11171E', '#090E16', '#070B12']} locations={[0,.58,1]} style={[styles.screen, Platform.OS === 'web' && { height: Math.max(dimensions.height, rail ? 400 : 520), flexGrow: 0, flexShrink: 0, flexBasis: 'auto' }]}>
    <StatusBar style="light" />
    <PourSound progress={progress} pouring={!!animation} vessel={vessel.id} receiverLayers={animation?.before.game.board[animation.pour.target].length ?? 0} enabled={sound && active && !reduceMotion} />
    <View pointerEvents="none" style={StyleSheet.absoluteFill}><GameBackdrop width={dimensions.width} height={dimensions.height} /></View>
    <View style={[styles.safe, { paddingTop: safeTop, paddingBottom: Math.max(insets.bottom, verticalInset, 14), paddingLeft: Math.max(insets.left, horizontalInset), paddingRight: Math.max(insets.right, horizontalInset) }]}>
      <GameHeader label={`Level ${session.puzzle.number}`} compact={compact} disabled={false} onBack={back} />
      <View style={[styles.body, rail && styles.bodyRail]} onLayout={e => setBodyY(e.nativeEvent.layout.y)}>
        <View testID="memory-stage" style={styles.stage} onLayout={e => { const l = e.nativeEvent.layout; setStage(old => old.width === l.width && old.height === l.height && old.y === l.y ? old : l); }}>
          {scale > 0 && <View style={{ width: layout.width * scale, height: layout.height * scale, overflow: 'visible' }}>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}><StageArt layout={layout} /></View>
            {layout.positions.map((position, index) => <Bottle key={index} index={index} vessel={vessel} position={position} colors={displayBoard[index]} hiddenLayers={hidden[index]} markedLayers={observing ? session.units[index].map(id => session.revealed[id] < 0) : []} selected={selected === index} completed={isBottleComplete(displayBoard[index], 4)} width={100 * scale} scale={scale} plan={animation?.plan ?? null} pour={animation?.pour ?? null} progress={progress} symbols={symbols} completionEffect="cork" completionScene={`memory:${game.level.id}:${session.attempt}:${epoch}`} completionAnimations={active && !reduceMotion} />)}
            {layout.positions.map((position, index) => {
              const b = displayBoard[index], label = t('memoryBottle', { n: index + 1, layers: b.length, space: 4 - b.length,
                colors: b.length ? b.map((c, d) => hidden[index][d] ? t('memoryUnknown') : observing && session.revealed[displayedUnits[index][d]] < 0 ? t('memoryMarked', { color: t(c as MessageKey) }) : t(c as MessageKey)).reverse().join(', ') : t('empty') });
              const width = bottleHitWidth(layout, scale), disabled = controlsDisabled || observing || peeking || won;
              return <Pressable key={index} hasTVPreferredFocus={Platform.isTV && index === 0} focusIndicatorStyle={{ position: 'absolute', alignSelf: 'center', top: 15 * scale, width: 64 * scale, height: 160 * scale, borderRadius: 12 * scale }} nativeID={bottleControlId(index)} testID={bottleControlId(index)} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected: selected === index }} disabled={disabled} onPress={() => select(index)} style={{ position: 'absolute', left: (position.x + 50) * scale - width / 2, top: position.y * scale, width, height: 180 * scale, zIndex: 3 }} />;
            })}
            {animation && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 11 }]}><PourStream plan={animation.plan} color={animation.pour.color} progress={progress} /></View>}
          </View>}
          {celebrating && active && !reduceMotion && <Celebration count={2} width={stage.width} height={stage.height} sound={sound} onComplete={celebrationFinished} />}
        </View>
        <View style={[styles.footer, rail && styles.railFooter]}>
          <View style={[styles.feedback, compact && styles.compactFeedback]}>
            {won && !animation && !pendingWin && !celebrating ? <GameButton preferredFocus kind="wide" tone="mint" icon="play" label={t(session.puzzle.number === repository.content.memory.length ? 'memoryReplay' : 'memoryNext')} onPress={next} />
              : !saved ? <UiText accessibilityLiveRegion="polite" style={styles.note}>{t('saveFailed')}</UiText>
                : game.status === 'stalled' && !animation && !searching && dismissedStalled !== game.board ? <View style={styles.stalled}><UiText style={[styles.note, { flex: 1 }]}>{t('stalled')}</UiText><GameButton kind="icon" icon="close" label={t('close')} onPress={() => { setDismissedStalled(game.board); record('dismiss-stalled'); }} /></View>
                  : session.peeks > 0 && <UiText style={styles.note}>{t('memoryPeeks', { n: session.peeks })}</UiText>}
          </View>
          <View style={[styles.dock, compact && styles.compactDock, rail && styles.railDock]}>
            {observing ? <Pressable hasTVPreferredFocus={Platform.isTV} accessibilityRole="button" accessibilityLabel={t('memoryReady')} disabled={tutorial} onPress={() => commit(readyMemory(current()), 'ready')} style={[styles.ready, rail && styles.readyRail]}>
              <Icon name="eye" size={38} color="#DDF9EC" /><UiText style={styles.readyText}>{t('memoryReady')}</UiText>
            </Pressable> : <>
              <GameButton kind={rail ? 'wide' : 'tool'} style={!rail && styles.tool} compact={compact} icon="undo" label={t('undo')} onPress={undo} disabled={controlsDisabled || peeking || !game.history.length} />
              <GameButton kind={rail ? 'wide' : 'tool'} style={!rail && styles.tool} compact={compact} tone="gold" icon="hint" label={t(searching ? 'searching' : 'hint')} onPress={hint} disabled={controlsDisabled || peeking || won} />
              <GameButton kind={rail ? 'wide' : 'tool'} style={!rail && styles.tool} compact={compact} tone="blue" icon="reset" label={t('reset')} onPress={reset} disabled={controlsDisabled} />
              <GameButton kind={rail ? 'wide' : 'tool'} style={!rail && styles.tool} compact={compact} tone="mint" icon={peeking ? 'eye-off' : 'eye'} label={t(peeking ? 'memorySort' : 'memoryView')} onPress={view} disabled={controlsDisabled || won} />
            </>}
          </View>
        </View>
      </View>
    </View>
    <MemoryTutorial visible={tutorial} vessel={vessel} onStart={finishTutorial} onBack={back} />
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
