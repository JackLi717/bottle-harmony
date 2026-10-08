import { Platform, ScrollView, TVTextScrollView, type ScrollViewProps } from 'react-native';

/** Text-only pages need a remote-scrollable target on tvOS. */
export function ReadableScrollView(props: Omit<ScrollViewProps, 'onFocus' | 'onBlur'>) {
  return Platform.isTV ? <TVTextScrollView {...props} /> : <ScrollView {...props} />;
}
