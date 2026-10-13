import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from './ui/Button';
import { TextField } from './ui/TextField';
import { colors } from '@/constants/theme';
import { isMockMode, supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { PRIVACY_CONTACT_EMAIL } from '@/constants/publicWebsite';

type Request = { id: string; status: 'requested' | 'processing' | 'cancelled' | 'completed'; expectedBy: string };
type AdminRequest = Request & { name: string; email: string | null; playerId: string | null; authUserId: string | null };
type Rpc = (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
async function call(name: string, params: Record<string, unknown>) {
  if (!supabase || isMockMode) throw Error('Disponível somente para contas reais. Nenhum pedido foi enviado na demonstração.');
  const response = await (supabase.rpc as unknown as Rpc)(name, params);
  if (response.error) throw Error(response.error.message);
  return response.data;
}
const copy = { color: colors.textMuted, fontSize: 12, lineHeight: 18 };
export function AccountDeletionPanel() {
  const actor = useAuthStore(s => s.authUserId);
  const epoch = useRef(0);
  const [request, setRequest] = useState<Request | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { epoch.current++; setRequest(null); setExpanded(false); setConfirmation(''); setNotice(''); setBusy(false); }, [actor]);
  async function run(action: 'status' | 'request' | 'cancel') {
    const current = ++epoch.current;
    const initialActor = actor;
    setBusy(true); setNotice('');
    try {
      const value = await call('account_deletion_self', { p_action: action }) as Request | null;
      if (current !== epoch.current || useAuthStore.getState().authUserId !== initialActor) return;
      setRequest(value); setConfirmation('');
      if (action === 'request') setNotice('Pedido registrado no servidor. A exclusão não é imediata e não exige enviar e-mail.');
      if (action === 'cancel') setNotice('Solicitação cancelada antes do processamento.');
    } catch (error) { if (current === epoch.current) setNotice(error instanceof Error ? error.message : 'Não foi possível registrar. Tente novamente.'); }
    finally { if (current === epoch.current) setBusy(false); }
  }
  const open = request && ['requested','processing'].includes(request.status);
  return <View style={{ gap: 10 }}>
    <Button label="Solicitar exclusão da conta" small variant="outline" disabled={busy} onPress={() => { setExpanded(!expanded); if (!expanded) void run('status'); }} />
    {expanded && <>
      <Text style={copy}>A solicitação é enviada aqui à equipe da plataforma. Prazo previsto: até 7 dias. Você receberá uma confirmação no e-mail cadastrado após a conclusão. Informações cuja conservação seja obrigatória serão tratadas separadamente.</Text>
      <Text style={copy}>Times, reservas e obrigações de outras pessoas não são apagados automaticamente. Se você administra um time ou estabelecimento, a equipe verifica a transferência de responsabilidade. Excluir a conta não cancela uma assinatura da loja; gerencie-a na Google Play ou App Store.</Text>
      {open ? <>
        <Text selectable style={copy}>Protocolo: {request.id}</Text>
        <Text style={copy}>{request.status === 'requested' ? 'Aguardando atendimento' : 'Em processamento'} · previsão {new Date(request.expectedBy).toLocaleDateString('pt-BR')}</Text>
        <Button small variant="ghost" label="Atualizar solicitação" loading={busy} onPress={() => void run('status')} />
        {request.status === 'requested' && <Button small variant="outline" label="Cancelar solicitação de exclusão" disabled={busy} onPress={() => void run('cancel')} />}
      </> : <>
        <TextField label="Digite EXCLUIR para confirmar a solicitação" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" />
        <Button small variant="danger" label="Enviar pedido de exclusão" loading={busy} disabled={confirmation.trim() !== 'EXCLUIR' || isMockMode || !actor} onPress={() => void run('request')} />
      </>}
      <Text style={copy}>Dúvidas ou impedimentos: {PRIVACY_CONTACT_EMAIL}. Não é necessário entrar em contato para iniciar o pedido.</Text>
    </>}
    {!!notice && <Text accessibilityRole="alert" style={copy}>{notice}</Text>}
  </View>;
}

export function AccountDeletionAdminPanel({ compact = false, onOpen }: { compact?: boolean; onOpen?: () => void }) {
  const [items, setItems] = useState<AdminRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const actor = useAuthStore(s => s.authUserId);
  const epoch = useRef(0);
  useEffect(() => { epoch.current++; setItems([]); setNotice(''); setBusy(false); }, [actor]);
  useEffect(() => { void load(); }, [actor]);
  async function load(id?: string) {
    const initialActor = actor, current = ++epoch.current;
    setBusy(true); setNotice('');
    try {
      const data = await call('account_deletion_admin', { p_action: id ? 'process' : 'list', p_request: id ?? null }) as AdminRequest[];
      if (current === epoch.current && useAuthStore.getState().authUserId === initialActor) setItems(data);
    } catch (error) { if (current === epoch.current) { setItems([]); setNotice(error instanceof Error ? error.message : 'Falha ao consultar.'); } }
    finally { if (current === epoch.current) setBusy(false); }
  }
  return <View style={{ gap: 12 }}>
    <Text style={copy}>{compact ? busy ? 'Consultando pedidos de exclusão...' : notice ? 'Fila de exclusão indisponível. Tente consultar novamente.' : `${items.length} pedidos de exclusão aguardando atendimento (até 100 mais antigos).` : 'Fila privada de exclusão de contas. O atendimento deve apagar/anonimizar os dados pessoais, verificar retenções necessárias, remover o acesso e enviar a confirmação. Iniciar atendimento não apaga dados nem marca o pedido como concluído.'}</Text>
    <Button small variant="outline" label="Consultar pedidos de exclusão" loading={busy} onPress={() => void load()} />
    {!!notice && <Text accessibilityRole="alert" style={copy}>{notice}</Text>}
    {compact && onOpen && <Button small label="Abrir fila de exclusão de contas" onPress={onOpen} />}
    {!compact && items.map(item => <View key={item.id} style={{ gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.cardBorder }}>
      <Text style={{ color: colors.text, fontWeight: '700' }}>{item.name}</Text>
      <Text selectable style={copy}>{item.email || 'Sem e-mail'} · {item.status} · prazo {new Date(item.expectedBy).toLocaleDateString('pt-BR')}</Text>
      <Text selectable style={copy}>Protocolo {item.id} · perfil {item.playerId}</Text>
      {item.status === 'requested' && <Button small variant="outline" disabled={busy} label="Iniciar atendimento (não exclui)" onPress={() => void load(item.id)} />}
    </View>)}
  </View>;
}
