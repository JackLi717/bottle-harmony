import { ReadableScrollView as ScrollView } from './ReadableScrollView';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UiText, useI18n } from '../i18n/I18n';
import policy from '../config/privacy.json';
import publishing from '../config/publishing.json';
import { GameButton } from './GameButton';

export function PrivacyPolicy({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const copy = policy.en;
  return <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.heading}><UiText style={styles.title}>Privacy Policy</UiText><GameButton kind="icon" icon="close" label={t('close')} onPress={onClose} /></View>
      <ScrollView contentContainerStyle={styles.copy}>
        <UiText style={styles.note}>{publishing.name} · {publishing.developer} · {publishing.policyDate}</UiText>
        <UiText style={styles.body}>{copy.introduction}</UiText>
        {copy.sections.map(section => <View key={section.title}><UiText style={styles.section}>{section.title}</UiText><UiText style={styles.body}>{section.body}</UiText></View>)}
        <UiText selectable style={styles.contact}>{publishing.supportEmail}</UiText>
        <UiText selectable style={styles.note}>{publishing.privacyUrl}</UiText>
      </ScrollView>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B1B2F', paddingHorizontal: 20 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, fontSize: 22, color: '#EBD8AD', fontWeight: '600' },
  copy: { paddingVertical: 20, gap: 16, width: '100%', maxWidth: 680, alignSelf: 'center' },
  section: { fontSize: 17, lineHeight: 25, color: '#EBD8AD', fontWeight: '600', marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 24, color: '#D7E3E7' },
  note: { fontSize: 12, lineHeight: 20, color: '#9AAFBA' },
  contact: { fontSize: 15, lineHeight: 24, color: '#CDEDE2' },
});
