import { UiText, useI18n } from '../i18n/I18n';
import { StyleSheet, View } from 'react-native';
import { GameButton } from './GameButton';

type PreviewNavigation = { detail: string; previous: boolean; next: boolean; onPrevious: () => void; onNext: () => void };
type Props = { label: string; disabled: boolean; compact: boolean; onBack: () => void; previewNavigation?: PreviewNavigation };
export function GameHeader({ label, disabled, compact, onBack, previewNavigation }: Props) {
  const { t, rtl } = useI18n();
  return <View style={[styles.header, compact && styles.compact, rtl && styles.reverse]}>
    <View style={rtl && styles.mirror}><GameButton kind="icon" icon="back" label={t('back')} onPress={onBack} disabled={disabled} /></View>
    {previewNavigation && <GameButton kind="icon" icon="previous" label="上一关" disabled={disabled || !previewNavigation.previous} onPress={previewNavigation.onPrevious} style={styles.previewButton} />}
    <View style={styles.titleGroup}>
      <UiText numberOfLines={1} adjustsFontSizeToFit style={[styles.level, previewNavigation && styles.previewLevel]}>{label}</UiText>
      {previewNavigation && <UiText numberOfLines={1} adjustsFontSizeToFit style={styles.detail}>{previewNavigation.detail}</UiText>}
    </View>
    {previewNavigation ? <GameButton kind="icon" icon="next" label="下一关" disabled={disabled || !previewNavigation.next} onPress={previewNavigation.onNext} style={styles.previewButton} /> : <View style={styles.spacer} />}
  </View>;
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: 8, paddingBottom: 8 },
  compact: { paddingBottom: 3 },
  reverse: { flexDirection: 'row-reverse' },
  mirror: { transform: [{ scaleX: -1 }] },
  spacer: { width: 46 },
  titleGroup: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  level: { fontSize: 24, fontWeight: '500', color: '#EBD8AD', letterSpacing: 1, textAlign: 'center', writingDirection: 'ltr' },
  previewLevel: { fontSize: 20 },
  detail: { fontSize: 10, color: '#A9C3C7', textAlign: 'center', writingDirection: 'ltr' },
  previewButton: { width: 42, height: 42 },
});
