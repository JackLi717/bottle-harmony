import { FocusablePressable as Pressable } from './FocusablePressable';
import { UiText, useI18n } from '../i18n/I18n';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, BackHandler, Dimensions, Platform, StyleSheet, TVEventControl, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cancelAnimation, Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Bottle } from '../art/Bottle';
import { isBottleComplete, type CompletionEffect } from '../art/bottleCompletion';
import { PourStream } from '../art/PourStream';
import { StageArt } from '../art/StageArt';
import { GameBackdrop } from '../art/GameBackdrop';
import type { MessageKey } from '../i18n/messages';
import { LanguagePicker } from './LanguagePicker';
import { PrivacyPolicy } from './PrivacyPolicy';
import { createPourPlan, type PourPlan } from '../art/pourGeometry';
import { DEMO_LEVEL } from '../game/demo';
import { getPour, type Board, type Pour } from '../game/rules';
import { getSolidPour } from '../game/solidRules';
import { adjacentPreview, type PreviewPosition } from '../game/previewSequence';
import { hasOptionalReserve, oneSpareLevel } from '../game/optionalReserve';
import { moveMainline, hintMainline, hintAvailability, MAX_HINT_CREDITS, editMainline, meltSideMainline, nextMainline, selectMainline, selectSideMainline, resumeMainline, visibleSession, reserveIsLocked, unlockReserveMainline } from '../game/mainline';
import { createSession, moveSession, resetSession, undoSession, meltSession, extendSessionWithEmptyBottle, type GameSession } from '../game/session';
import { createSolver, type SolveResult, type SolverTask } from '../game/solver';
import { HomeScreen } from './HomeScreen';
import { GameHeader } from './GameHeader';
import { GameFooter } from './GameFooter';
import { Celebration } from './Celebration';
import { fireworkCount } from '../art/fireworkPhysics';
import { useSoundPreference } from './useSoundPreference';
import { useVesselPreference } from './useVesselPreference';
import { vesselCompletionEffect } from '../art/vesselDesigns';
import { PourSound } from './PourSound';
import { POUR_DURATION_MS } from '../art/pourGeometry';
import { completedPreviewSession, finishPresentation } from './gamePresentation';
import { DifficultyDebug } from './DifficultyDebug';
import { LevelPicker } from './LevelPicker';
import { CALIBRATION_SAMPLES, DIFFICULTY, LEVEL_LABELS } from './content';
import { MAINLINE, mainlineReport } from './mainlineContent';
import { SOLID_SIDES } from './solidSideContent';
import type { DifficultyReport, PlanningDepthReport } from '../game/difficulty';
import type { HumanDifficultyReport } from '../game/humanDifficulty';
import { MainlineMenu } from './MainlineMenu';
import { CompletionEffectPicker } from './CompletionEffectPicker';
import { INTERNAL_TOOLS } from './buildConfig';
import { Tutorial } from './PlayMenu';
import { usePlayProgress } from './usePlayProgress';
import { deviceLayout } from './deviceLayout';
import { bottleControlId, useBoardKeyboard } from './useBoardKeyboard';
import { GameNotice } from './GameNotice';
import { boardLayout, bottleHitWidth, fitBoard } from './boardLayout';
import { referenceHint, type CalibrationSample } from '../game/calibration';
import { advanceStalledNotice, closeStalledNotice, INITIAL_STALLED_NOTICE, showUnsolvableNotice } from './stalledNoticePolicy';

type Animation = { before: Board; pour: Pour; plan: PourPlan };
const SIDE_AFTER = SOLID_SIDES.entries.map(item => item.afterMainline);

export function DemoScreen() {
  const { t, ready: languageReady } = useI18n();
  const insets = useSafeAreaInsets();
  const dimensions = useWindowDimensions();
  const { compact, rail, horizontalInset, verticalInset } = deviceLayout(dimensions.width, dimensions.height, Platform.isTV);
  const { play, setPlay, ready, saveStatus } = usePlayProgress();
  const { sound, ready: soundReady, saved: soundSaved, toggleSound } = useSoundPreference();
  const { vessel, ready: vesselReady, saved: vesselSaved, chooseVessel } = useVesselPreference();
  const [page, setPage] = useState<'home' | 'game'>('home');
  const [internalSession, setInternalSession] = useState<GameSession | null>(null);
  const session = internalSession ?? visibleSession(play);
  const sample = CALIBRATION_SAMPLES.find(item => item.content.level.id === session.level.id) ?? null;
  const entry = MAINLINE.entries.find(item => item.level.id === session.level.id);
  const sideEntry = SOLID_SIDES.entries.find(item => item.level.id === session.level.id);
  const label = sideEntry ? t('solidSideLabel', { n: sideEntry.number }) : entry ? `Level ${entry.number}` : LEVEL_LABELS.get(session.level.id)!;
  const previewPosition: PreviewPosition | null = sideEntry ? { kind: 'side', number: sideEntry.number }
    : entry ? { kind: 'main', number: entry.number } : null;
  const previousPreview = previewPosition && adjacentPreview(previewPosition, -1, MAINLINE.entries.length, SIDE_AFTER);
  const followingPreview = previewPosition && adjacentPreview(previewPosition, 1, MAINLINE.entries.length, SIDE_AFTER);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [menuSection, setMenuSection] = useState<'levels' | 'settings'>('levels');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [difficultyVisible, setDifficultyVisible] = useState(false);
  const [languageVisible, setLanguageVisible] = useState(false);
  const [completionPickerVisible, setCompletionPickerVisible] = useState(false);
  const [completionEffect, setCompletionEffect] = useState<CompletionEffect>('cork');
  const [pendingCelebration, setPendingCelebration] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<'win' | 2 | 3 | 4 | 5 | null>(null);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [completionEpoch, setCompletionEpoch] = useState(0);
  const [debugReport, setDebugReport] = useState<DifficultyReport | PlanningDepthReport | null>(null);
  const [debugHuman, setDebugHuman] = useState<HumanDifficultyReport | null>(null);
  const { board, history } = session;
  const reserveLocked = internalSession
    ? !!entry && hasOptionalReserve(entry) && session.level.bottles.length === entry.level.bottles.length - 1
    : reserveIsLocked(play, MAINLINE);
  const [searching, setSearching] = useState(false);
  const [lastAward, setLastAward] = useState(0);
  const search = useRef<SolverTask | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [animation, setAnimation] = useState<Animation | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0, y: 0 });
  const [bodyY, setBodyY] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  // A synchronous gate prevents consecutive touches from accepting overlapping moves.
  const busy = useRef(false);
  const progress = useSharedValue(1);
  const safeTop = Math.max(insets.top, verticalInset) + (compact ? 8 : 14);
  // Use the full screen width for resting bottles. Pouring art may cross the
  // horizontal screen edge and is clipped by the screen, not by a bottle slot.
  // Keep the original slot visible so enabling the reserve never shifts glass.
  const layout = boardLayout(board.length + (reserveLocked ? 1 : 0));
  // Preserve the stage's offset within the safe container after adding the body wrapper.
  const { scale, minY } = fitBoard(layout, { ...stage, y: stage.y + bodyY }, safeTop);
  const won = session.status === 'solved';
  const hintMode = internalSession ? 'replay' : hintAvailability(play);
  const hintParams = { n: play.hintCredits, max: MAX_HINT_CREDITS };
  const hintStatus = sideEntry && session.solid && !session.solid.melted && !won ? t('solidInstruction')
    : won && lastAward > 0 && !internalSession && !play.replay
    ? t('hintAward', { n: lastAward, balance: play.hintCredits, max: MAX_HINT_CREDITS })
    : hintMode === 'replay' ? t('replayHintStatus')
    : won ? t('hintCredits', hintParams)
    : t(hintMode === 'free' ? 'freeHintStatus' : hintMode === 'ticket' ? 'paidHintStatus' : 'emptyHintStatus', hintParams);
  const [stalledNotice, setStalledNotice] = useState(INITIAL_STALLED_NOTICE);
  const stalledEligible = ready && languageReady && soundReady && vesselReady && play.tutorialDone && appActive && !animation && !searching;
  const nextNotice = advanceStalledNotice(stalledNotice, {
    scope: `${internalSession ? 'preview' : play.replay ? 'replay' : sideEntry ? 'side' : 'mainline'}:${session.level.id}`,
    board, status: session.status, entered: page === 'game', eligible: stalledEligible,
  });
  // React supports conditional state adjustment during render. This avoids a frame
  // with a stale notice after undo, switching sessions, or committing a new move.
  if (nextNotice !== stalledNotice) setStalledNotice(nextNotice);
  const stalledReason = stalledEligible && page === 'game' ? nextNotice.reason : null;
  const finish = !internalSession && !play.replay && sideEntry
    ? play.current === MAINLINE.entries.length ? { title: 'finalFinished' as const, label: 'replayLevels' as const, action: 'levels' as const }
      : { title: 'finished' as const, label: 'next' as const, action: 'next' as const }
    : !internalSession && !play.replay && entry?.number === MAINLINE.entries.length && play.sideCompletedThrough < SOLID_SIDES.entries.length
      ? { title: 'finished' as const, label: 'next' as const, action: 'next' as const }
      : finishPresentation(internalSession ? 'preview' : play.replay ? 'replay' : 'mainline', entry?.number ?? play.current);
  const celebrationCount = fireworkCount(entry?.tier ?? sample?.tier ?? 'D1');
  useEffect(() => {
    if (!pendingCelebration || animation || !appActive || page !== 'game' || session.level.id !== pendingCelebration || !won) return;
    // Let the final bottle's cork settle. This timer never controls completion or unlocks.
    const timeout = setTimeout(() => { setCelebration(reduceMotion ? null : 'win'); setPendingCelebration(null); }, reduceMotion ? 0 : 1000);
    return () => clearTimeout(timeout);
  }, [pendingCelebration, animation, appActive, page, session.level.id, won, reduceMotion]);
  const celebrationFinished = useCallback(() => setCelebration(null), []);
  function previewCelebration(count: 2 | 3 | 4 | 5) {
    if (busy.current) return;
    const preview = MAINLINE.entries.find(item => item.level.bottles.length === 8)!;
    setInternalSession(completedPreviewSession(preview));
    setPendingCelebration(null);
    setCelebration(reduceMotion ? null : count);
    setSelected(null); setMenuVisible(false); setPage('game');
  }
  const finished = useCallback(() => {
    busy.current = false;
    setAnimation(null);
    setSelected(null);
  }, [setAnimation, setSelected]);

  useLayoutEffect(() => {
    if (!animation) return;
    // Start after the persistent bottle views receive the new plan, rather than
    // advancing the UI clock while React is still switching their props.
    progress.set(withTiming(1, { duration: POUR_DURATION_MS, easing: Easing.linear }, done => {
      if (done) scheduleOnRN(finished);
    }));
    return () => cancelAnimation(progress);
  }, [animation, finished, progress]);

  useEffect(() => {
    let mounted = true;
    const motionChanged = (value: boolean) => { setReduceMotion(value); if (value) { setCelebration(null); setPendingCelebration(null); } };
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) motionChanged(value); }).catch(() => {});
    const preference = AccessibilityInfo.addEventListener('reduceMotionChanged', motionChanged);
    const subscription = AppState.addEventListener('change', state => {
      setAppActive(state === 'active');
      if (state !== 'active') {
        setPendingCelebration(null);
        setCelebration(null);
        setCompletionEpoch(epoch => epoch + 1);
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
      setPendingCelebration(null);
      setCelebration(null);
      setCompletionEpoch(epoch => epoch + 1);
      cancelAnimation(progress);
      progress.set(1);
      setAnimation(null);
      setSelected(null);
      if (!search.current) busy.current = false;
    });
    return () => subscription.remove();
  }, [progress]);

  function announceStatus(key: MessageKey) {
    AccessibilityInfo.announceForAccessibility(t(key));
  }

  const goHome = useCallback(() => {
    if (busy.current) return;
    setSelected(null);
    setPendingCelebration(null);
    setCelebration(null);
    setLastAward(0);
    setPage('home');
  }, [setSelected, setPage, setPendingCelebration, setCelebration]);
  const handlesTVBack = page === 'game' || menuVisible || privacyVisible || pickerVisible || difficultyVisible || languageVisible || completionPickerVisible || !!notice;
  useEffect(() => {
    if (!Platform.isTV || Platform.OS !== 'ios' || !handlesTVBack) return;
    // Apple TV otherwise lets Menu leave the app before BackHandler can navigate.
    TVEventControl.enableTVMenuKey();
    return () => TVEventControl.disableTVMenuKey();
  }, [handlesTVBack]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (page !== 'game') return false;
      goHome();
      return true;
    });
    return () => subscription.remove();
  }, [page, goHome]);

  function chooseSample(next: CalibrationSample | null) {
    if (busy.current) return;
    setPendingCelebration(null); setCelebration(null);
    setLastAward(0);
    setInternalSession(createSession(next?.content.level ?? DEMO_LEVEL));
    setSelected(null);
    announceStatus('tapStart');
    setPickerVisible(false);
    setPage('game');
  }

  function previewSide(number: number) {
    if (busy.current) return;
    const extra = SOLID_SIDES.entries[number - 1];
    if (!extra) return;
    setPendingCelebration(null); setCelebration(null); setLastAward(0);
    setInternalSession(createSession(extra.level, { bottle: extra.frozenBottle, depth: 1, melted: false, meltAt: null }));
    setSelected(null); setMenuVisible(false); setPickerVisible(false); setPage('game'); announceStatus('tapStart');
  }

  function previewMainline(number: number) {
    if (busy.current) return;
    const target = MAINLINE.entries[number - 1];
    if (!target) return;
    setPendingCelebration(null); setCelebration(null); setLastAward(0);
    setInternalSession(createSession(oneSpareLevel(target)));
    setSelected(null); setMenuVisible(false); setPickerVisible(false); setPage('game'); announceStatus('tapStart');
  }

  function openMenu(section: 'levels' | 'settings') {
    if (busy.current) return;
    setMenuSection(section);
    setMenuVisible(true);
  }

  function browsePreview(position: PreviewPosition | null) {
    if (!position || busy.current || searching) return;
    if (position.kind === 'side') previewSide(position.number);
    else previewMainline(position.number);
  }

  function openDifficulty() {
    if (busy.current) return;
    if (sideEntry) return;
    setMenuVisible(false);
    if (entry) {
      const full = mainlineReport(entry.number);
      setDebugReport(full.rating.evidence);
      setDebugHuman(full.human);
    } else {
      setDebugReport(DIFFICULTY.get(session.level.id)!);
      setDebugHuman(null);
    }
    setDifficultyVisible(true);
  }

  function nextLevel() {
    if (busy.current) return;
    setPendingCelebration(null); setCelebration(null);
    setLastAward(0);
    setInternalSession(null);
    if (!internalSession) setPlay(nextMainline(play, MAINLINE, SOLID_SIDES));
    setSelected(null); setMenuVisible(false);
    announceStatus('tapStart');
  }

  function chooseNumber(number: number) {
    if (busy.current) return;
    setPendingCelebration(null); setCelebration(null);
    setLastAward(0);
    setInternalSession(null); setPlay(selectMainline(play, MAINLINE, number));
    setSelected(null); setMenuVisible(false); setPage('game'); announceStatus('tapStart');
  }

  function resumeCurrent() {
    if (busy.current) return;
    setPendingCelebration(null); setCelebration(null); setLastAward(0);
    setInternalSession(null); setPlay(resumeMainline(play));
    setSelected(null); setMenuVisible(false); setPage('game'); announceStatus('tapStart');
  }

  function chooseSide(number: number) {
    if (busy.current) return;
    setPendingCelebration(null); setCelebration(null); setLastAward(0);
    setInternalSession(null); setPlay(selectSideMainline(play, SOLID_SIDES, number));
    setSelected(null); setMenuVisible(false); setPage('game'); announceStatus('tapStart');
  }

  function startPour(pour: Pour, hinted = false) {
    if (busy.current) return;
    const accepted = internalSession ? moveSession(internalSession, pour.source, pour.target)
      : hinted ? hintMainline(play, pour.source, pour.target) : moveMainline(play, pour.source, pour.target);
    if (!accepted) return;
    busy.current = true;
    if ('state' in accepted) {
      setPlay(accepted.state);
      if (visibleSession(accepted.state).status === 'solved') setLastAward(accepted.awardedTickets);
    } else { setInternalSession(accepted.session); setLastAward(0); }
    const resultingSession = 'state' in accepted ? visibleSession(accepted.state) : accepted.session;
    if (resultingSession.status === 'solved') setPendingCelebration(resultingSession.level.id);
    if (resultingSession.status !== 'stalled') announceStatus(resultingSession.status === 'solved' ? 'finished' : 'gentle');
    if (reduceMotion) { busy.current = false; setSelected(null); return; }
    progress.set(0);
    const { before, pour: committedPour } = accepted.event;
    setAnimation({ before, pour: committedPour, plan: createPourPlan(layout.positions[committedPour.source], layout.positions[committedPour.target], before[committedPour.source].length, committedPour.amount, minY, selected === committedPour.source ? 12 : 0, layout.width, layout.height, vessel) });
  }

  function selectBottle(index: number) {
    if (busy.current) return;
    if (won) { announceStatus('finished'); return; }
    if (selected === index) { setSelected(null); return; }
    if (selected === null) {
      if (!board[index].length) { announceStatus('emptySource'); return; }
      setSelected(index);
      announceStatus('pourTarget');
      return;
    }
    const pour = session.solid ? getSolidPour(board, selected, index, session.level.capacity, session.solid)
      : getPour(board, selected, index, session.level.capacity);
    if (!pour) {
      announceStatus(session.solid && !session.solid.melted && selected === session.solid.bottle && board[selected].length === 1
        ? 'solidLocked' : board[index].length === session.level.capacity ? 'fullBottle' : 'pourTarget');
      return;
    }
    startPour(pour);
  }

  function useReserve() {
    if (busy.current || searching || won || !reserveLocked) return;
    setStalledNotice(value => closeStalledNotice(value, true));
    if (internalSession && entry) setInternalSession(extendSessionWithEmptyBottle(internalSession, entry.level));
    else setPlay(unlockReserveMainline(play, MAINLINE));
    setSelected(null);
    announceStatus('reserveEnabled');
  }

  function heatSide() {
    if (busy.current || searching || won || !session.solid || session.solid.melted) return;
    setStalledNotice(value => closeStalledNotice(value, true));
    if (internalSession) setInternalSession(meltSession(internalSession));
    else setPlay(meltSideMainline(play));
    setSelected(null);
    AccessibilityInfo.announceForAccessibility(t('heat'));
  }

  function reset() {
    if (busy.current) return;
    setStalledNotice(value => closeStalledNotice(value, true));
    setPendingCelebration(null); setCelebration(null);
    setLastAward(0);
    if (internalSession) setInternalSession(resetSession(internalSession)); else setPlay(editMainline(play, 'reset')); setSelected(null);
    announceStatus('tapStart');
  }

  function undo() {
    if (busy.current || !history.length) return;
    setStalledNotice(value => closeStalledNotice(value, true));
    setPendingCelebration(null); setCelebration(null);
    setLastAward(0);
    if (internalSession) setInternalSession(undoSession(internalSession)); else setPlay(editMainline(play, 'undo'));
    setSelected(null); announceStatus('undone');
  }

  async function demonstrate() {
    if (busy.current) return;
    if (won) { nextLevel(); return; }
    if (session.status === 'stalled') { setStalledNotice(value => showUnsolvableNotice(value)); return; }
    if (hintMode === 'none') { setNotice({ title: t('hint'), message: t('emptyHintStatus') }); return; }
    const content = entry ?? sample?.content;
    const referencePour = content ? referenceHint(content, board) : null;
    if (referencePour) { startPour(referencePour, true); return; }
    const task = createSolver(board, { capacity: session.level.capacity,
      maxStates: sideEntry ? 100000 : 30000, maxMilliseconds: sideEntry ? 700 : 200,
      solid: session.solid ?? undefined });
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
    if (result.status === 'solved' && result.route.length) startPour(result.route[0], true);
    else if (result.status === 'unsolvable') setStalledNotice(value => showUnsolvableNotice(value));
    else setNotice({ title: t('hint'), message: t('searchLimit') });
  }

  const displayBoard = animation ? animation.before.map((bottle, index) => index === animation.pour.target
    ? [...bottle, ...Array(animation.pour.amount).fill(animation.pour.color)]
    : bottle) : board;

  function continueAfterWin() {
    if (busy.current) return;
    setPendingCelebration(null); setCelebration(null);
    if (finish.action === 'home') goHome();
    else if (finish.action === 'levels') {
      if (play.side && !play.replay) setPlay(nextMainline(play, MAINLINE, SOLID_SIDES));
      goHome(); openMenu('levels');
    }
    else nextLevel();
  }

  useBoardKeyboard({ enabled: page === 'game' && !menuVisible && !privacyVisible && !pickerVisible && !difficultyVisible && !languageVisible && !completionPickerVisible && !notice && (play.tutorialDone || !!internalSession),
    disabled: !!animation || searching, positions: layout.positions, onEscape: () => selected === null ? goHome() : setSelected(null) });

  if (!ready || !languageReady || !soundReady || !vesselReady) return <LinearGradient colors={['#11171E', '#070B12']} style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}><StatusBar style="light" /><UiText style={styles.loading}>{t('loading')}</UiText></LinearGradient>;

  return (
    <LinearGradient colors={['#11171E', '#090E16', '#070B12']} locations={[0, 0.58, 1]} testID={`game-screen-${dimensions.width}x${dimensions.height}`} style={[styles.screen, Platform.OS === 'web' && { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', height: Math.max(dimensions.height, rail ? 400 : 520) }]}>
      <StatusBar style="light" />
      <PourSound progress={progress} pouring={!!animation} vessel={vessel.id} receiverLayers={animation ? animation.before[animation.pour.target].length : 0} enabled={sound && appActive && !reduceMotion && page === 'game'} />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}><GameBackdrop width={dimensions.width} height={dimensions.height} /></View>
      <View style={[styles.safe, { paddingTop: safeTop, paddingBottom: Math.max(insets.bottom, verticalInset, 14), paddingLeft: Math.max(insets.left, horizontalInset), paddingRight: Math.max(insets.right, horizontalInset) }]}>
        {page === 'home' ? <HomeScreen current={play.current} sideNumber={play.side ? play.current / 20 : null} hintCredits={play.hintCredits} compact={compact} landscape={rail} onPlay={resumeCurrent} onLevels={() => openMenu('levels')} onSettings={() => openMenu('settings')} vessel={vessel} vesselSaved={vesselSaved} reduceMotion={reduceMotion} onVessel={chooseVessel} /> : <>
        <GameHeader label={label} compact={compact} disabled={!!animation || searching} onBack={goHome}
          previewNavigation={INTERNAL_TOOLS && previewPosition ? {
            detail: sideEntry ? `开发浏览 · 凝固最短 ${sideEntry.difficulty.frozenMoves} 步`
              : `开发浏览 · ${entry!.tier} · ${entry!.score} 分`,
            previous: !!previousPreview, next: !!followingPreview,
            onPrevious: () => browsePreview(previousPreview), onNext: () => browsePreview(followingPreview),
          } : undefined} />
        <View style={[styles.gameBody, rail && styles.gameBodyRail]} onLayout={event => setBodyY(event.nativeEvent.layout.y)}>
        <View testID="game-stage" style={[styles.stageSpace, rail && styles.railStage]} onLayout={event => {
          const layout = event.nativeEvent.layout;
          setStage(old => old.width === layout.width && old.height === layout.height && old.y === layout.y ? old : layout);
        }}>
          {scale > 0 && <View collapsable={false} style={{ width: layout.width * scale, height: layout.height * scale, overflow: 'visible' }}>
            <View style={StyleSheet.absoluteFill}><StageArt layout={layout} /></View>
            {/* Art stays mounted in one layer for selection, pouring and return.
                Fixed hit areas below never reparent or reposition the artwork. */}
            {layout.positions.slice(0, displayBoard.length).map((position, index) => {
              const bottle = displayBoard[index];
              // A view belongs to a visual slot; logical bottle IDs stay in the session.
              // Reuse glass/SVG/worklet bindings when the next level replaces its contents.
              return <Bottle key={index} index={index} vessel={vessel} position={position} colors={bottle} selected={selected === index} completed={isBottleComplete(bottle, session.level.capacity)} width={100 * scale} scale={scale} plan={animation?.plan ?? null} pour={animation?.pour ?? null} progress={progress} symbols={play.symbols} frozenBottom={!!session.solid && !session.solid.melted && session.solid.bottle === index} completionEffect={completionEffect} completionScene={`${session.level.id}:${completionEpoch}`} completionAnimations={appActive && !reduceMotion} />;
            })}
            {reserveLocked && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: 0.25 }]}>
              <Bottle index={board.length} vessel={vessel} position={layout.positions[board.length]} colors={[]} selected={false} completed={false} width={100 * scale} scale={scale} plan={null} pour={null} progress={progress} completionAnimations={false} />
            </View>}
            {layout.positions.slice(0, displayBoard.length).map((position, index) => {
              const bottle = displayBoard[index];
              const label = t('bottle', { n: index + 1, colors: bottle.length ? [...bottle].reverse().map(c => t(c)).join(', ') : t('empty') });
              const hitWidth = bottleHitWidth(layout, scale);
              return <Pressable key={index} focusIndicatorStyle={{ position: 'absolute', alignSelf: 'center', top: 15 * scale, width: 64 * scale, height: 160 * scale, borderRadius: 12 * scale }} nativeID={bottleControlId(index)} testID={bottleControlId(index)} hasTVPreferredFocus={Platform.isTV && index === 0} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={t('tapStart')} accessibilityState={{ selected: selected === index, disabled: !!animation || searching }} disabled={!Platform.isTV && (!!animation || searching)} onPress={() => selectBottle(index)} style={{ position: 'absolute', left: (position.x + 50) * scale - hitWidth / 2, top: position.y * scale, width: hitWidth, height: 180 * scale, zIndex: 3 }}>
                {selected === index && !animation && <View style={[styles.selectionDot, { bottom: -5 * scale }]} />}
              </Pressable>;
            })}
            {reserveLocked && <Pressable focusIndicatorStyle={{ position: 'absolute', alignSelf: 'center', top: 15 * scale, width: 64 * scale, height: 160 * scale, borderRadius: 12 * scale }} nativeID={bottleControlId(board.length)} testID={bottleControlId(board.length)} accessibilityRole="button" accessibilityLabel={t('reserveUnlock')} accessibilityHint={t('reserveScope')}
              accessibilityState={{ disabled: !!animation || searching || won }} disabled={!!animation || searching || won} onPress={useReserve}
              style={{ position: 'absolute', left: (layout.positions[board.length].x + 50) * scale - bottleHitWidth(layout, scale) / 2,
                top: layout.positions[board.length].y * scale, width: bottleHitWidth(layout, scale), height: 180 * scale,
                zIndex: 3 }} />}
            {sideEntry && session.solid && !session.solid.melted && <View pointerEvents="none" style={{ position: 'absolute',
              left: (layout.positions[session.solid.bottle].x + 50) * scale - 21 * scale,
              top: (layout.positions[session.solid.bottle].y + 169) * scale, width: 42 * scale, height: 10 * scale,
              alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
              <View style={[styles.frozenMarker, { width: 35 * scale, height: 5 * scale, borderRadius: 3 * scale }]} />
              <View style={[styles.frozenMarkerCenter, { width: 8 * scale, height: 8 * scale, top: 1 * scale }]} />
            </View>}
            {animation && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 11 }]}><PourStream plan={animation.plan} color={animation.pour.color} progress={progress} /></View>}
          </View>}
          {celebration !== null && appActive && !reduceMotion && stage.width > 0 && stage.height > 0 && <Celebration count={celebration === 'win' ? celebrationCount : celebration} width={stage.width} height={stage.height} sound={sound} onComplete={celebrationFinished} />}
        </View>
        <GameFooter rail={rail} won={won} continueVisible={won && !animation && !pendingCelebration && celebration === null} compact={compact}
          disabled={!!animation || searching} undoDisabled={!history.length || !!animation || searching} searching={searching} reduceMotion={reduceMotion}
          nextLabel={t(finish.label)} hintStatus={hintStatus} onUndo={undo} onReset={reset} onHint={demonstrate}
          stalledReason={stalledReason} reserveAvailable={reserveLocked} heatAvailable={!!session.solid && !session.solid.melted} onHeat={heatSide} onCloseStalled={() => setStalledNotice(value => closeStalledNotice(value))}
          onContinue={continueAfterWin} />
        </View>
        </>}
      </View>
      {debugReport && <DifficultyDebug visible={difficultyVisible} report={debugReport} human={debugHuman} sample={sample} label={label} onClose={() => setDifficultyVisible(false)} />}
      {menuVisible && <MainlineMenu visible initialSection={menuSection} play={play} saveStatus={t(saveStatus)} onClose={() => setMenuVisible(false)} onResume={resumeCurrent} onSelect={chooseNumber} onSelectSide={chooseSide} onPreview={previewMainline} onSidePreview={previewSide} onSamples={() => { setMenuVisible(false); setPickerVisible(true); }} symbols={play.symbols} onSymbols={() => setPlay(Object.freeze({ ...play, symbols: !play.symbols }))} completionName={t(vesselCompletionEffect(vessel, completionEffect))} onLanguage={() => { setMenuVisible(false); setLanguageVisible(true); }} onCompletionEffects={() => { setMenuVisible(false); setCompletionPickerVisible(true); }} sound={sound} soundSaved={soundSaved} onSound={toggleSound} onCelebrationPreview={previewCelebration} onPrivacy={() => { setMenuVisible(false); setPrivacyVisible(true); }} onDebug={INTERNAL_TOOLS && !sideEntry ? openDifficulty : undefined} />}
      <GameNotice notice={notice} onClose={() => setNotice(null)} />
      <PrivacyPolicy visible={privacyVisible} onClose={() => { setPrivacyVisible(false); openMenu('settings'); }} />
      <LanguagePicker visible={languageVisible} onClose={() => { setLanguageVisible(false); openMenu('settings'); }} />
      <CompletionEffectPicker visible={completionPickerVisible} vessel={vessel} value={completionEffect} reduceMotion={reduceMotion} onSelect={effect => { setCompletionEffect(effect); setSelected(null); }} onClose={() => setCompletionPickerVisible(false)} />
      <Tutorial visible={page === 'game' && ready && !internalSession && !play.tutorialDone} onStart={() => setPlay(Object.freeze({ ...play, tutorialDone: true }))} onSkip={() => setPlay(Object.freeze({ ...play, tutorialDone: true }))} />
      {INTERNAL_TOOLS && <LevelPicker visible={pickerVisible} currentCode={sample?.code ?? null} onClose={() => setPickerVisible(false)} onSelect={chooseSample} onPreview={previewMainline} onSidePreview={previewSide} />}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' },
  safe: { flex: 1, paddingHorizontal: 22 },
  loading: { color: '#BDCDD3', fontSize: 14 },
  gameBody: { flex: 1, minHeight: 0 },
  gameBodyRail: { flexDirection: 'row', gap: 24 },
  railStage: { marginHorizontal: 0, minWidth: 0 },
  stageSpace: { flex: 1, alignItems: 'center', justifyContent: 'center', marginHorizontal: -22, marginTop: 8, marginBottom: 4 },
  selectionDot: { position: 'absolute', alignSelf: 'center', width: 4, height: 4, borderRadius: 2, backgroundColor: '#B8F7E2' },
  frozenMarker: { backgroundColor: '#A8E9FA', shadowColor: '#A8E9FA', shadowOpacity: .8, shadowRadius: 5 },
  frozenMarkerCenter: { position: 'absolute', backgroundColor: '#E8FBFF', borderWidth: 1, borderColor: '#84CADA', transform: [{ rotate: '45deg' }] },
});
