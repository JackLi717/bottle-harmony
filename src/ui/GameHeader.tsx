import { UiText, useI18n } from '../i18n/I18n';
import { StyleSheet, View } from 'react-native';
import { GameButton } from './GameButton';

type Props = { label: string; disabled: boolean; compact: boolean; onBack: () => void };
export function GameHeader({ label, disabled, compact, onBack }: Props) {
  const { t, rtl } = useI18n();
  return <View style={[styles.header, compact && styles.compact, rtl && styles.reverse]}>
    <View style={rtl && styles.mirror}><GameButton kind="icon" icon="back" label={t('back')} onPress={onBack} disabled={disabled} /></View>
    <UiText numberOfLines={1} adjustsFontSizeToFit style={styles.level}>{label}</UiText>
    <View style={styles.spacer} />
  </View>;
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: 12, paddingBottom: 8 },
  compact: { paddingBottom: 3 },
  reverse: { flexDirection: 'row-reverse' },
  mirror: { transform: [{ scaleX: -1 }] },
  spacer: { width: 46 },
  level: { flex: 1, fontSize: 24, fontWeight: '500', color: '#EBD8AD', letterSpacing: 1, textAlign: 'center', writingDirection: 'ltr' },
});
