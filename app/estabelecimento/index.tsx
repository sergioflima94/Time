import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { ResponsiveColumns } from '@/components/ui/ResponsiveColumns';
import { WorkspaceEmpty, WorkspaceHeader, WorkspaceSummary } from '@/components/ui/Workspace';
import { useOwnerBenefits } from '@/hooks/useOwnerBenefits';
import { useAuthStore } from '@/store/useAuthStore';
import { colors, radius, spacing } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import type { EstablishmentPayoutMethod } from '@/types';

export default function MyEstablishmentsScreen() {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const myEstablishments = useAppStore(
    useShallow((s) => s.establishments.filter((e) => e.ownerPlayerId === currentPlayerId)),
  );
  const fields = useAppStore((s) => s.fields);
  const createEstablishment = useAppStore((s) => s.createEstablishment);
  const ownerBenefits = useOwnerBenefits();
  const loggedIn = useAuthStore(s=>s.isLoggedIn);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<EstablishmentPayoutMethod>('pix');
  const [pixKey, setPixKey] = useState('');

  function handleCreate() {
    if (!name.trim() || !loggedIn || !currentPlayerId) return;
    const establishment = createEstablishment(currentPlayerId, {
      name: name.trim(),
      payoutMethod,
      pixKey: payoutMethod === 'pix' ? pixKey.trim() || null : null,
    });
    setName('');
    setPixKey('');
    setCreating(false);
    router.push(`/estabelecimento/${establishment.id}`);
  }

  function fieldCount(establishmentId: string) {
    return fields.filter((f) => f.establishmentId === establishmentId).length;
  }

  if (!loggedIn) return <Screen><WorkspaceEmpty icon="business-outline" title="Seu espaço no MarcouJogou" description="Entre com sua conta para cadastrar e administrar seus campos e quadras."><Button label="Entrar" onPress={()=>router.push('/login')} /></WorkspaceEmpty></Screen>;

  return (
    <Screen>
      <Button small variant="ghost" label="Voltar" onPress={()=>router.back()} />
      <WorkspaceHeader title="Meus estabelecimentos" description="Seus campos, quadras e negócios em um só lugar.">
        <Button small label="Novo estabelecimento" onPress={()=>setCreating(true)} />
        <Button small variant="outline" label="Acessos da equipe" onPress={()=>router.push('/operacao')} />
      </WorkspaceHeader>
      <WorkspaceSummary items={[
        {label:'Estabelecimentos',value:myEstablishments.length,icon:'business-outline'},
        {label:'Campos e quadras',value:fields.filter(f=>myEstablishments.some(e=>e.id===f.establishmentId)).length,icon:'location-outline'},
      ]} />
      {ownerBenefits&&<Card><Text style={styles.estName}>Acesso completo da sua conta</Text><Text style={styles.intro}>Seu papel de proprietário da plataforma inclui os recursos do estabelecimento, sem mensalidade. Cadastre seus próprios espaços para operar; a propriedade dos campos de clientes não é alterada.</Text></Card>}
      <ResponsiveColumns><View style={{gap:12}}>
      {myEstablishments.map((e) => (
          <Card key={e.id} style={{gap:12}}><View style={styles.estRow}>
            <View style={styles.estIcon}>
              <Text style={styles.estIconText}>🏟️</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.estName} numberOfLines={1}>
                {e.name}
              </Text>
              <Text style={styles.estSub}>{fieldCount(e.id)} campo{fieldCount(e.id) === 1 ? '' : 's'}</Text>
            </View>
            <Badge label="Dono" color={colors.selection} textColor={colors.primaryDark} />
          </View><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
            <Button small label="Gerenciar espaço" onPress={()=>router.push(`/estabelecimento/${e.id}`)} />
            <Button small variant="outline" label="Operação ao vivo" onPress={()=>router.push({pathname:'/operacao/ao-vivo',params:{establishmentId:e.id}})} />
          </View>
          </Card>
      ))}

      {!myEstablishments.length&&<WorkspaceEmpty icon="storefront-outline" title="Seu primeiro espaço começa aqui" description="Um estabelecimento pode ter vários campos e esportes. Depois do cadastro, configure reservas, aulas, comandas e acesso da equipe."><Button small label="Cadastrar meu espaço" onPress={()=>setCreating(true)} /></WorkspaceEmpty>}
      </View><View style={{gap:12}}>
      {creating && (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Cadastrar estabelecimento</Text>

          <TextField label="Nome" value={name} onChangeText={setName} placeholder="Arena Society Central" />

          <SegmentedControl<EstablishmentPayoutMethod>
            label="Como você quer receber o rateio"
            options={[
              { value: 'pix', label: 'Pix' },
              { value: 'in_person', label: 'Combinar na hora' },
            ]}
            value={payoutMethod}
            onChange={setPayoutMethod}
          />

          {payoutMethod === 'pix' && (
            <TextField label="Chave Pix" value={pixKey} onChangeText={setPixKey} placeholder="seu@pix.com ou CPF/telefone" />
          )}

          <Button
            label="Cadastrar estabelecimento"
            onPress={handleCreate}
            disabled={!currentPlayerId || !name.trim() || (payoutMethod === 'pix' && !pixKey.trim())}
          />
          {(
            <Button label="Cancelar" variant="ghost" small onPress={() => setCreating(false)} />
          )}
        </Card>
      )}
      {!creating&&<Card><Text style={styles.estName}>Tudo conectado ao seu espaço</Text><Text style={styles.intro}>1. Cadastre o estabelecimento e seus campos.</Text><Text style={styles.intro}>2. Configure horários, preços e formas de receber.</Text><Text style={styles.intro}>3. Libere a equipe e acompanhe reservas, comandas, aulas e relatórios.</Text><Button small variant="outline" label="Ver meus acessos de operação" onPress={()=>router.push('/operacao')} /></Card>}
      </View></ResponsiveColumns>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  intro: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  estRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  estIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(124,58,237,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  estIconText: {
    fontSize: 18,
  },
  estName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  estSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
});
