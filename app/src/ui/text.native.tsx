import { Text as NativeText, TextInput as NativeTextInput, useWindowDimensions, type TextProps, type TextInputProps } from 'react-native';

export function Text(props: TextProps) {
  const { fontScale } = useWindowDimensions();
  // Recreate the text measurement when Dynamic Type changes without an app restart.
  return <NativeText key={fontScale} {...props} />;
}

export function TextInput(props: TextInputProps) {
  const { fontScale } = useWindowDimensions();
  return <NativeTextInput key={fontScale} {...props} />;
}
