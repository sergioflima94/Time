import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Badge } from '@/components/ui/Badge';
import { colors, spacing } from '@/constants/theme';
import { getSport, useSports } from '@/constants/sports';
import { listOpenGames, requestOpenGame, type OpenGame } from '@/lib/discovery';
import { formatGameDateLong } from '@/lib/format';
import { formatBRL } from '@/lib/payments';
import { usePlatformStore } from '@/store/usePlatformStore';

export default function DiscoverScreen() {
  const { gameId } = useLocalSearchParams<{ gameId?: string }>();
  const SPORTS = useSports();
  const enabled = usePlatformStore(s => s.settings.discoveryEnabled);
  const ready = usePlatformStore(s => s.publicReady);
  const [sport, setSport] = useState('all'); const [query, setQuery] = useState('');
  const [games, setGames] = useState<OpenGame[]>([]); const [loading, setLoading] = useState(false); const [busy, setBusy] = useState<string | null>(null); const [notice, setNotice] = useState('');
  async function refresh() { setLoading(true); try { setGames(await listOpenGames(sport,query)); setNotice(''); } catch(e) { setNotice(e instanceof Error ? e.message : 'Não foi possível carregar jogos.'); } finally { setLoading(false); } }
  const visibleGames = gameId ? games.filter(g => g.gameId === gameId) : games;
  useEffect(() => { let live = true; setLoading(true); void listOpenGames(sport,'').then(rows => { if(live) setGames(rows); }).catch(e => { if(live) setNotice(e.message); }).finally(() => { if(live) setLoading(false); }); return () => { live = false; }; }, [sport, enabled]);
  async function request(game: OpenGame) { setBusy(game.gameId); try { const status = await requestOpenGame(game.gameId); setGames(rows => rows.map(g => g.gameId === game.gameId ? { ...g, requestStatus: status } : g)); setNotice('Solicitação enviada. O organizador aprova sua entrada; isso ainda não confirma uma vaga nem gera cobrança.'); } catch(e) { setNotice(e instanceof Error ? e.message : 'Solicitação não enviada.'); } finally { setBusy(null); } }
  return <Screen contentStyle={{ gap: spacing.md }}><View style={styles.header}><Pressable accessibilityLabel="Voltar" onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable><View><Text style={styles.title}>Bora jogar?</Text><Text style={styles.caption}>Jogos que os organizadores abriram para novas pessoas</Text></View></View>
    {!ready && <Text style={styles.caption}>A configuração pública ainda não foi carregada. Tente atualizar.</Text>}
    {!enabled ? <Card><Text style={styles.caption}>A descoberta está temporariamente desativada. Seus times continuam disponíveis.</Text></Card> : <>
      <ScrollView horizontal contentContainerStyle={{ gap: 8 }} showsHorizontalScrollIndicator={false}>{[{ id: 'all', label: 'Todos' }, ...SPORTS].map(s => <Pressable key={s.id} onPress={() => setSport(s.id)} style={[styles.chip, sport === s.id && { borderColor: colors.primary }]}><Text style={styles.caption}>{s.label}</Text></Pressable>)}</ScrollView>
      <TextField label="Time, campo ou endereço" value={query} onChangeText={setQuery} placeholder="Ex.: bairro, arena ou nome do time" /><Button label="Buscar jogos" small loading={loading} variant="outline" onPress={() => void refresh()} />
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {!loading && visibleGames.length === 0 && <Card><Text style={styles.sectionTitle}>Jogo indisponível ou nenhum resultado neste filtro</Text><Text style={styles.caption}>Apenas jogos publicados pelo organizador aparecem aqui. Não mostramos vagas inventadas. Você pode criar um time e convidar a galera.</Text><Button label="Ver todos os jogos" small variant="outline" onPress={() => router.replace('/descobrir')} /><Button label="Criar meu time" small onPress={() => router.push('/criar-pelada')} /></Card>}
      {visibleGames.map(g => { const sport = getSport(g.sportId); const remaining = Math.max(0,g.maxPlayers-g.confirmedCount); return <Card key={g.gameId}><View style={styles.header}><Text style={[styles.sectionTitle, { flex: 1 }]}>{sport.icon} {g.teamName}</Text><Badge label={remaining ? `${remaining} vagas` : 'Espera'} color={sport.color} /></View><Text style={styles.copy}>{formatGameDateLong(g.scheduledAt)} · {g.durationMinutes} min</Text><Text style={styles.caption}>{g.fieldName}{g.address ? ` · ${g.address}` : ''}</Text><Text style={styles.caption}>Nível: {{ all: 'Todos', beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' }[g.level] ?? g.level}</Text>{!!g.description && <Text style={styles.copy}>{g.description}</Text>}<Text style={styles.copy}>{g.fieldCost === null ? 'Consulte o organizador sobre o valor.' : `Estimativa ${formatBRL(g.fieldCost / Math.max(1,g.maxPlayers))}/pessoa se todas as vagas forem preenchidas.`}</Text><Text style={styles.caption}>A aprovação também inclui você no time como membro. Entrada sujeita à aprovação. O rateio final depende da chamada e não é cobrado nesta solicitação.</Text><Button label={g.requestStatus === 'pending' ? 'Aguardando organizador' : g.requestStatus === 'accepted' ? 'Entrada aprovada' : g.requestStatus === 'declined' ? 'Solicitação recusada' : remaining ? 'Quero participar' : 'Pedir entrada na espera'} small disabled={!!g.requestStatus} loading={busy === g.gameId} onPress={() => void request(g)} /></Card>; })}
    </>}
  </Screen>;
}
const styles = StyleSheet.create({ header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, title: { color: colors.text, fontSize: 21, fontWeight: '900' }, sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 8 }, caption: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 6 }, copy: { color: colors.text, fontSize: 13, lineHeight: 19, marginVertical: 8 }, chip: { paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 20 }, notice: { color: colors.secondary, fontSize: 13, lineHeight: 19 } });
