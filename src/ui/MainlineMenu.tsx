import { UiText, useI18n } from '../i18n/I18n';
import { useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MainlineState } from '../game/mainline';
import { INTERNAL_TOOLS } from './buildConfig';
import { GameButton } from './GameButton';
import { Icon } from './Icon';

const NUMBERS = Array.from({ length: 1000 }, (_, i) => i + 1);
type Props = { visible: boolean; initialSection: 'levels' | 'settings'; play: MainlineState; saveStatus: string; onClose: () => void; onResume: () => void; onSelect: (number: number) => void; onSamples: () => void; onSymbols: () => void; symbols: boolean; completionName: string; onLanguage: () => void; onCompletionEffects: () => void; onDebug?: () => void };
export function MainlineMenu({ visible, initialSection, play, saveStatus, onClose, onResume, onSelect, onSamples, onSymbols, symbols, completionName, onLanguage, onCompletionEffects, onDebug }: Props) {
  const { t, rtl, languageName } = useI18n();
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState(initialSection);
  const [toolsVisible, setToolsVisible] = useState(false);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={[styles.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <LinearGradient colors={['#203745', '#102230']} style={styles.panel}>
        <View style={[styles.heading, rtl && styles.reverse]}><UiText style={styles.title}>{t(section)}</UiText><GameButton kind="icon" icon="close" label={t('close')} onPress={onClose} /></View>
        <View style={[styles.tabs, rtl && styles.reverse]}>{(['levels', 'settings'] as const).map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: section === tab }} onPress={() => setSection(tab)} style={[styles.tab, section === tab && styles.activeTab]}><UiText style={[styles.tabText, section === tab && styles.activeTabText]}>{t(tab)}</UiText></Pressable>)}</View>
        {section === 'levels' ? <>
          <View style={[styles.progressHeading, rtl && styles.reverse]}><UiText style={styles.progressText}>{t('completedCount', { n: play.completedThrough })}</UiText><UiText style={styles.note}>{t('totalLevels')}</UiText></View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${play.completedThrough / 10}%` }]} /></View>
          <GameButton kind="wide" tone="mint" icon="play" label={t('continueLevel', { n: play.current })} onPress={onResume} style={styles.resume} />
          <UiText style={styles.help}>{t('replayNote')}</UiText>
          <FlatList data={NUMBERS} numColumns={5} keyExtractor={number => String(number)} initialScrollIndex={Math.floor((play.current - 1) / 5)}
            getItemLayout={(_, index) => ({ length: 60, offset: 60 * index, index })} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={5}
            style={styles.list} renderItem={({ item: number }) => {
              const unlocked = number <= play.completedThrough || number === play.current;
              return <Pressable accessibilityRole="button" accessibilityLabel={t('levelState', { n: number, state: t(unlocked ? number <= play.completedThrough ? 'completed' : 'current' : 'locked') })}
                accessibilityState={{ disabled: !unlocked, selected: number === play.current }} disabled={!unlocked} onPress={() => onSelect(number)}
                style={({ pressed }) => [styles.cell, number === play.current && styles.selected, !unlocked && styles.locked, pressed && styles.pressed]}>
                {unlocked ? <><UiText style={[styles.number, number % 10 === 0 && styles.challenge]}>{number}</UiText><UiText style={styles.mark}>{number <= play.completedThrough ? '✓' : '·'}</UiText></> : <><UiText style={styles.lockedNumber}>{number}</UiText><Icon name="lock" size={10} color="#7B919F" /></>}
              </Pressable>;
            }} />
        </> : <ScrollView style={styles.settings} contentContainerStyle={styles.settingsContent}>
          <View style={styles.settingsHero}><Icon name="spark" color="#DEC797" size={22} /><UiText style={styles.settingsBrand}>BOTTLE HARMONY</UiText></View>
          <Pressable accessibilityRole="button" onPress={onLanguage} style={[styles.settingRow, rtl && styles.reverse]}><View style={styles.settingCopy}><UiText style={styles.settingTitle}>{t('language')}</UiText></View><UiText style={styles.settingValue}>{languageName} ›</UiText></Pressable>
          <Pressable accessibilityRole="button" onPress={onCompletionEffects} style={[styles.settingRow, rtl && styles.reverse]}><View style={styles.settingCopy}><UiText style={styles.settingTitle}>{t('effects')}</UiText></View><UiText style={styles.settingValue}>{completionName} ›</UiText></Pressable>
          <Pressable accessibilityRole="switch" accessibilityLabel={t('symbols')} accessibilityState={{ checked: symbols }} onPress={onSymbols} style={[styles.settingRow, rtl && styles.reverse]}><View style={styles.settingCopy}><UiText style={styles.settingTitle}>{t('symbols')}</UiText><UiText style={styles.settingNote}>{t('symbolsNote')}</UiText></View><View style={[styles.toggle, symbols && styles.toggleOn]}><View style={[styles.toggleThumb, symbols && styles.toggleThumbOn]} /></View></Pressable>
          <UiText style={styles.saveStatus}>{saveStatus}</UiText>
          {INTERNAL_TOOLS && <View style={styles.tools}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: toolsVisible }} onPress={() => setToolsVisible(value => !value)} style={styles.toolsButton}><UiText style={styles.note}>开发工具 {toolsVisible ? '⌃' : '⌄'}</UiText></Pressable>
            {toolsVisible && <><Pressable accessibilityRole="button" onPress={onDebug} style={styles.toolsButton}><UiText style={styles.toolText}>当前关卡诊断 ›</UiText></Pressable><Pressable accessibilityRole="button" onPress={onSamples} style={styles.toolsButton}><UiText style={styles.toolText}>内部对照题 ›</UiText></Pressable></>}
          </View>}
        </ScrollView>}
        <UiText style={styles.brand}>BOTTLE HARMONY</UiText>
      </LinearGradient>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#050E19CC', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  panel: { width: '100%', maxWidth: 520, height: '85%', borderRadius: 28, borderWidth: 1, borderColor: '#C7AD7866', padding: 16 },
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
  help: { color: '#9AAFBA', fontSize: 11, marginTop: 14, marginBottom: 8 },
  list: { flex: 1 },
  cell: { flex: 1, height: 52, margin: 4, borderWidth: 1, borderColor: '#A7BCC144', borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#263E4D' },
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
