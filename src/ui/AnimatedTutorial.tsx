import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, Modal, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Circle, Path } from 'react-native-svg';
import { Bottle } from '../art/Bottle';
import { PourStream } from '../art/PourStream';
import { StageArt } from '../art/StageArt';
import { createPourPlan } from '../art/pourGeometry';
import { isBottleComplete } from '../art/bottleCompletion';
import type { VesselDesign } from '../art/vesselDesigns';
import { UiText, useI18n } from '../i18n/I18n';
import { boardLayout } from './boardLayout';
import { GameButton } from './GameButton';
import { Icon } from './Icon';
import { PourSound } from './PourSound';
import { Celebration } from './Celebration';
import { tutorialDemonstration, type TutorialContent } from './tutorialDemonstration';

type Props = {
  visible: boolean; content: TutorialContent; vessel: VesselDesign; sound: boolean; symbols: boolean; reduceMotion: boolean;
  onStart: () => void; onBack?: () => void;
};

export function AnimatedTutorial(props: Props) {
  // Closing destroys every timer, audio player and UI-thread animation. Opening starts a fresh private demonstration.
  return <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onBack ?? props.onStart}>
    {props.visible && <Demonstration {...props} />}
  </Modal>;
}

function Demonstration({ content, vessel, sound, symbols, reduceMotion, onStart, onBack }: Props) {
  const { t } = useI18n(), insets = useSafeAreaInsets(), dimensions = useWindowDimensions();
  const landscape = dimensions.width > dimensions.height;
  const beats = useMemo(() => tutorialDemonstration(content), [content]);
  const [index, setIndex] = useState(0), [epoch, setEpoch] = useState(0), [paused, setPaused] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const revision = useRef(0);
  const progress = useSharedValue(1), reveal = useSharedValue(1);
  const handX = useSharedValue(200), handY = useSharedValue(230), handAlpha = useSharedValue(0), tap = useSharedValue(0);
  const beat = beats[index], running = active && !paused && stage.width > 0 && stage.height > 0;
  const layout = useMemo(() => {
    const board = boardLayout(content.level.bottles.length);
    return { ...board, height: 480, positions: board.positions.map(p => ({ x: p.x, y: p.y + 40 })) };
  }, [content.level]);
  const scale = Math.max(0, Math.min(stage.width / layout.width, stage.height / layout.height));
  const pouring = running && beat.kind === 'pour';
  const picture = paused ? beat.resting : beat.picture;
  const plan = useMemo(() => beat.pour ? createPourPlan(layout.positions[beat.pour.source], layout.positions[beat.pour.target],
    beat.picture.board[beat.pour.source].length, beat.pour.amount, 0, 12, layout.width, layout.height, vessel) : null,
  [beat, layout, vessel]);
  const artPour = useMemo(() => beat.pour ? { ...beat.pour, source: beat.pour.source + 400, target: beat.pour.target + 400 } : null, [beat.pour]);
  const advance = useCallback((expected: number) => {
    if (revision.current === expected) setIndex(i => Math.min(beats.length - 1, i + 1));
  }, [beats.length]);
  const retire = useCallback((expected: number) => { if (revision.current === expected) revision.current++; }, []);
  const stop = useCallback(() => {
    revision.current++;
    setPaused(true);
    for (const value of [progress, reveal, handX, handY, handAlpha, tap]) cancelAnimation(value);
    progress.set(1); reveal.set(1); handAlpha.set(0);
  }, [progress, reveal, handX, handY, handAlpha, tap]);
  function replay() {
    revision.current++; setIndex(0); setEpoch(e => e + 1); setPaused(false);
    progress.set(1); reveal.set(1); handAlpha.set(0); tap.set(0);
  }
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setActive(state === 'active'); if (state !== 'active') stop();
    });
    return () => subscription.remove();
  }, [stop]);
  const previousSize = useRef(`${dimensions.width}:${dimensions.height}`);
  useEffect(() => {
    const size = `${dimensions.width}:${dimensions.height}`;
    if (previousSize.current !== size) { previousSize.current = size; stop(); }
  }, [dimensions.width, dimensions.height, stop]);
  useLayoutEffect(() => {
    if (!running) return;
    const token = ++revision.current;
    const duration = reduceMotion && (beat.kind === 'pour' || beat.kind === 'reveal') ? 0 : beat.duration;
    const point = beat.hand === 'ready' ? { x: 200, y: 438 } : typeof beat.hand === 'number'
      ? { x: layout.positions[beat.hand].x + 53, y: layout.positions[beat.hand].y + 72 } : null;
    const tapped = beat.kind.endsWith('Tap');
    if (point) {
      handX.set(withTiming(point.x, { duration: reduceMotion ? 0 : beat.duration, easing: Easing.inOut(Easing.quad) }));
      handY.set(withTiming(point.y, { duration: reduceMotion ? 0 : beat.duration, easing: Easing.inOut(Easing.quad) }));
    }
    handAlpha.set(withTiming(point ? 1 : 0, { duration: reduceMotion ? 0 : 160 }));
    tap.set(tapped && !reduceMotion ? withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 200 })) : 0);
    if (beat.kind === 'pour') {
      reveal.set(0); progress.set(0);
      progress.set(withTiming(1, { duration, easing: Easing.linear }, done => { if (done) scheduleOnRN(advance, token); }));
    } else if (beat.kind === 'reveal') {
      progress.set(1); reveal.set(0);
      reveal.set(withTiming(1, { duration, easing: Easing.linear }, done => { if (done) scheduleOnRN(advance, token); }));
    } else if (beat.kind !== 'done' && (beat.kind !== 'win' || reduceMotion)) {
      const timer = setTimeout(() => advance(token), duration);
      return () => { retire(token); clearTimeout(timer); };
    }
    return () => { retire(token); cancelAnimation(progress); cancelAnimation(reveal); };
  }, [beat, running, epoch, reduceMotion, layout, progress, reveal, handX, handY, handAlpha, tap, advance, retire]);
  useEffect(() => () => {
    for (const value of [progress, reveal, handX, handY, handAlpha, tap]) cancelAnimation(value);
  }, [progress, reveal, handX, handY, handAlpha, tap]);
  const handStyle = useAnimatedStyle(() => ({ opacity: handAlpha.value,
    transform: [{ translateX: (handX.value - 20) * scale }, { translateY: (handY.value - 4) * scale }, { scale: 1 - tap.value * .08 }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: tap.value * .8,
    transform: [{ translateX: (handX.value - 22) * scale }, { translateY: (handY.value - 22) * scale }, { scale: 1 + tap.value * .5 }] }));
  const finished = beat.kind === 'done';
  const readyShown = ['observe', 'ready', 'readyTap'].includes(beat.kind) && !!content.memory;
  const description = t(content.memory ? beat.kind === 'observe' ? 'memoryStep1' : beat.kind === 'hide' ? 'memoryStep2'
    : ['reveal', 'win', 'done'].includes(beat.kind) ? 'memoryStep3' : 'step2' : finished ? 'objective' : 'step2');
  return <LinearGradient colors={['#172832', '#090F17', '#070B12']} style={[styles.screen,
    { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 12), paddingLeft: insets.left, paddingRight: insets.right }]}>
    <UiText style={styles.heading}>{t(content.memory ? 'memoryMode' : 'classicMode')} · Level 1</UiText>
    <View style={[styles.body, landscape && styles.landscape]}>
      <View testID="tutorial-stage" nativeID={`tutorial-beat-${beat.kind}`} accessibilityLabel={description} accessibilityRole="image" style={styles.stage} onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        setStage(old => old.width === width && old.height === height ? old : { width, height });
      }}>
        {scale > 0 && <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: layout.width * scale, height: layout.height * scale }}>
          <View style={StyleSheet.absoluteFill}><StageArt layout={layout} /></View>
          {layout.positions.map((position, i) => <Bottle key={i} index={400 + i} vessel={vessel} position={position}
            colors={picture.board[i]} hiddenLayers={picture.hidden[i]} markedLayers={picture.marked[i]} revealingLayers={picture.reveals[i]} revealProgress={reveal}
            selected={!paused && beat.selected === i} completed={!picture.hidden[i]?.some(Boolean) && !picture.reveals[i]?.some(Boolean) && isBottleComplete(picture.board[i], 4)}
            prepareCompletion={picture.reveals[i]?.some(Boolean) && isBottleComplete(picture.board[i], 4)} hiddenPour={beat.hiddenPour}
            width={100 * scale} scale={scale} plan={pouring ? plan : null} pour={pouring ? artPour : null} progress={progress}
            symbols={symbols} completionEffect="cork" completionScene={`tutorial:${epoch}`} completionAnimations={running && !reduceMotion} />)}
          {pouring && plan && <View style={[StyleSheet.absoluteFill, { zIndex: 11 }]}><PourStream plan={plan} color={beat.pour!.color} progress={progress} hidden={beat.hiddenPour} /></View>}
          {readyShown && <View style={[styles.ready, { left: 135 * scale, top: 414 * scale, width: 130 * scale, height: 46 * scale }]}><Icon name="eye" size={22 * scale} /><UiText style={{ color: '#D9EEE8', fontSize: 14 * scale }}>{t('memoryReady')}</UiText></View>}
          <Animated.View style={[styles.ring, { width: 44 * scale, height: 44 * scale, borderRadius: 22 * scale }, ringStyle]} />
          <Animated.View testID="tutorial-hand" style={[styles.hand, { width: 64 * scale, height: 84 * scale }, handStyle]}>
            <Svg width="100%" height="100%" viewBox="0 0 64 84">
              <Path d="M15 40V10C15 2 25 2 25 10V32C29 28 35 30 35 35C40 30 46 34 45 39C52 37 57 42 55 49L50 68C49 72 46 76 43 78H24C21 72 15 67 11 61L3 47C0 40 7 35 12 41L18 49" fill="#050D18" opacity={.5} transform="translate(2 3)" />
              <Path d="M15 40V10C15 2 25 2 25 10V32C29 28 35 30 35 35C40 30 46 34 45 39C52 37 57 42 55 49L50 68C49 72 46 76 43 78H24C21 72 15 67 11 61L3 47C0 40 7 35 12 41L18 49" fill="#FFF2D8" stroke="#8C7556" strokeWidth={1.5} strokeLinejoin="round" />
              <Path d="M25 32V47M35 35V49M45 39V51M24 68H47" stroke="#C8AF88" strokeWidth={1.5} strokeLinecap="round" />
            </Svg>
          </Animated.View>
          {finished && <View style={styles.success}><Svg width={42} height={42} viewBox="0 0 42 42"><Circle cx={21} cy={21} r={19} fill="#173F36" stroke="#A7E7C9" /><Path d="m11 21 7 7 14-15" fill="none" stroke="#C8FFE4" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /></Svg></View>}
        </View>}
        {running && beat.kind === 'win' && !reduceMotion && <Celebration count={2} width={stage.width} height={stage.height} sound={sound}
          onComplete={() => advance(revision.current)} />}
      </View>
      <View style={[styles.controls, landscape && styles.rail]}>
        <GameButton preferredFocus kind="wide" tone="mint" icon="play" label={t(finished || paused ? 'start' : 'skip')} onPress={onStart} />
        <GameButton kind="wide" icon="reset" label={t('watchAgain')} onPress={replay} />
        {onBack && <GameButton kind="wide" icon="back" label={t('back')} onPress={onBack} />}
      </View>
    </View>
    <PourSound progress={progress} pouring={pouring} vessel={vessel.id} receiverLayers={beat.pour ? beat.picture.board[beat.pour.target].length - beat.pour.amount : 0}
      enabled={sound && running && !reduceMotion} />
  </LinearGradient>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  heading: { textAlign: 'center', color: '#D2DFDF', fontSize: 17, marginBottom: 4 },
  body: { flex: 1, minHeight: 0 }, landscape: { flexDirection: 'row', alignItems: 'center' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', alignSelf: 'stretch', minHeight: 0 },
  controls: { gap: 8, paddingHorizontal: 20, alignSelf: 'center', width: '100%', maxWidth: 420 },
  rail: { width: 220, paddingHorizontal: 14 },
  ready: { position: 'absolute', borderRadius: 16, borderWidth: 1, borderColor: '#9AD7BE66', backgroundColor: '#1D3938', flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  hand: { position: 'absolute', left: 0, top: 0, zIndex: 20 },
  ring: { position: 'absolute', left: 0, top: 0, zIndex: 19, borderWidth: 2, borderColor: '#FFE5AB', backgroundColor: '#FFDE941C' },
  success: { position: 'absolute', bottom: 0, alignSelf: 'center' },
});
