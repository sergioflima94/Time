import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';
import { useAdsState } from '@/hooks/useAdsState';
import { adsMode, BannerAd, BannerAdSize, getBannerAdUnitId, initializeAds, isAdsSupported } from '@/lib/ads';

/**
 * Banner de anúncio exibido apenas para jogadores não-Premium.
 * Em build nativo (EAS Build/dev client) usa o SDK real do AdMob
 * Só monta após UMP autorizar pedidos e o SDK inicializar. Web/Expo Go não exibem
 * publicidade simulada. As telas continuam responsáveis pelo acesso sem anúncios.
 */
export function AdBanner() {
  const { ready, revision } = useAdsState();
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => { void initializeAds(); }, []);
  useEffect(() => { setFailed(false); }, [revision, width]);
  const unitId = getBannerAdUnitId();
  if (!isAdsSupported || !ready || !unitId || !BannerAd || failed) return null;

  return (
    <View style={styles.wrap} onLayout={event => {
      setWidth(Math.max(0, Math.floor(event.nativeEvent.layout.width - spacing.sm * 2 - 2)));
    }}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{adsMode === 'test' ? 'Anúncio de teste' : 'Anúncio'}</Text>
        <Pressable onPress={() => router.push('/(tabs)/perfil')}>
          <Text style={styles.removeAds}>Premium ou pague um jogo p/ remover</Text>
        </Pressable>
      </View>

      {width > 0 && <BannerAd key={`${revision}-${width}`} unitId={unitId}
        size={BannerAdSize.INLINE_ADAPTIVE_BANNER} width={width} maxHeight={100}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }} onAdFailedToLoad={() => setFailed(true)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderStyle: 'dashed',
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  label: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  removeAds: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '700',
  },
});
