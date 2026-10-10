/** Tokens nunca são exibidos, registrados em logs ou salvos fora do Supabase Auth. */
export type AuthCallback =
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'code'; code: string };

export function parseAuthCallback(url: string): AuthCallback {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return { kind: 'empty' }; }
  const path = parsed.protocol === 'pelada:'
    ? `/${parsed.hostname}${parsed.pathname}`.replace(/\/+/g, '/')
    : parsed.pathname.replace(/^\/--\//, '/');
  if (!['pelada:', 'https:', 'http:', 'exp:'].includes(parsed.protocol)
    || path.replace(/\/$/, '') !== '/auth/callback') return { kind: 'empty' };
  const query = new URLSearchParams(parsed.search);
  const fragment = new URLSearchParams(parsed.hash.slice(1));
  const get = (key: string) => fragment.get(key) ?? query.get(key);
  if (get('error') || get('error_code')) {
    return { kind: 'error', message: get('error_code') === 'otp_expired'
      ? 'Este link expirou ou já foi utilizado. Tente entrar com sua senha ou solicite outro e-mail.'
      : 'Não foi possível confirmar por este link. Tente entrar com sua senha ou solicite outro e-mail.' };
  }
  const accessToken = get('access_token');
  const refreshToken = get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken };
  if (get('code')) return { kind: 'code', code: get('code')! };
  return { kind: 'empty' };
}

export function authErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  if (code === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar. Você pode reenviar a confirmação abaixo.';
  if (code === 'otp_expired') return 'Código ou link inválido, expirado ou já utilizado. Confira o e-mail mais recente ou solicite outro.';
  if (code === 'email_address_not_authorized') return 'O envio de e-mails ainda precisa ser configurado pelo responsável do MarcouJogou. Tente novamente após essa configuração.';
  if (code === 'invalid_credentials') return 'E-mail ou senha incorretos.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'Aguarde um pouco antes de tentar novamente. O limite de envio do servidor foi atingido.';
  if (code === 'user_already_exists') return 'Esta conta já existe. Entre com seu e-mail e senha.';
  if (code === 'weak_password') return 'Escolha uma senha mais forte, com pelo menos 6 caracteres.';
  return 'Não foi possível concluir. Confira sua conexão e tente novamente.';
}

/** Só aceita o link de confirmação do próprio backend. Nunca segue redirect_to. */
export function confirmationTokenHash(link: string, projectUrl: string | null): string | null {
  if (!projectUrl) return null;
  try {
    const url = new URL(link.trim());
    const backend = new URL(projectUrl);
    if (url.protocol !== 'https:' || url.origin !== backend.origin || url.username || url.password
      || url.pathname !== '/auth/v1/verify' || !['signup', 'email'].includes(url.searchParams.get('type') ?? '')
      || url.searchParams.getAll('type').length !== 1) return null;
    const hashes = [...url.searchParams.getAll('token'), ...url.searchParams.getAll('token_hash')];
    return hashes.length === 1 && /^[a-zA-Z0-9_-]{20,512}$/.test(hashes[0]) ? hashes[0] : null;
  } catch { return null; }
}
