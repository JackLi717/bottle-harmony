import { FocusablePressable as Pressable } from './FocusablePressable';
import { useRef, useState } from 'react';
import { FlatList, Platform, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Bottle } from '../art/Bottle';
import { VESSELS, type VesselDesign, type VesselId } from '../art/vesselDesigns';
import { UiText, useI18n } from '../i18n/I18n';
import { Icon } from './Icon';

type Props = { vessel: VesselDesign; compact: boolean; saved: boolean; reduceMotion: boolean; onSelect: (id: VesselId) => void };
/** The centered style is selected. A bounded list keeps offscreen SVGs unmounted. */
export function VesselCarousel({ vessel, compact, saved, reduceMotion, onSelect }: Props) {
  const { t } = useI18n();
  const [width, setWidth] = useState(0);
  const list = useRef<FlatList<VesselDesign>>(null);
  const progress = useSharedValue(1);
  const choiceHint = Platform.isTV || Platform.OS === 'web' ? 'chooseStylesWithButtons' : 'swipeStyles';
  const index = VESSELS.findIndex(item => item.id === vessel.id);
  const scale = compact ? .75 : 1;
  function move(delta: number) {
    const next = Math.max(0, Math.min(VESSELS.length - 1, index + delta));
    onSelect(VESSELS[next].id);
    list.current?.scrollToIndex({ index: next, animated: !reduceMotion });
  }
  return <View style={[styles.carousel, { marginVertical: compact ? 10 : 18 }]} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <View accessible accessibilityRole="adjustable" accessibilityLabel={t('styleChoice', { name: t(vessel.name), n: index + 1, total: VESSELS.length })}
      accessibilityHint={t(choiceHint)} accessibilityActions={[{ name: 'increment', label: t('nextStyle') }, { name: 'decrement', label: t('previousStyle') }]}
      onAccessibilityAction={event => {
        if (event.nativeEvent.actionName === 'increment') move(1);
        else if (event.nativeEvent.actionName === 'decrement') move(-1);
      }}>
      {width > 0 && <FlatList key={width} ref={list} data={VESSELS} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        importantForAccessibility="no-hide-descendants" initialScrollIndex={index}
        initialNumToRender={1} maxToRenderPerBatch={2} windowSize={3} keyExtractor={item => item.id}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={event => {
          const next = Math.max(0, Math.min(VESSELS.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)));
          onSelect(VESSELS[next].id);
        }}
        renderItem={({ item, index: itemIndex }) => <View style={{ width, height: 185 * scale, alignItems: 'center' }}>
          <View pointerEvents="none" style={{ width: 220 * scale, height: 185 * scale }}>
            <Bottle index={600 + itemIndex * 2} vessel={item} colors={['jade', 'amber', 'coral', 'azure']} completed={false} selected={false}
              width={100 * scale} scale={scale} position={{ x: 0, y: 0 }} plan={null} pour={null} progress={progress} completionAnimations={false} />
            <Bottle index={601 + itemIndex * 2} vessel={item} colors={['jade', 'jade', 'jade', 'jade']} completed selected={false}
              width={100 * scale} scale={scale} position={{ x: 120, y: 0 }} plan={null} pour={null} progress={progress} completionEffect="cork" completionAnimations={false} />
          </View>
        </View>} />}
    </View>
    <View style={styles.selector}>
      <Pressable onPress={() => move(-1)} disabled={index === 0} accessibilityRole="button" accessibilityLabel={t('previousStyle')} accessibilityState={{ disabled: index === 0 }}
        style={({ pressed }) => [styles.arrow, index === 0 && styles.disabled, pressed && styles.pressed]}><Icon name="back" size={18} color="#BBCDD3" /></Pressable>
      <View style={styles.caption}>
        <UiText accessibilityLiveRegion="polite" numberOfLines={1} adjustsFontSizeToFit style={styles.name}>{t(vessel.name)}</UiText>
        <UiText style={styles.count}>{index + 1} / {VESSELS.length}</UiText>
      </View>
      <Pressable onPress={() => move(1)} disabled={index === VESSELS.length - 1} accessibilityRole="button" accessibilityLabel={t('nextStyle')} accessibilityState={{ disabled: index === VESSELS.length - 1 }}
        style={({ pressed }) => [styles.arrow, index === VESSELS.length - 1 && styles.disabled, pressed && styles.pressed]}><View style={styles.flip}><Icon name="back" size={18} color="#BBCDD3" /></View></Pressable>
    </View>
    {!saved && <UiText style={styles.hint}>{t('saveFailed')}</UiText>}
  </View>;
}
const styles = StyleSheet.create({
  carousel: { width: '100%', maxWidth: 360 },
  selector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  arrow: { width: Platform.isTV ? 62 : 44, height: Platform.isTV ? 62 : 44, alignItems: 'center', justifyContent: 'center' },
  flip: { transform: [{ rotate: '180deg' }] },
  caption: { flex: 1, maxWidth: 210, alignItems: 'center' },
  name: { color: '#DECBA4', fontSize: 15, textAlign: 'center' },
  count: { color: '#8A9EA8', fontSize: 10, marginTop: 3, writingDirection: 'ltr' },
  hint: { color: '#879CA6', fontSize: 10, textAlign: 'center', marginTop: 2 },
  disabled: { opacity: .25 },
  pressed: { opacity: .5 },
});
