import { ReactNode, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

interface RotatingCardProps {
  front: ReactNode;
  back: ReactNode;
  width: number;
  height: number;
}

/**
 * Gira a carta do jogador continuamente no eixo Y (efeito "vitrine"), estilo
 * carta de colecionador em exibição. `front` e `back` ficam sobrepostos e cada um
 * usa `backfaceVisibility: 'hidden'` — assim o verso aparece corretamente virado
 * (não espelhado) quando a rotação passa de 90°/270°, em vez de mostrar o mesmo
 * conteúdo invertido.
 */
export function RotatingCard({ front, back, width, height }: RotatingCardProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 7000, easing: Easing.linear }), -1);
  }, [rotation]);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 900 }, { rotateY: `${rotation.value}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 900 }, { rotateY: `${rotation.value + 180}deg` }],
  }));

  return (
    <Animated.View style={{ width, height }}>
      <Animated.View style={[styles.face, frontStyle]}>{front}</Animated.View>
      <Animated.View style={[styles.face, backStyle]}>{back}</Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    backfaceVisibility: 'hidden',
  },
});
