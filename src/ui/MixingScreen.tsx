import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Dimensions, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cancelAnimation, Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { UiText, useI18n } from '../i18n/I18n';
import { FocusablePressable as Pressable } from './FocusablePressable';
import { GameHeader } from './GameHeader';
import { GameButton } from './GameButton';
import { PourSound } from './PourSound';
import { Bottle } from '../art/Bottle';
import { PourStream } from '../art/PourStream';
import { GameBackdrop } from '../art/GameBackdrop';
import { MixingArtwork } from '../art/MixingArtwork';
import { MIXING_PALETTE, MIXING_SYMBOLS } from '../art/mixingPalette';
import { createPourPlan, POUR_DURATION_MS, type PourPlan } from '../art/pourGeometry';
import { vesselFor, type VesselDesign } from '../art/vesselDesigns';
import { createMixing, mixingComplete, moveMixing, RECIPES, selectMixingGoal, undoMixing, type MixColor, type MixingSession } from '../game/mixing';
import { MIXING_PUZZLES } from '../game/mixingCatalog';
import { getMixing } from '../storage/runtime';
import type { Board, Pour } from '../game/rules';
import { boardLayout } from './boardLayout';

// The smaller logical mixer holds two portions; its cavity/tilt use that capacity.
const BEAKER = vesselFor('beaker');
const MIXER = { ...BEAKER, layerArea: BEAKER.layerArea * 2 };
type Animation = { before: MixingSession['frame']; board: Board; blended: Board; pour: Pour; plan: PourPlan; phase: 'pour' | 'mix' };
type Props = { vessel: VesselDesign; symbols: boolean; sound: boolean; reduceMotion: boolean; onBack: () => void };
export function MixingScreen({ vessel, symbols, sound, reduceMotion, onBack }: Props) {
  const { t, language } = useI18n(), zh = language.startsWith('zh');
  const repository = getMixing(), insets = useSafeAreaInsets(), dimensions = useWindowDimensions();
  const [session, setSession] = useState(() => repository.start());
  const current = useRef(session); current.current = session;
  const [selected, setSelected] = useState<number | null>(null), [animation, setAnimation] = useState<Animation | null>(null);
  const [saved, setSaved] = useState(true), [help, setHelp] = useState(false), [notice, setNotice] = useState('');
  const [visible, setVisible] = useState<readonly number[]>([]), [celebrating, setCelebrating] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [stageWidth, setStageWidth] = useState(Math.min(dimensions.width, 620));
  const scroll = useRef<ScrollView>(null);
  const progress = useSharedValue(1), busy = useRef(false), mounted = useRef(true), timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { puzzle, frame } = session, won = mixingComplete(frame, puzzle), n = frame.bottles.length;
  const scale = stageWidth / 400;
  const sourceLayout = boardLayout(n);
  const positions = [...sourceLayout.positions.map(p => ({ x: p.x, y: p.y + 210 })), { x: 250, y: 12 }];
  const board: Board = [...frame.bottles, frame.mixer].map(b => b.map(u => u.color));
  const names: Record<MixColor, string> = { coral: zh ? '红色' : 'Red', amber: zh ? '黄色' : 'Yellow', indigo: zh ? '蓝色' : 'Blue', silver: zh ? '白色' : 'White', labOrange: zh ? '杏橙' : 'Apricot', labGreen: zh ? '鼠尾草绿' : 'Sage', labPurple: zh ? '丁香紫' : 'Lilac', labPink: zh ? '玫瑰粉' : 'Rose', labSky: zh ? '晴空蓝' : 'Sky', labCream: zh ? '奶油黄' : 'Cream' };
  const colorName = (c: string) => names[c as MixColor];
  const cancel = useCallback(() => {
    cancelAnimation(progress); progress.set(1); busy.current = false; setAnimation(null); setSelected(null);
    timers.current.forEach(clearTimeout); timers.current = []; setCelebrating(false);
    const value = current.current;
    setVisible(mixingComplete(value.frame, value.puzzle) ? value.frame.deliveries.map(d => d.goal) : []);
  }, [progress]);
  const back = useCallback(() => { cancel(); void repository.player.flush(); onBack(); }, [cancel, onBack, repository]);
  function commit(next: MixingSession) {
    current.current = next; setSession(next); setNotice('');
    void repository.commit(next).then(ok => { if (mounted.current) setSaved(ok); });
  }
  useEffect(() => {
    mounted.current = true;
    void repository.commit(current.current).then(ok => { if (mounted.current) setSaved(ok); });
    const background = AppState.addEventListener('change', value => { setActive(value === 'active'); if (value !== 'active') { cancel(); void repository.player.flush(); } });
    const resize = Dimensions.addEventListener('change', cancel);
    const hardware = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; });
    return () => { mounted.current = false; timers.current.forEach(clearTimeout); cancelAnimation(progress); background.remove(); resize.remove(); hardware.remove(); void repository.player.flush(); };
  }, [repository, cancel, back, progress]);
  useEffect(() => { if (reduceMotion) cancel(); }, [reduceMotion, cancel]);
  const finishPour = useCallback(() => {
    setAnimation(value => value && value.pour.target === current.current.frame.bottles.length && value.board[value.pour.target].length === 2 ? { ...value, phase: 'mix' } : null);
  }, []);
  useLayoutEffect(() => {
    if (animation?.phase !== 'pour') return;
    progress.set(withTiming(1, { duration: POUR_DURATION_MS, easing: Easing.linear }, done => { if (done) scheduleOnRN(finishPour); }));
    return () => cancelAnimation(progress);
  }, [animation, progress, finishPour]);
  useEffect(() => {
    if (!animation) { busy.current = false; return; }
    if (animation.phase === 'mix') {
      const timer = setTimeout(() => { setAnimation(null); busy.current = false; }, 480);
      return () => clearTimeout(timer);
    }
  }, [animation]);
  const previousWon = useRef(won);
  useEffect(() => {
    if (!won) { setVisible([]); setCelebrating(false); previousWon.current = false; return; }
    if (animation) return;
    if (previousWon.current || reduceMotion || !active) { setVisible(frame.deliveries.map(d => d.goal)); return; }
    previousWon.current = true; setVisible([]); setCelebrating(true);
    timers.current = frame.deliveries.map((d, i) => setTimeout(() => setVisible(v => [...v, d.goal]), 120 + i * 750));
    timers.current.push(setTimeout(() => setCelebrating(false), 850 + frame.deliveries.length * 750));
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, [won, animation, frame.deliveries, reduceMotion, active]);
  function choose(index: number) { cancel(); previousWon.current = true; commit(createMixing(MIXING_PUZZLES[index])); }
  function pour(target: number) {
    if (busy.current || won) return;
    if (selected === null) { if (board[target].length) setSelected(target); return; }
    if (selected === target) { setSelected(null); return; }
    const before = current.current, next = moveMixing(before, selected, target);
    if (next === before) { setNotice(zh ? '这里暂时倒不进去。可换一个杯子，或免费撤销。' : 'This pour is unavailable. Try another cup, or undo for free.'); return; }
    const source = selected, amount = target === n ? 1 : board[source].length - [...next.frame.bottles, next.frame.mixer][source].length;
    const pour: Pour = { source, target, amount, color: board[source].at(-1)! };
    const visual = board.map((b, i) => i === target ? [...b, ...board[source].slice(-amount)] : b);
    const blended = [...next.frame.bottles, next.frame.mixer].map(b => b.map(u => u.color));
    if (next.frame.deliveries.length > before.frame.deliveries.length) blended[n] = next.frame.deliveries.at(-1)!.units.map(u => u.color);
    if (target === n) scroll.current?.scrollTo({ y: 0, animated: false });
    commit(next); setSelected(null);
    if (!reduceMotion) {
      busy.current = true; progress.set(0);
      setAnimation({ before: before.frame, board: visual, blended, pour, phase: 'pour', plan: createPourPlan(positions[source], positions[target], board[source].length, amount, -35, 12, 400, 610, source === n ? MIXER : vessel, target === n ? MIXER : vessel) });
    }
  }
  const presented = animation?.before ?? frame;
  const target = puzzle.goals[presented.active], recipe = target ? RECIPES[target] : null;
  const shown = animation ? animation.phase === 'pour' ? animation.board : animation.blended : board;
  const pouring = animation?.phase === 'pour';
  const helper = frame.mixer.length === 2 ? zh ? '这次还未达标：可撤销，或倒回空杯。' : 'Not the target yet. Undo, or pour back into an empty cup.'
    : frame.mixer.some(u => u.batch !== null) ? zh ? '成品不能再次混合，可倒回空杯或撤销。' : 'Finished pigment cannot mix again. Pour back, or undo.'
    : zh ? '点原料瓶，再点调色杯；取不到颜色时，先周转。' : 'Tap a source, then the mixer. Rearrange only when a color is buried.';
  return <LinearGradient colors={['#11171E', '#090E16', '#070B12']} style={[styles.screen, Platform.OS === 'web' && { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', height: Math.max(dimensions.height, 400) }]}>
    <StatusBar style="light" />
    <View pointerEvents="none" style={StyleSheet.absoluteFill}><GameBackdrop width={dimensions.width} height={dimensions.height} /></View>
    <PourSound progress={progress} pouring={pouring} vessel={animation?.pour.source === n ? 'beaker' : vessel.id} receiverLayers={animation ? animation.board[animation.pour.target].length - animation.pour.amount : 0} enabled={sound && active && !reduceMotion} />
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}><GameHeader label={`${zh ? '调色' : 'Color lab'} · ${puzzle.number}/6`} compact disabled={false} onBack={back} /></View>
    <ScrollView ref={scroll} style={styles.scroll} onContentSizeChange={() => { if (help) scroll.current?.scrollToEnd({ animated: !reduceMotion }); }} contentContainerStyle={{ alignItems: 'center', paddingBottom: 16 }}>
      <View style={styles.trials}>{MIXING_PUZZLES.map((p, i) => <Pressable key={p.id} testID={`mix-trial-${i + 1}`} accessibilityRole="button" accessibilityLabel={`${zh ? '体验题' : 'Trial'} ${i + 1}`} accessibilityState={{ selected: p.id === puzzle.id }} onPress={() => choose(i)} style={[styles.trial, p.id === puzzle.id && styles.chosen]}><UiText style={styles.trialText}>{i + 1}</UiText></Pressable>)}</View>
      <View style={styles.goals}>{puzzle.goals.map((color, i) => {
        const done = presented.deliveries.some(d => d.goal === i);
        return <Pressable key={i} testID={`mix-goal-${i}`} accessibilityRole="button" accessibilityLabel={`${colorName(color)} · ${done ? '✓' : '2'}`} accessibilityState={{ selected: presented.active === i, disabled: !!frame.mixer.length || done || !!animation }} disabled={!!frame.mixer.length || done || !!animation} onPress={() => commit(selectMixingGoal(current.current, i))} style={[styles.goal, presented.active === i && styles.chosen, done && styles.done]}>
          <View style={[styles.swatch, { backgroundColor: MIXING_PALETTE[color].main }]} /><UiText numberOfLines={1} style={styles.goalText}>{colorName(color)} {done ? '✓' : '×2'}</UiText>
        </Pressable>;
      })}</View>
      {won && !animation ? <View accessibilityLabel={zh ? '完成的作品' : 'Completed artwork'} testID="mix-artwork-complete" style={styles.result}>
        <MixingArtwork puzzle={puzzle} visible={visible} animate={!reduceMotion && active} width={Math.min(stageWidth, 560)} height={Math.min(stageWidth * 1.1, 530)} />
        <UiText style={styles.resultTitle}>{zh ? '这是你调出的色彩' : 'Made with your colors'}</UiText>
        <View style={styles.resultAction}><GameButton kind="wide" icon="next" tone="mint" label={celebrating ? zh ? '看完整作品' : 'Show artwork' : puzzle.number === 6 ? t('back') : t('memoryNext')} onPress={() => { if (celebrating) cancel(); else if (puzzle.number < 6) choose(puzzle.number); else back(); }} /></View>
      </View> : <>
        {recipe && <View style={styles.recipe} accessibilityLabel={`${colorName(recipe[0])} 1 + ${colorName(recipe[1])} 1 = ${colorName(target)} 2`}>
          <View style={[styles.dot, { backgroundColor: MIXING_PALETTE[recipe[0]].main }]} /><UiText style={styles.recipeText}>{colorName(recipe[0])} 1 +</UiText>
          <View style={[styles.dot, { backgroundColor: MIXING_PALETTE[recipe[1]].main }]} /><UiText style={styles.recipeText}>{colorName(recipe[1])} 1 → 2</UiText>
        </View>}
        <View onLayout={e => setStageWidth(e.nativeEvent.layout.width)} style={[styles.stage, { height: 610 * scale }]}>
          <View style={{ position: 'absolute', left: 5 * scale, top: 5 * scale, width: 195 * scale }}>
            <MixingArtwork puzzle={puzzle} visible={[]} width={195 * scale} height={180 * scale} />
            <UiText style={styles.previewNote}>{zh ? '调齐颜色，作品自动显现' : 'Complete the colors to reveal your artwork'}</UiText>
          </View>
          {shown.map((colors, i) => <Bottle key={i} index={i} palette={MIXING_PALETTE} symbolMap={MIXING_SYMBOLS} vessel={i === n ? MIXER : vessel} position={positions[i]} colors={colors} selected={selected === i} completed={false} width={100 * scale} scale={scale} plan={pouring ? animation.plan : null} pour={pouring ? animation.pour : null} progress={progress} symbols={symbols} completionAnimations={active && !reduceMotion} />)}
          {shown.map((colors, i) => <Pressable key={i} testID={i === n ? 'mix-mixer' : `mix-source-${i}`} accessibilityRole="button" accessibilityLabel={i === n ? `${zh ? '调色杯' : 'Mixer'} · ${board[i].length}/2 · ${board[i].map(colorName).join(', ')}` : `${zh ? '原料瓶' : 'Source'} ${i + 1} · ${board[i].map(colorName).join(', ') || (zh ? '空' : 'empty')}`} accessibilityState={{ selected: selected === i, disabled: !!animation }} disabled={!!animation} onPress={() => pour(i)} style={{ position: 'absolute', left: positions[i].x * scale, top: positions[i].y * scale, width: 100 * scale, height: 180 * scale, zIndex: 12 }} />)}
          <UiText pointerEvents="none" style={[styles.mixerLabel, { left: 225 * scale, top: 182 * scale, width: 150 * scale }]}>{zh ? '调色杯' : 'Mixer'} · {animation?.phase === 'mix' ? shown[n].length : presented.mixer.length}/2</UiText>
          {pouring && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 11 }]}><PourStream plan={animation.plan} color={animation.pour.color} progress={progress} palette={MIXING_PALETTE} /></View>}
        </View>

      </>}
      {help && <UiText style={styles.help}>{zh ? '每次倒入调色杯一份，满两份自动混合。颜色与数量都正确才收集。所有目标可提前查看，空杯时可换目标。撤销会同时退回取料、混色和收集；重来恢复全部原料。花朵和彩虹只是同一调色过程的两种成果。' : 'Pour one portion at a time into the mixer. Two portions mix automatically and are collected only when both color and volume match. Choose any unfinished goal while the mixer is empty. Undo reverses the entire pour, mixture and collection. Restart restores all material. Flower and rainbow share the same rules.'}</UiText>}
    </ScrollView>
    <View style={{ alignItems: 'center', paddingBottom: Math.max(insets.bottom, 10), backgroundColor: '#0B121B' }}>
      {!won && <UiText accessibilityLiveRegion="polite" style={styles.helper}>{notice || helper}</UiText>}
      <View style={styles.tools}>
        <GameButton compact style={styles.tool} icon="undo" label={t('undo')} disabled={!session.history.length} onPress={() => { cancel(); commit(undoMixing(current.current)); }} />
        <GameButton compact style={styles.tool} icon="hint" label={zh ? '玩法' : 'Rules'} onPress={() => setHelp(v => !v)} />
        <GameButton compact style={styles.tool} icon="reset" label={t('reset')} onPress={() => { cancel(); commit(createMixing(puzzle)); }} />
        <GameButton compact style={styles.tool} tone="mint" icon="mixer" label={zh ? '调色' : 'Mix'} accessibilityLabel={zh ? '倒入调色杯' : 'Pour into mixer'} disabled={won || !!animation || selected === null || selected === n || frame.mixer.length === 2} onPress={() => pour(n)} />
      </View>
      {!saved && <Pressable accessibilityRole="button" onPress={() => { void repository.player.flush().then(setSaved); }} style={styles.retry}><UiText style={styles.helper}>{t('saveFailed')} · {t('retry')}</UiText></Pressable>}
    </View>
  </LinearGradient>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' }, header: { paddingHorizontal: 18 }, scroll: { flex: 1 },
  trials: { flexDirection: 'row', gap: 5, marginBottom: 10 }, trial: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: '#8099A544', backgroundColor: '#172531' }, trialText: { color: '#C2D1D9', fontSize: 14 },
  chosen: { borderColor: '#D8C399', backgroundColor: '#30434B' }, goals: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, paddingHorizontal: 12 },
  goal: { minHeight: 44, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, borderWidth: 1, borderColor: '#7895A344', backgroundColor: '#172531' }, done: { borderColor: '#83BEA4', opacity: .8 },
  swatch: { width: 17, height: 17, borderRadius: 9, borderWidth: 1, borderColor: '#FFFFFF55' }, goalText: { color: '#D5E2E8', fontSize: 12 },
  recipe: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 13, minHeight: 40 }, recipeText: { color: '#B8CCD5', fontSize: 12 }, dot: { width: 12, height: 12, borderRadius: 7 },
  stage: { width: '100%', maxWidth: 620 }, previewNote: { color: '#8FA6B3', fontSize: 10, textAlign: 'center', paddingHorizontal: 6 }, mixerLabel: { position: 'absolute', color: '#BDCDD6', fontSize: 12, textAlign: 'center' },
  helper: { minHeight: 32, color: '#A8BCC6', fontSize: 12, textAlign: 'center', paddingHorizontal: 20, lineHeight: 18, maxWidth: 620 },
  help: { color: '#BACDD6', fontSize: 13, lineHeight: 22, padding: 18, maxWidth: 620 }, tools: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 6 }, tool: { width: 66 }, retry: { minHeight: 44, justifyContent: 'center' },
  result: { alignItems: 'center', paddingTop: 12 }, resultTitle: { color: '#DAC8A5', fontSize: 19, textAlign: 'center', marginVertical: 12 }, resultAction: { width: 240, marginVertical: 10 },
});
