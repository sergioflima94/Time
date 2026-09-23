import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useAppStore } from '@/store/useAppStore';
import type { Friendship, Player } from '@/types';

function otherPlayerId(friendship: Friendship, playerId: string): string {
  return friendship.requesterId === playerId ? friendship.addresseeId : friendship.requesterId;
}

/** Amigos (amizade aceita) do jogador atual, com o Player completo. */
export function useFriends(): Player[] {
  return useAppStore(
    useShallow((s) => {
      const accepted = s.friendships.filter(
        (f) => f.status === 'accepted' && (f.requesterId === s.currentPlayerId || f.addresseeId === s.currentPlayerId),
      );
      return accepted
        .map((f) => s.players.find((p) => p.id === otherPlayerId(f, s.currentPlayerId)))
        .filter((p): p is Player => !!p);
    }),
  );
}

export interface FriendRequest {
  friendship: Friendship;
  player: Player;
}

/**
 * Pedidos pendentes recebidos (pra aceitar/recusar) e enviados (aguardando resposta)
 * pelo jogador atual.
 *
 * `useMemo` aqui por causa dos objetos `{friendship, player}` montados na hora — mesmo
 * com `useShallow`, ele só compara as arrays `incoming`/`outgoing` por referência, e elas
 * são recriadas a cada chamada do `.map()`, então sem memoização o componente que usa
 * isso entra em loop de re-render mesmo sem nada ter mudado de verdade.
 */
export function useFriendRequests(): { incoming: FriendRequest[]; outgoing: FriendRequest[] } {
  const currentPlayerId = useAppStore((s) => s.currentPlayerId);
  const friendships = useAppStore((s) => s.friendships);
  const players = useAppStore((s) => s.players);

  return useMemo(() => {
    const pending = friendships.filter((f) => f.status === 'pending');
    const incoming = pending
      .filter((f) => f.addresseeId === currentPlayerId)
      .map((f) => ({ friendship: f, player: players.find((p) => p.id === f.requesterId) }))
      .filter((r): r is FriendRequest => !!r.player);
    const outgoing = pending
      .filter((f) => f.requesterId === currentPlayerId)
      .map((f) => ({ friendship: f, player: players.find((p) => p.id === f.addresseeId) }))
      .filter((r): r is FriendRequest => !!r.player);
    return { incoming, outgoing };
  }, [currentPlayerId, friendships, players]);
}

export type FriendshipState =
  | { status: 'none' }
  | { status: 'friends'; friendshipId: string }
  | { status: 'pending_sent'; friendshipId: string }
  | { status: 'pending_received'; friendshipId: string };

/** Estado da amizade do jogador atual com um outro jogador específico — usado no botão do perfil. */
export function useFriendshipWith(otherPlayerId: string): FriendshipState {
  return useAppStore(
    useShallow((s) => {
      const f = s.friendships.find(
        (f) =>
          f.status !== 'declined' &&
          ((f.requesterId === s.currentPlayerId && f.addresseeId === otherPlayerId) ||
            (f.requesterId === otherPlayerId && f.addresseeId === s.currentPlayerId)),
      );
      if (!f) return { status: 'none' };
      if (f.status === 'accepted') return { status: 'friends', friendshipId: f.id };
      return f.requesterId === s.currentPlayerId
        ? { status: 'pending_sent', friendshipId: f.id }
        : { status: 'pending_received', friendshipId: f.id };
    }),
  );
}
