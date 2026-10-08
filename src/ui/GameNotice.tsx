import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UiText, useI18n } from '../i18n/I18n';
import { GameButton } from './GameButton';

/** Native Alert is unavailable in react-native-web. Keep hint feedback accessible everywhere. */
export function GameNotice({ notice, onClose }: { notice: { title: string; message: string } | null; onClose: () => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return <Modal visible={!!notice} transparent animationType="fade" onRequestClose={onClose}>
    <View style={[styles.backdrop, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}><View style={styles.panel}>
      <ScrollView><UiText accessibilityRole="header" style={styles.title}>{notice?.title}</UiText><UiText style={styles.message}>{notice?.message}</UiText></ScrollView>
      <GameButton kind="wide" icon="close" label={t('close')} onPress={onClose} />
    </View></View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050E19CC' },
  panel: { width: '100%', maxWidth: 560, maxHeight: '100%', padding: 24, borderRadius: 24, backgroundColor: '#172B38' },
  title: { color: '#EBD8AD', fontSize: 22 },
  message: { color: '#BDCDD3', fontSize: 16, lineHeight: 24, marginVertical: 20 },
});
