import { isMockMode, supabase } from '@/lib/supabase';

/**
 * Gera um emblema de time a partir de uma descrição (ex.: "leão dourado com bola de
 * futebol"). Em produção, chama a Edge Function `generate-team-logo`
 * (supabase/functions/generate-team-logo), que guarda a chave da OpenAI no servidor
 * e usa a API de geração de imagens (gpt-image-1) — a chave NUNCA fica no app.
 *
 * Sem Supabase configurado (modo mock) ou se a geração falhar, cai num gerador de
 * emblema de exemplo (grátis, sem chave) só pra já dar pra testar o fluxo inteiro.
 */
export async function generateTeamLogo(prompt: string): Promise<{ url: string; isDemo: boolean }> {
  if (!isMockMode && supabase) {
    try {
      const { data, error } = await supabase.functions.invoke('generate-team-logo', {
        body: { prompt },
      });
      if (error) throw error;
      if (data?.imageUrl) return { url: data.imageUrl, isDemo: false };
    } catch {
      // cai no fallback abaixo
    }
  }

  const seed = encodeURIComponent(prompt || 'time');
  return { url: `https://api.dicebear.com/9.x/shapes/svg?seed=${seed}`, isDemo: true };
}
