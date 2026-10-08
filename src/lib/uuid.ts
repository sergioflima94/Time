/**
 * UUID v4 compatível com Expo/React Native e com as colunas uuid do Postgres.
 * `crypto.randomUUID` é usado quando o runtime oferece a API nativa; o fallback
 * existe para builds antigos do JavaScriptCore e mantém o formato RFC 4122.
 */
export function createUuid(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
