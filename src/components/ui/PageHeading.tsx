import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

/** Keeps the page title and its explanation together, outside the action grid. */
export function PageHeading({ children }: PropsWithChildren) {
  return <View style={styles.heading}>{children}</View>;
}
const styles = StyleSheet.create({ heading: { gap: 5, marginBottom: 4, minWidth: 0 } });
