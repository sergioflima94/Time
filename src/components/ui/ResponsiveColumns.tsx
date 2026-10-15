import { Children, PropsWithChildren } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

/** Independent panels side by side on notebooks; retain reading order on phones. */
export function ResponsiveColumns({ children }: PropsWithChildren) {
  const { width } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width >= 1180;
  return <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'stretch', gap: 18 }}>
    {Children.toArray(children).map((child,i) => <View key={i} style={{ flex: wide ? 1 : undefined, minWidth: 0, gap: 12 }}>{child}</View>)}
  </View>;
}
