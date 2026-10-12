/** In-memory gate. UMP owns consent persistence; no status is saved by the app. */
export interface AdConsentInfo {
  canRequestAds: boolean;
  privacyOptionsRequirementStatus: string;
}

export interface AdsState {
  ready: boolean;
  busy: boolean;
  privacyOptionsRequired: boolean;
  revision: number;
  error: string | null;
}

interface AdsAdapter {
  gatherConsent(): Promise<AdConsentInfo>;
  getConsentInfo(): Promise<AdConsentInfo>;
  showPrivacyOptionsForm(): Promise<AdConsentInfo>;
  initialize(): Promise<unknown>;
}

export function createAdConsentController(adapter: AdsAdapter | null) {
  let state: AdsState = { ready: false, busy: false, privacyOptionsRequired: false, revision: 0, error: null };
  let pending: Promise<void> | null = null;
  let initialized = false;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<AdsState>) => {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  };
  const apply = async (info: AdConsentInfo) => {
    update({ privacyOptionsRequired: info.privacyOptionsRequirementStatus === 'REQUIRED' });
    if (!info.canRequestAds) return;
    if (!initialized) { await adapter!.initialize(); initialized = true; }
    update({ ready: true });
  };
  // Serializes banners and the privacy form. Hide all banners while choices change.
  function run(privacy: boolean): Promise<void> {
    if (!adapter) return Promise.resolve();
    if (pending) return privacy ? pending.then(() => run(true)) : pending;
    if (!privacy && state.ready) return Promise.resolve();
    update({ ready: false, busy: true, error: null, revision: state.revision + 1 });
    pending = (async () => {
      try {
        let info: AdConsentInfo;
        try { info = await (privacy ? adapter.showPrivacyOptionsForm() : adapter.gatherConsent()); }
        catch {
          // A network/form failure is not permission. Only UMP can authorize cached consent.
          info = await adapter.getConsentInfo();
          if (privacy) update({ error: 'Não foi possível atualizar as opções. Tente novamente.' });
        }
        await apply(info);
      } catch {
        update({ ready: false, error: 'Anúncios indisponíveis. Você pode continuar usando o app.' });
      } finally { update({ busy: false }); pending = null; }
    })();
    return pending;
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    initialize: () => run(false),
    showPrivacyOptions: () => run(true),
    async refreshPrivacyOptions() {
      if (!adapter) return;
      try {
        const info = await adapter.getConsentInfo();
        update({ privacyOptionsRequired: info.privacyOptionsRequirementStatus === 'REQUIRED' });
      } catch { /* No ad request and no permission inferred. */ }
    },
  };
}
