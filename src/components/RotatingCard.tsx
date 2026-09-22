import { PropsWithChildren, useEffect } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

/**
 * Gira a carta do jogador continuamente no eixo Y (efeito "vitrine"), estilo
 * carta de colecionador em exibição. Usado nas telas onde o jogador aparece em
 * destaque (perfil de outro jogador) — não no grid do Elenco, pra não distrair.
 */
export function RotatingCard({ children }: PropsWithChildren) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 7000, easing: Easing.linear }), -1);
  }, [rotation]);

  const style = useAnimatedStyle(() => ({
    transform: [{ perspective: 900 }, { rotateY: `${rotation.value}deg` }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
