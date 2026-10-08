import { forwardRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

/** Keyboard/remote focus is separate from a selected source bottle. */
export const FocusablePressable = forwardRef<View, PressableProps & { focusIndicatorStyle?: StyleProp<ViewStyle> }>(function FocusablePressable({ style, onFocus, onBlur, children, focusIndicatorStyle, ...props }, ref) {
  const [focused, setFocused] = useState(false);
  const showFocus = focused && !props.disabled && (Platform.isTV || Platform.OS === 'web');
  return <Pressable {...props} ref={ref}
    onFocus={event => { setFocused(true); onFocus?.(event); }}
    onBlur={event => { setFocused(false); onBlur?.(event); }}
    style={state => [typeof style === 'function' ? style(state) : style,
      showFocus && !focusIndicatorStyle && styles.focus]}>
    {state => <>{typeof children === 'function' ? children(state) : children}
      {showFocus && focusIndicatorStyle && <View pointerEvents="none" style={[styles.focus, styles.insetFocus, focusIndicatorStyle]} />}</>}
  </Pressable>;
});

const styles = StyleSheet.create({
  focus: { outlineColor: '#F7D88D', outlineWidth: 3, outlineStyle: 'solid', outlineOffset: 2, backgroundColor: '#F7D88D18' },
  insetFocus: { outlineWidth: 0, borderWidth: 2, borderColor: '#F7D88D', backgroundColor: 'transparent' },
});
