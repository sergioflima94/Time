import { createContext, PropsWithChildren, useContext } from 'react';

import { colors, liveColors } from '@/constants/theme';

export type ThemeTone = 'default' | 'live';

const ThemeToneContext = createContext<ThemeTone>('default');

export function ThemeToneProvider({ tone, children }: PropsWithChildren<{ tone: ThemeTone }>) {
  return <ThemeToneContext.Provider value={tone}>{children}</ThemeToneContext.Provider>;
}

export function useUiPalette() {
  return useContext(ThemeToneContext) === 'live' ? liveColors : colors;
}
