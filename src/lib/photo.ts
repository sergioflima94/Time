import * as ImagePicker from 'expo-image-picker';

/** Abre a galeria para o jogador escolher/trocar a foto de perfil. Retorna a URI escolhida ou null se cancelado/sem permissão. */
export async function pickProfilePhoto(): Promise<string | null> {
  return (await pickPhotoAsset())?.uri ?? null;
}

/** Keeps the browser File for uploads without fetching a local blob URL. */
export async function pickPhotoAsset(): Promise<ImagePicker.ImagePickerAsset | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });

  if (result.canceled) return null;
  return result.assets[0] ?? null;
}
