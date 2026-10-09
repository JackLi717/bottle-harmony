import { FocusablePressable as Pressable } from './FocusablePressable';
import { UiText, useI18n } from '../i18n/I18n';
import { useRef, useState } from 'react';
import { FlatList, Keyboard, Modal, Platform, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MainlineState } from '../game/mainline';
import { INTERNAL_TOOLS } from './buildConfig';
import { GameButton } from './GameButton';
import { Icon } from './Icon';
import { MAINLINE } from './mainlineContent';
import { SOLID_SIDES } from './solidSideContent';

const NUMBERS = Array.from({ length: 1000 }, (_, i) => i + 1);
type Props = { visible: boolean; initialSection: 'levels' | 'settings'; showLevels: boolean; play: MainlineState; saveStatus: string; onClose: () => void; onResume: () => void; onSelect: (number: number) => void; onSelectSide: (number: number) => void; onPreview: (number: number) => void; onSidePreview: (number: number) => void; onSamples: () => void; onSymbols: () => void; symbols: boolean; sound: boolean; soundSaved: boolean; onSound: () => void; onCelebrationPreview: (count: 2 | 3 | 4 | 5) => void; onDebug?: () => void; onPrivacy: () => void };
export function MainlineMenu({ visible, initialSection, showLevels, play, saveStatus, onClose, onResume, onSelect, onSelectSide, onPreview, onSidePreview, onSamples, onSymbols, symbols, sound, soundSaved, onSound, onCelebrationPreview, onDebug, onPrivacy }: Props) {
  const { t, rtl } = useI18n();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [section, setSection] = useState(showLevels ? initialSection : 'settings');
  const [toolsVisible, setToolsVisible] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testGroup, setTestGroup] = useState<'main' | 'side'>('main');
  const [jumpText, setJumpText] = useState('');
  const [listHeight, setListHeight] = useState(0);
  // The TV runtime wraps FlatList in a focus guide without flex sizing.
  const listStyle = Platform.isTV ? { height: listHeight, flexGrow: 0, flexShrink: 0 } : styles.list;
  const mainList = useRef<FlatList<number>>(null);
  function jumpToLevel() {
    const number = Number(jumpText);
    if (!Number.isInteger(number) || number < 1 || number > 1000) return;
    mainList.current?.scrollToIndex({ index: Math.floor((number - 1) / 5), animated: false });
    Keyboard.dismiss();
  }
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={[styles.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <LinearGradient colors={['#203745', '#102230']} style={styles.panel}>
        <View style={[styles.heading, rtl && styles.reverse]}><UiText style={styles.title}>{t(section)}</UiText><GameButton kind="icon" icon="close" label={t('close')} onPress={onClose} /></View>
        {showLevels && <View style={[styles.tabs, rtl && styles.reverse]}>{(['levels', 'settings'] as const).map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: section === tab }} onPress={() => setSection(tab)} style={[styles.tab, section === tab && styles.activeTab]}><UiText style={[styles.tabText, section === tab && styles.activeTabText]}>{t(tab)}</UiText></Pressable>)}</View>}
        {section === 'levels' ? <>
          <ScrollView keyboardShouldPersistTaps="handled" style={[styles.levelControls, { maxHeight: Math.max(80, Math.min(260, height * .28)) }]}>
          <View style={[styles.progressHeading, rtl && styles.reverse]}><UiText style={styles.progressText}>{t('completedCount', { n: play.completedThrough })}</UiText><UiText style={styles.note}>{t('totalLevels')}</UiText></View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${play.completedThrough / 10}%` }]} /></View>
          <GameButton kind="wide" tone="mint" icon="play" label={play.side ? t('solidSideLabel', { n: play.current / 20 }) : t('continueLevel', { n: play.current })} onPress={onResume} style={styles.resume} />
          {INTERNAL_TOOLS && <Pressable accessibilityRole="button" accessibilityState={{ expanded: testing }} onPress={() => setTesting(value => !value)} style={styles.testToggle}>
            <UiText style={styles.testToggleText}>{testing ? '关闭难度试玩' : '难度试玩 · 任意选关'} {testing ? '⌃' : '⌄'}</UiText>
          </Pressable>}
          <UiText style={styles.help}>{testing ? '预览不解锁关卡、不改动正在玩的局面；主线分数是制作代理分，副关显示首步风险。' : t('replayNote')}</UiText>
          {testing && <View style={styles.testTabs}>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: testGroup === 'main' }} onPress={() => setTestGroup('main')} style={[styles.testTab, testGroup === 'main' && styles.activeTab]}><UiText style={styles.testToggleText}>主线 · 1000</UiText></Pressable>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: testGroup === 'side' }} onPress={() => setTestGroup('side')} style={[styles.testTab, testGroup === 'side' && styles.activeTab]}><UiText style={styles.testToggleText}>副关 · 50</UiText></Pressable>
          </View>}
          {testing && testGroup === 'main' && <View style={styles.jumpRow}>
            <TextInput accessibilityLabel="跳转关号" keyboardType="number-pad" returnKeyType="go" value={jumpText} onChangeText={setJumpText}
              onSubmitEditing={jumpToLevel} placeholder="输入 1–1000 关" placeholderTextColor="#7F9CA6" style={styles.jumpInput} />
            <Pressable accessibilityRole="button" accessibilityLabel="跳转到关号" onPress={jumpToLevel} style={styles.jumpButton}><UiText style={styles.testToggleText}>跳转</UiText></Pressable>
          </View>}
          </ScrollView>
          {!testing && play.sideCompletedThrough > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sideList} contentContainerStyle={styles.sideListContent}>
            {Array.from({ length: play.sideCompletedThrough }, (_, index) => index + 1).map(number => <Pressable key={number} accessibilityRole="button"
              accessibilityLabel={t('solidSideLabel', { n: number })} onPress={() => onSelectSide(number)} style={styles.sideCell}>
              <UiText style={styles.sideText}>{t('solidSideLabel', { n: number })}</UiText>
            </Pressable>)}
          </ScrollView>}
          <View style={styles.list} onLayout={event => setListHeight(event.nativeEvent.layout.height)}>
          {testing && testGroup === 'side' ? <FlatList key="side-test" data={SOLID_SIDES.entries} numColumns={2} keyExtractor={item => String(item.number)}
            getItemLayout={(_, index) => ({ length: 98, offset: 98 * index, index })} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={5}
            style={listStyle} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`试玩副关卡 ${item.number}，凝固最短 ${item.difficulty.frozenMoves} 步，首步死路 ${item.difficulty.frozenFirstChoices.dead}/${item.difficulty.frozenFirstChoices.choices}`}
              onPress={() => onSidePreview(item.number)} style={({ pressed }) => [styles.sideTestCell, pressed && styles.pressed]}>
              <UiText style={styles.number}>副 {item.number}</UiText>
              <UiText style={styles.testDetail}>{item.level.colors.length} 色 · 最短 {item.difficulty.frozenMoves} 步</UiText>
              <UiText style={styles.testDetail}>首步死路 {item.difficulty.frozenFirstChoices.dead}/{item.difficulty.frozenFirstChoices.choices}</UiText>
            </Pressable>} /> : <FlatList key="mainline-grid" ref={mainList} data={NUMBERS} numColumns={5} keyExtractor={number => String(number)} initialScrollIndex={Math.floor((play.current - 1) / 5)}
            getItemLayout={(_, index) => ({ length: 68, offset: 68 * index, index })} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={5}
            style={listStyle} renderItem={({ item: number }) => {
              const unlocked = number <= play.completedThrough || number === play.current;
              const rating = MAINLINE.entries[number - 1];
              return <Pressable accessibilityRole="button" accessibilityLabel={testing ? `试玩第 ${number} 关，${rating.tier}，${rating.score} 分` : t('levelState', { n: number, state: t(unlocked ? number <= play.completedThrough ? 'completed' : 'current' : 'locked') })}
                accessibilityState={{ disabled: !testing && !unlocked, selected: !testing && number === play.current }} disabled={!testing && !unlocked} onPress={() => testing ? onPreview(number) : onSelect(number)}
                style={({ pressed }) => [styles.cell, number === play.current && !testing && styles.selected, !unlocked && !testing && styles.locked, pressed && styles.pressed]}>
                <UiText style={[styles.number, !unlocked && !testing && styles.lockedNumber, number % 10 === 0 && styles.challenge]}>{number}</UiText>
                {INTERNAL_TOOLS && <UiText style={styles.testScore}>{rating.tier} · {rating.score}</UiText>}
                {!testing && (unlocked ? <UiText style={styles.mark}>{number <= play.completedThrough ? '✓' : '·'}</UiText> : <Icon name="lock" size={10} color="#7B919F" />)}
              </Pressable>;
            }} />}
          </View>
        </> : <ScrollView style={styles.settings} contentContainerStyle={styles.settingsContent}>
          <View style={styles.settingsHero}><Icon name="spark" color="#DEC797" size={22} /><UiText style={styles.settingsBrand}>BOTTLE HARMONY</UiText></View>
          <Pressable accessibilityRole="switch" accessibilityLabel={t('sound')} accessibilityState={{ checked: sound }} onPress={onSound} style={[styles.settingRow, rtl && styles.reverse]}><View style={styles.settingCopy}><UiText style={styles.settingTitle}>{t('sound')}</UiText><UiText style={styles.settingNote}>{t(soundSaved ? 'soundNote' : 'saveFailed')}</UiText></View><View style={[styles.toggle, sound && styles.toggleOn]}><View style={[styles.toggleThumb, sound && styles.toggleThumbOn]} /></View></Pressable>
          <Pressable accessibilityRole="switch" accessibilityLabel={t('symbols')} accessibilityState={{ checked: symbols }} onPress={onSymbols} style={[styles.settingRow, rtl && styles.reverse]}><View style={styles.settingCopy}><UiText style={styles.settingTitle}>{t('symbols')}</UiText><UiText style={styles.settingNote}>{t('symbolsNote')}</UiText></View><View style={[styles.toggle, symbols && styles.toggleOn]}><View style={[styles.toggleThumb, symbols && styles.toggleThumbOn]} /></View></Pressable>
          <Pressable accessibilityRole="button" onPress={onPrivacy} style={[styles.settingRow, rtl && styles.reverse]}><UiText style={styles.settingTitle}>{t('privacyPolicy')}</UiText><UiText style={styles.settingValue}>›</UiText></Pressable>
          <UiText style={styles.saveStatus}>{saveStatus}</UiText>
          {INTERNAL_TOOLS && <View style={styles.tools}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: toolsVisible }} onPress={() => setToolsVisible(value => !value)} style={styles.toolsButton}><UiText style={styles.note}>开发工具 {toolsVisible ? '⌃' : '⌄'}</UiText></Pressable>
            {toolsVisible && <>{onDebug && <Pressable accessibilityRole="button" onPress={onDebug} style={styles.toolsButton}><UiText style={styles.toolText}>当前关卡诊断 ›</UiText></Pressable>}<Pressable accessibilityRole="button" onPress={onSamples} style={styles.toolsButton}><UiText style={styles.toolText}>内部对照题 ›</UiText></Pressable>{([2, 3, 4, 5] as const).map(count => <Pressable key={count} accessibilityRole="button" onPress={() => onCelebrationPreview(count)} style={styles.toolsButton}><UiText style={styles.toolText}>{t('fireworksPreview')} · D{count - 1} ›</UiText></Pressable>)}</>}
          </View>}
        </ScrollView>}
        <UiText style={styles.brand}>BOTTLE HARMONY</UiText>
      </LinearGradient>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#050E19CC', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  panel: { width: '100%', maxWidth: Platform.isTV ? 760 : 520, height: '85%', borderRadius: 28, borderWidth: 1, borderColor: '#C7AD7866', padding: 16 },
  levelControls: { flexGrow: 0, flexShrink: 0 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reverse: { flexDirection: 'row-reverse' },
  title: { flex: 1, color: '#EBD8AD', fontSize: 22, fontWeight: '600' },
  tabs: { flexDirection: 'row', backgroundColor: '#0E202D', borderRadius: 15, padding: 4, marginVertical: 14 },
  tab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  activeTab: { backgroundColor: '#31505D' },
  tabText: { color: '#9AAFBA', fontSize: 14, fontWeight: '500' },
  activeTabText: { color: '#EBD8AD' },
  progressHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressText: { color: '#BDCDD3', fontSize: 13, fontWeight: '600' },
  gold: { color: '#DEC797' },
  note: { color: '#9AAFBA', fontSize: 12 },
  progressTrack: { height: 7, backgroundColor: '#0E202D', borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  progressFill: { height: '100%', backgroundColor: '#BCA36F', borderRadius: 4 },
  resume: { marginTop: 14 },
  help: { color: '#9AAFBA', fontSize: 11, marginTop: 10, marginBottom: 8 },
  testToggle: { minHeight: 42, marginTop: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#91C9BA66', backgroundColor: '#1B3A40', justifyContent: 'center' },
  testToggleText: { color: '#CDEDE2', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  testTabs: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  testTab: { flex: 1, minHeight: 38, justifyContent: 'center', borderRadius: 10, backgroundColor: '#17313C' },
  jumpRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  jumpInput: { flex: 1, minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: '#91C9BA66', backgroundColor: '#102A35', color: '#EBD8AD', paddingHorizontal: 12, fontSize: 13 },
  jumpButton: { width: 70, minHeight: 40, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#91C9BA66', backgroundColor: '#1B3A40' },
  testScore: { color: '#A9CFCA', fontSize: 10, marginTop: 2 },
  testDetail: { color: '#A9CFCA', fontSize: 10, marginTop: 3 },
  sideTestCell: { flex: 1, height: 90, margin: 4, borderWidth: 1, borderColor: '#91C9BA66', borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#233F49' },
  sideList: { flexGrow: 0, maxHeight: 42, marginBottom: 6 },
  sideListContent: { gap: 6, alignItems: 'center' },
  sideCell: { minHeight: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#A7BCC166', backgroundColor: '#263E4D', justifyContent: 'center' },
  sideText: { color: '#EBD8AD', fontSize: 11 },
  list: { flex: 1 },
  cell: { flex: 1, height: 60, margin: 4, borderWidth: 1, borderColor: '#A7BCC144', borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#263E4D' },
  selected: { borderColor: '#DEC797', backgroundColor: '#32515B' },
  locked: { backgroundColor: '#142A37', borderColor: '#60798744' },
  number: { color: '#EBD8AD', fontSize: 17, fontWeight: '600' },
  mark: { color: '#ABDAC9', fontSize: 9 },
  challenge: { color: '#DEC797' },
  lockedNumber: { color: '#7B919F', fontSize: 14, marginBottom: 3 },
  pressed: { transform: [{ translateY: 2 }] },
  settings: { flex: 1 },
  settingsContent: { paddingBottom: 12 },
  settingsHero: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, paddingVertical: 14 },
  settingsBrand: { color: '#C7AD78', fontSize: 10, letterSpacing: 2 },
  settingCopy: { flex: 1 },
  settingRow: { minHeight: 76, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#0E202D66', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 9 },
  settingTitle: { color: '#D7E3E7', fontSize: 15, fontWeight: '500' },
  settingNote: { color: '#9AAFBA', fontSize: 11, marginTop: 6 },
  settingValue: { flexShrink: 1, maxWidth: '44%', color: '#DEC797', fontSize: 13, fontWeight: '500' },
  toggle: { width: 44, height: 26, borderRadius: 13, backgroundColor: '#535064', justifyContent: 'center', padding: 3 },
  toggleOn: { backgroundColor: '#319E89' },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#E8DDED' },
  toggleThumbOn: { alignSelf: 'flex-end', backgroundColor: '#E2FFE9' },
  saveStatus: { color: '#9AAFBA', fontSize: 11, textAlign: 'center', marginVertical: 18 },
  tools: { borderTopWidth: 1, borderTopColor: '#C7AD7833' },
  toolsButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  toolText: { color: '#9AAFBA', fontSize: 12 },
  brand: { textAlign: 'center', fontSize: 9, letterSpacing: 3, color: '#7B919F', paddingTop: 12 },
});
