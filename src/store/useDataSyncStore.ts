import { create } from 'zustand';

export type DataSyncStatus = 'disabled' | 'starting' | 'synced' | 'offline' | 'error';

export interface DataSyncPatch {
  status?: DataSyncStatus;
  pendingCount?: number;
  lastSyncedAt?: string | null;
  error?: string | null;
}

interface DataSyncState {
  status: DataSyncStatus;
  pendingCount: number;
  lastSyncedAt: string | null;
  error: string | null;
  setSyncState: (patch: DataSyncPatch) => void;
}

/** Estado pequeno e global para a UI poder informar modo offline/sincronização. */
export const useDataSyncStore = create<DataSyncState>((set) => ({
  status: 'disabled',
  pendingCount: 0,
  lastSyncedAt: null,
  error: null,
  setSyncState: (patch) => set(patch),
}));
