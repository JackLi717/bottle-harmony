import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LANGUAGES, localizedLanguageName } from '../i18n/messages';
import { UiText, useI18n } from '../i18n/I18n';
import { GameButton } from './GameButton';

export function LanguagePicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t, rtl, language, preference, setPreference, saved } = useI18n();
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={[styles.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}><View style={styles.panel}>
      <View style={[styles.heading, rtl && styles.reverse]}><UiText style={styles.title}>{t('language')}</UiText><GameButton kind="icon" icon="close" label={t('close')} onPress={onClose} /></View>
      <UiText style={styles.note}>{t('languageNote')}</UiText>
      {!saved && <UiText style={styles.note}>{t('saveFailed')}</UiText>}
      <Pressable accessibilityRole="radio" accessibilityLabel={t('system')} accessibilityState={{ checked: preference === 'system' }} onPress={() => setPreference('system')} style={[styles.option, rtl && styles.reverse, preference === 'system' && styles.selected]}><UiText style={styles.label}>{t('system')}</UiText><UiText style={styles.check}>{preference === 'system' ? '✓' : ''}</UiText></Pressable>
      <ScrollView>{LANGUAGES.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={`${item.name}, ${localizedLanguageName(item.id, language)}`} accessibilityState={{ checked: preference === item.id }} onPress={() => setPreference(item.id)} style={[styles.option, rtl && styles.reverse, preference === item.id && styles.selected]}>
        <View style={styles.copy}><UiText style={[styles.label, { writingDirection: item.id === 'ar' ? 'rtl' : 'ltr' }]}>{item.name}</UiText><UiText style={styles.translation}>{localizedLanguageName(item.id, language)}</UiText></View><UiText style={styles.check}>{preference === item.id ? '✓' : ''}</UiText>
      </Pressable>)}</ScrollView>
    </View></View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#050E19CC', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  panel: { width: '100%', maxWidth: 480, maxHeight: '85%', backgroundColor: '#172B38', borderRadius: 22, borderWidth: 1, borderColor: '#C7AD7866', padding: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reverse: { flexDirection: 'row-reverse' },
  title: { flex: 1, color: '#EBD8AD', fontSize: 22, fontWeight: '600' },
  note: { color: '#9AAFBA', fontSize: 12, marginVertical: 10 },
  option: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', borderRadius: 10, marginBottom: 3 },
  selected: { backgroundColor: '#C7AD7815' },
  copy: { flex: 1 },
  label: { flex: 1, color: '#D7E3E7', fontSize: 15 },
  translation: { color: '#9AAFBA', fontSize: 12, marginTop: 4 },
  check: { color: '#E7CE98', width: 25, textAlign: 'center' },
});
