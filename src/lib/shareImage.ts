import type { RefObject } from 'react';
import { Platform, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import domtoimage from 'dom-to-image';

/**
 * Gera uma imagem PNG a partir do conteúdo de uma View e compartilha externamente
 * (WhatsApp, etc). No nativo abre a folha de compartilhamento do sistema; na web,
 * como expo-sharing não suporta compartilhar arquivo local (só upload), baixa a
 * imagem pro dispositivo em vez disso.
 */
export async function shareViewAsImage(viewRef: RefObject<View | null>, filename: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (!viewRef.current) return;
    const dataUrl = await domtoimage.toPng(viewRef.current, { quality: 0.95 });
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = dataUrl;
    link.click();
    return;
  }

  const uri = await captureRef(viewRef, { format: 'png', quality: 1 });
  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: filename, UTI: 'public.png' });
  }
}
