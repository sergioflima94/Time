import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { formatBRL, getSplitAmount } from '@/lib/payments';
import { useAppStore } from '@/store/useAppStore';
import type { Attendance, Establishment } from '@/types';

interface PaymentSplitSectionProps {
  gameId: string;
  fieldCost: number | null;
  confirmed: Attendance[];
  isAdmin: boolean;
  currentPlayerId: string;
  establishment: Establishment | null;
}

export function PaymentSplitSection({
  gameId,
  fieldCost,
  confirmed,
  isAdmin,
  currentPlayerId,
  establishment,
}: PaymentSplitSectionProps) {
  const players = useAppStore((s) => s.players);
  const payments = useAppStore(useShallow((s) => s.payments.filter((p) => p.gameId === gameId)));
  const setGameFieldCost = useAppStore((s) => s.setGameFieldCost);
  const setPaymentStatus = useAppStore((s) => s.setPaymentStatus);
  const payForPlayers = useAppStore((s) => s.payForPlayers);

  const [editingCost, setEditingCost] = useState(false);
  const [costDraft, setCostDraft] = useState(fieldCost ? String(fieldCost) : '');
  const [payingForOthers, setPayingForOthers] = useState(false);
  const [selectedOthers, setSelectedOthers] = useState<Set<string>>(new Set());

  if (!fieldCost && !isAdmin) return null;

  const splitAmount = fieldCost ? getSplitAmount(fieldCost, confirmed.length) : 0;
  const paymentOf = (playerId: string) => payments.find((p) => p.playerId === playerId);
  const myPayment = paymentOf(currentPlayerId);
  const iAmConfirmed = confirmed.some((a) => a.playerId === currentPlayerId);
  const othersUnpaid = confirmed.filter((a) => a.playerId !== currentPlayerId && paymentOf(a.playerId)?.status !== 'paid');

  function saveCost() {
    const n = Number(costDraft.replace(',', '.'));
    setGameFieldCost(gameId, n > 0 ? n : null);
    setEditingCost(false);
  }

  function toggleOther(playerId: string) {
    setSelectedOthers((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  function confirmPayment() {
    const playerIds = [currentPlayerId, ...selectedOthers];
    payForPlayers(gameId, currentPlayerId, playerIds, 'pix');
    setPayingForOthers(false);
    setSelectedOthers(new Set());
  }

  return (
    <Card style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Rateio da quadra</Text>
        {fieldCost && <Text style={styles.total}>{formatBRL(fieldCost)}</Text>}
      </View>

      {establishment && (
        <View style={styles.recipientRow}>
          <Ionicons name="business" size={13} color={colors.textMuted} />
          <Text style={styles.recipientText}>
            Recebe {establishment.name} ·{' '}
            {establishment.payoutMethod === 'pix' ? `Pix ${establishment.pixKey}` : 'combinar na hora'}
          </Text>
        </View>
      )}

      {isAdmin && (
        <View style={styles.editRow}>
          {editingCost ? (
            <>
              <TextField label="" value={costDraft} onChangeText={setCostDraft} keyboardType="decimal-pad" style={{ width: 100 }} />
              <Button label="Salvar" small onPress={saveCost} />
            </>
          ) : (
            <Pressable
              onPress={() => {
                setCostDraft(fieldCost ? String(fieldCost) : '');
                setEditingCost(true);
              }}
            >
              <Text style={styles.link}>{fieldCost ? 'Alterar custo da quadra' : 'Definir custo da quadra'}</Text>
            </Pressable>
          )}
        </View>
      )}

      {fieldCost && (
        <>
          <Text style={styles.splitHint}>
            {formatBRL(splitAmount)} por pessoa ({confirmed.length} confirmado{confirmed.length === 1 ? '' : 's'})
          </Text>

          {iAmConfirmed && (
            <View style={styles.payWrap}>
              <View style={styles.myPaymentRow}>
                <Text style={styles.myPaymentText}>Sua parte: {formatBRL(splitAmount)}</Text>
                {myPayment?.status === 'paid' ? (
                  <Badge label="Pago" color={colors.primary} />
                ) : (
                  <Button
                    label={selectedOthers.size > 0 ? `Pagar ${formatBRL(splitAmount * (1 + selectedOthers.size))}` : 'Marcar como pago (Pix)'}
                    small
                    onPress={confirmPayment}
                  />
                )}
              </View>

              {myPayment?.status !== 'paid' && othersUnpaid.length > 0 && (
                <Pressable onPress={() => setPayingForOthers((v) => !v)}>
                  <Text style={styles.link}>
                    {payingForOthers ? 'Fechar' : '+ Pagar também por outra pessoa'}
                  </Text>
                </Pressable>
              )}

              {payingForOthers && (
                <View style={styles.othersList}>
                  {othersUnpaid.map((a) => {
                    const player = players.find((p) => p.id === a.playerId);
                    const checked = selectedOthers.has(a.playerId);
                    return (
                      <Pressable key={a.playerId} style={styles.otherRow} onPress={() => toggleOther(a.playerId)}>
                        <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={18} color={checked ? colors.primary : colors.textFaint} />
                        <Text style={styles.otherName}>{player?.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {isAdmin && (
            <View style={styles.adminList}>
              <Text style={styles.adminListTitle}>Quem já pagou</Text>
              {confirmed.map((a) => {
                const player = players.find((p) => p.id === a.playerId);
                const payment = paymentOf(a.playerId);
                const paid = payment?.status === 'paid';
                const paidBy = payment?.paidByPlayerId ? players.find((p) => p.id === payment.paidByPlayerId) : null;
                return (
                  <View key={a.playerId} style={styles.adminRow}>
                    <View>
                      <Text style={styles.adminRowName}>{player?.name}</Text>
                      {paid && paidBy && <Text style={styles.paidByText}>pago por {paidBy.name}</Text>}
                    </View>
                    <Pressable
                      onPress={() => setPaymentStatus(gameId, a.playerId, paid ? 'pending' : 'paid', paid ? undefined : 'cash')}
                    >
                      <Badge label={paid ? 'Pago' : 'Pendente'} color={paid ? colors.primary : colors.warning} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  total: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recipientText: {
    color: colors.textMuted,
    fontSize: 11,
    flex: 1,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  link: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  splitHint: {
    color: colors.textMuted,
    fontSize: 13,
  },
  payWrap: {
    gap: spacing.xs,
  },
  myPaymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  myPaymentText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  othersList: {
    gap: 4,
    paddingLeft: spacing.xs,
  },
  otherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  otherName: {
    color: colors.text,
    fontSize: 13,
  },
  adminList: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  adminListTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  adminRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  adminRowName: {
    color: colors.text,
    fontSize: 14,
  },
  paidByText: {
    color: colors.textFaint,
    fontSize: 11,
    marginTop: 1,
  },
});
