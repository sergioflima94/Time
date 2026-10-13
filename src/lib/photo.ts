import * as ImagePicker from 'expo-image-picker';

/** Abre a galeria para o jogador escolher/trocar a foto de perfil. Retorna a URI escolhida ou null se cancelado/sem permissão. */
export async function pickProfilePhoto(): Promise<string | null> {
  return (await pickPhotoAsset())?.uri ?? null;
}

/** Keeps the browser File for uploads without fetching a local blob URL. */
export async function pickPhotoAsset(): Promise<ImagePicker.ImagePickerAsset | null> {
  // SDK 57's system picker grants access to the chosen image; do not request
  // broad gallery access for an image-only selection (also preserves web gestures).
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });

  if (result.canceled) return null;
  return result.assets[0] ?? null;
}
