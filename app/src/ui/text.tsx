import { Text as NativeText, TextInput as NativeTextInput, StyleSheet, type TextProps, type TextInputProps, type TextStyle, type StyleProp } from 'react-native';

function scalable(style: StyleProp<TextStyle>): TextStyle {
  const result = { ...StyleSheet.flatten(style) };
  // React Native Web accepts CSS lengths; the shared native types only list numbers.
  for (const key of ['fontSize', 'lineHeight', 'letterSpacing'] as const) {
    const value = result[key];
    if (typeof value === 'number') Object.assign(result, { [key]: `${value / 16}rem` });
  }
  return result;
}

export function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={scalable(style)} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  return <NativeTextInput {...props} style={scalable(style)} />;
}
