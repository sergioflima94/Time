import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { colors } from '@/constants/theme';
import { getSport } from '@/constants/sports';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { chooseTeamEmblem, removeTeamEmblem, saveGeneratedTeamEmblem } from '@/lib/teamEmblem';
import { generateTeamLogo } from '@/lib/teamLogo';
import { TeamBadge } from './TeamBadge';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { TextField } from './ui/TextField';

export function TeamEmblemEditor({ teamId }: { teamId: string }) {
  const team = useAppStore(s => s.peladas.find(p => p.id === teamId));
  const admin = useAppStore(s => s.memberships.some(m => m.peladaId === teamId && m.playerId === s.currentPlayerId && m.active && m.role === 'admin'));
  const actor = useAuthStore(s => s.authUserId);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [generator, setGenerator] = useState(false);
  const [prompt, setPrompt] = useState(''), [removing, setRemoving] = useState(false);
  const scope = useRef('');
  useEffect(() => { const key = `${teamId}:${actor}`; scope.current = key; setNotice(''); setBusy(false); setRemoving(false); return () => { scope.current = ''; }; }, [teamId, actor]);
  if (!team || !admin) return null;
  async function act(task: () => Promise<unknown>) {
    const key = scope.current; if (busy) return;
    setBusy(true); setNotice('');
    try { const result = await task(); if (scope.current === key && result !== false) { setNotice('Emblema atualizado.'); setRemoving(false); } }
    catch(e) { if (scope.current === key) setNotice(e instanceof Error ? e.message : 'Não foi possível atualizar o emblema.'); }
    finally { if (scope.current === key) setBusy(false); }
  }
  async function generate() {
    const key = scope.current;
    const result = await generateTeamLogo(`${getSport(team!.sportId).label}. ${prompt.trim()}`, { teamId });
    if (scope.current !== key) throw new Error('A conta ou o time mudou.');
    if (result.isDemo) throw new Error('O gerador está indisponível. Nenhuma imagem de exemplo foi salva; você pode enviar seu emblema pela galeria.');
    await saveGeneratedTeamEmblem(teamId, result.url);
  }
  return <Card>
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <TeamBadge name={team.name} logoUrl={team.logoUrl} size={54} />
      <View style={{ flex: 1, gap: 4 }}><Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>Emblema do time</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>JPG, PNG ou WebP · até 5 MB. Use uma imagem que você pode tornar pública.</Text></View>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Button small label={team.logoUrl ? 'Trocar emblema' : 'Enviar emblema'} loading={busy} onPress={() => { void act(() => chooseTeamEmblem(teamId)); }} />
      <Button small label="Gerar com IA" variant="outline" disabled={busy} onPress={() => setGenerator(v => !v)} />
      {!!team.logoUrl && <Button small label="Remover" variant="ghost" disabled={busy} onPress={() => setRemoving(true)} />}
    </View>
    {generator && <View style={{ gap: 8 }}><TextField label="Descreva seu emblema" value={prompt} onChangeText={setPrompt} maxLength={400} editable={!busy} placeholder="Ex.: águia, azul e branco, sem texto" />
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>A geração depende da configuração do serviço no servidor. Não inclua dados pessoais.</Text>
      <Button label="Gerar e salvar emblema" small disabled={busy || prompt.trim().length < 3} onPress={() => { void act(generate); }} />
    </View>}
    {removing && <View style={{ gap: 8 }}><Text style={{ color: colors.text }}>Remover o emblema e voltar às iniciais do time?</Text><View style={{ flexDirection: 'row', gap: 8 }}>
      <Button small label="Confirmar remoção" variant="danger" disabled={busy} onPress={() => { void act(() => removeTeamEmblem(teamId)); }} />
      <Button small label="Cancelar" variant="outline" disabled={busy} onPress={() => setRemoving(false)} /></View></View>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>{notice}</Text>}
  </Card>;
}
