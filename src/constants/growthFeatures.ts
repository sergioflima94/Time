export const GROWTH_FEATURES = [
  { id: 'placar', icon: 'podium-outline', title: 'Placar multiesporte', description: 'Sets, quartos, períodos e regras próprias.', color: '#22C55E', revenue: 'Base do produto' },
  { id: 'conversas', icon: 'chatbubbles-outline', title: 'Conversas', description: 'Chat por time, partida, capitães e atendimento.', color: '#3B82F6', revenue: 'Retenção' },
  { id: 'carteira', icon: 'wallet-outline', title: 'Carteira e créditos', description: 'Créditos, cashback, estornos e extrato.', color: '#A855F7', revenue: 'Menos taxas' },
  { id: 'fidelidade', icon: 'ribbon-outline', title: 'Planos e fidelidade', description: 'Mensalidades, pacotes e vantagens.', color: '#F59E0B', revenue: 'Recorrência' },
  { id: 'equipe', icon: 'people-circle-outline', title: 'Equipe operacional', description: 'Árbitros, mesários, professores e pagamentos.', color: '#EF4444', revenue: 'Comissão' },
  { id: 'marketplace', icon: 'flash-outline', title: 'Horários vagos', description: 'Ofertas, partidas abertas e campos patrocinados.', color: '#06B6D4', revenue: 'Reserva + anúncio' },
  { id: 'relatorios', icon: 'bar-chart-outline', title: 'Relatórios', description: 'Ocupação, receita, ticket e inadimplência.', color: '#14B8A6', revenue: 'Plano Pro' },
  { id: 'documentos', icon: 'document-text-outline', title: 'Documentos e segurança', description: 'Termos, responsáveis e contatos de emergência.', color: '#64748B', revenue: 'Confiança' },
  { id: 'retrospectiva', icon: 'sparkles-outline', title: 'Retrospectivas', description: 'Craque, recordes e cards compartilháveis.', color: '#EC4899', revenue: 'Premium' },
  { id: 'loja', icon: 'storefront-outline', title: 'Loja e aluguel', description: 'Produtos, estoque, retirada e equipamentos.', color: '#F97316', revenue: 'Comissão' },
] as const;

export type GrowthFeatureId = (typeof GROWTH_FEATURES)[number]['id'];

export function getGrowthFeature(id: string | undefined) {
  return GROWTH_FEATURES.find((feature) => feature.id === id) ?? GROWTH_FEATURES[0];
}
