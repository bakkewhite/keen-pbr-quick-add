import { deriveDomainInput } from './domain';
import { deriveDomainSelectionState } from './domain-state';
import { getPopupCopy, parseUiLanguage, type PopupCopy, type UiLanguage } from './i18n';
import type { BackgroundResponse, PopupRequest } from './messages';
import type { DomainMutationOutcome } from './operation';
import type { PopupPort } from './popup-port';
import { normalizeApiOrigin } from './settings';

type Context = Extract<BackgroundResponse, { type: 'CONTEXT' }>;
type Profile = Extract<BackgroundResponse, { type: 'CONNECTIONS' }>['connections'][number];
type LocalState = Extract<BackgroundResponse, { type: 'LOCAL_STATE' }>;
export type Notice = { status: 'danger' | 'warning' | 'success'; text(copy: PopupCopy): string };
export type SetupStep = 'address' | 'access' | 'list';
export interface PopupState {
  language: UiLanguage;
  screen: 'main' | 'settings';
  settingsView: 'connections' | 'wizard';
  removeCandidate: string | null;
  step: SetupStep;
  busy: 'load' | 'check' | 'auth' | 'save' | 'forget' | 'mutate' | null;
  active: LocalState;
  profiles: Profile[];
  context: Context | null;
  domainInput: string;
  tabDomain: string | null;
  selectedList: string;
  originInput: string;
  suggestion: string | null;
  checked: { origin: string; lists: string[]; version: string | null } | null;
  defaultList: string;
  authMode: 'session' | 'local' | null;
  password: string;
  remember: boolean;
  setupNotice: Notice | null;
  mainNotice: Notice | null;
}

export function validOrigin(value: string): string | null {
  try { return normalizeApiOrigin(value); } catch { return null; }
}

/** UI state machine only. All router writes and authentication stay in the worker. */
export class PopupModel {
  private listeners = new Set<() => void>();
  private domainRevision = 0;
  private freshCredential: string | null = null;
  private startPromise: Promise<void> | null = null;
  private state: PopupState = {
    language: 'ru', screen: 'main', step: 'address', busy: 'load',
    settingsView: 'wizard', removeCandidate: null,
    active: { ok: true, type: 'LOCAL_STATE', apiOrigin: null, defaultList: null, authMode: null },
    profiles: [], context: null, domainInput: '', tabDomain: null, selectedList: '',
    originInput: '', suggestion: null, checked: null, defaultList: '', authMode: null,
    password: '', remember: false, setupNotice: null, mainNotice: null,
  };
  constructor(private readonly port: PopupPort) {}
  getSnapshot = (): PopupState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private update(patch: Partial<PopupState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  private async send(request: PopupRequest): Promise<BackgroundResponse> {
    try { return await this.port.send(request); }
    catch { return { ok: false, code: 'UI_REQUEST_FAILED', message: '' }; }
  }
  private failure(response: BackgroundResponse): Notice {
    return { status: 'danger', text: c => response.ok ? c.unexpectedResponse
      : response.code === 'UI_REQUEST_FAILED' ? c.requestFailed
        : c.backgroundFailure(response.code, response.message, response.diagnostic) };
  }
  private async profiles(): Promise<BackgroundResponse> {
    const response = await this.send({ type: 'GET_CONNECTIONS' });
    if (response.ok && response.type === 'CONNECTIONS') this.update({ profiles: response.connections });
    return response;
  }
  start = (): Promise<void> => this.startPromise ??= this.initialize();
  private async initialize(): Promise<void> {
    const [language, local, connections] = await Promise.all([
      this.port.loadLanguage().catch(() => 'ru' as const),
      this.send({ type: 'GET_LOCAL_STATE' }), this.profiles(),
    ]);
    this.update({ language: parseUiLanguage(language), ...(local.ok && local.type === 'LOCAL_STATE'
      ? { active: local, originInput: local.apiOrigin ?? '', authMode: local.authMode } : {}) });
    await this.loadContext();
    this.update({ busy: null });
    try {
      const staged = validOrigin(this.port.loadPendingCredential() ?? '');
      if (staged && (!local.ok || local.type !== 'LOCAL_STATE' || !connections.ok || connections.type !== 'CONNECTIONS')) {
        // Unknown storage state is not proof that a credential is still uncommitted.
        this.freshCredential = staged;
        this.update({ screen: 'settings', settingsView: 'wizard', step: 'address', originInput: staged,
          setupNotice: this.failure(!local.ok || local.type !== 'LOCAL_STATE' ? local : connections) });
        return;
      }
      if (staged && (staged === this.state.active.apiOrigin || this.state.profiles.some(p => p.apiOrigin === staged))) {
        // Save may have completed just before the popup closed. Never erase its credential.
        this.port.savePendingCredential(null);
      } else { this.freshCredential = staged; }
      const pending = this.port.loadPendingOrigin() ?? this.freshCredential;
      if (!pending) return;
      const origin = validOrigin(pending);
      if (!origin || (origin === this.state.active.apiOrigin && this.state.context
        && this.state.selectedList)) {
        this.port.savePendingOrigin(null);
        return;
      }
      this.beginConnection();
      this.setOrigin(origin);
      if (await this.port.hasOriginPermission(origin)) await this.checkConnection(false);
    } catch { this.update({ setupNotice: { status: 'danger', text: c => c.requestFailed } }); }
  }
  private async loadContext(input?: string, preferred?: string): Promise<void> {
    const revision = this.domainRevision;
    const origin = this.state.active.apiOrigin;
    const response = await this.send({ type: 'GET_CONTEXT', ...(input !== undefined ? { domainInput: input } : {}),
      ...(origin ? { expectedOrigin: origin } : {}) });
    if (revision !== this.domainRevision) return;
    if (response.ok && response.type === 'CONTEXT') {
      const selected = preferred && response.lists.includes(preferred) ? preferred
        : response.defaultList && response.lists.includes(response.defaultList) ? response.defaultList : '';
      this.update({ context: response, domainInput: response.domain ?? '',
        tabDomain: response.tabDomain !== undefined ? response.tabDomain : input === undefined
          ? response.domain : this.state.tabDomain,
        selectedList: selected, mainNotice: null,
        active: { ...this.state.active, apiOrigin: response.apiOrigin, defaultList: response.defaultList } });
    } else if (response.ok && response.type === 'SETUP_CONTEXT') {
      this.update({ screen: 'settings', settingsView: 'wizard', step: 'address', context: null,
        suggestion: response.apiOriginCandidate, originInput: '', setupNotice: null });
    } else if (!response.ok && response.code === 'API_AUTH_REQUIRED' && origin) {
      this.update({ screen: 'settings', settingsView: 'wizard', step: 'access', context: null, originInput: origin,
        authMode: null, password: '', remember: false, setupNotice: null });
    } else {
      this.update({ context: null, mainNotice: this.failure(response),
        ...(!origin ? { screen: 'settings' as const, setupNotice: this.failure(response) } : {}) });
    }
  }
  openSettings = (): void => {
    if (this.state.busy) return;
    if (!this.state.active.apiOrigin && !this.state.profiles.length) { this.beginConnection(); return; }
    this.update({ screen: 'settings', settingsView: 'connections', removeCandidate: null, setupNotice: null, password: '' });
  };
  beginConnection = (origin = ''): void => {
    if (this.state.busy) return;
    this.update({ screen: 'settings', settingsView: 'wizard', removeCandidate: null });
    this.setOrigin(origin);
  };
  editConnection = async (origin: string): Promise<void> => {
    if (this.state.busy || !this.state.profiles.some(p => p.apiOrigin === origin)) return;
    this.beginConnection(origin);
    await this.checkConnection();
  };
  useConnection = async (origin: string): Promise<void> => {
    if (this.state.busy || !this.state.profiles.some(p => p.apiOrigin === origin)) return;
    this.beginConnection(origin);
    await this.checkConnection();
    if (this.state.checked?.origin === origin && this.state.checked.lists.includes(this.state.defaultList)) {
      await this.saveSettings();
    }
  };
  returnToConnections = async (): Promise<void> => {
    if (this.state.busy) return;
    this.update({ busy: 'forget' });
    if (!await this.discardFreshCredential()) { this.update({ busy: null }); return; }
    try { this.port.savePendingOrigin(null); }
    catch { this.update({ busy: null, setupNotice: { status: 'danger', text: c => c.requestFailed } }); return; }
    await this.profiles();
    this.update({ screen: 'settings', settingsView: 'connections', busy: null,
      checked: null, password: '', removeCandidate: null, setupNotice: null });
  };
  requestRemove = (origin: string): void => {
    if (!this.state.busy && this.state.profiles.some(p => p.apiOrigin === origin)) {
      this.update({ removeCandidate: origin, setupNotice: null });
    }
  };
  cancelRemove = (): void => { if (!this.state.busy) this.update({ removeCandidate: null }); };
  removeConnection = async (): Promise<void> => {
    const origin = this.state.removeCandidate;
    if (!origin || this.state.busy) return;
    this.update({ busy: 'forget', setupNotice: null });
    const result = await this.send({ type: 'REMOVE_CONNECTION', apiOrigin: origin });
    const removed = result.ok && result.type === 'CONNECTION_REMOVED';
    if (removed) {
      this.update({ profiles: this.state.profiles.filter(p => p.apiOrigin !== origin),
        ...(origin === this.state.active.apiOrigin ? {
          active: { ok: true, type: 'LOCAL_STATE', apiOrigin: null, defaultList: null, authMode: null },
          context: null, selectedList: '', checked: null, originInput: '',
        } : {}) });
    } else if (!result.ok && result.code === 'CONNECTION_REMOVE_FAILED') {
      this.update({ profiles: this.state.profiles.map(p => p.apiOrigin === origin ? { ...p, authMode: null } : p),
        ...(origin === this.state.active.apiOrigin ? { active: { ...this.state.active, authMode: null }, context: null } : {}) });
    }
    // Refresh even after a partial failure, e.g. credential removed but profile write failed.
    const profiles = await this.profiles();
    const local = await this.send({ type: 'GET_LOCAL_STATE' });
    if (local.ok && local.type === 'LOCAL_STATE') {
      this.update({ active: local, ...(local.apiOrigin !== this.state.active.apiOrigin
        ? { context: null, selectedList: '', checked: null } : {}) });
    }
    this.update({ busy: null, removeCandidate: null, setupNotice:
      !removed ? this.failure(result) : !profiles.ok || profiles.type !== 'CONNECTIONS'
        ? this.failure(profiles) : !local.ok || local.type !== 'LOCAL_STATE' ? this.failure(local) : null });
  };
  setOrigin = (value: string): void => {
    if (this.state.busy) return;
    const origin = validOrigin(value);
    this.update({ originInput: value, step: 'address', checked: null, defaultList: '',
      authMode: this.state.profiles.find(p => p.apiOrigin === origin)?.authMode
        ?? (origin === this.state.active.apiOrigin ? this.state.active.authMode : null),
      password: '', remember: false, setupNotice: null });
  };
  setDefaultList = (value: string): void => { if (!this.state.busy) this.update({ defaultList: value }); };
  setPassword = (value: string): void => { if (!this.state.busy) this.update({ password: value }); };
  setRemember = (value: boolean): void => { if (!this.state.busy) this.update({ remember: value }); };
  back = (): void => {
    if (this.state.busy) return;
    this.update({ step: 'address', checked: null, defaultList: '', setupNotice: null,
      password: '' });
  };
  cancel = async (): Promise<void> => {
    if (this.state.busy || !this.state.active.apiOrigin) return;
    this.update({ busy: 'forget' });
    if (!await this.discardFreshCredential()) { this.update({ busy: null }); return; }
    try { this.port.savePendingOrigin(null); }
    catch { this.update({ busy: null, setupNotice: { status: 'danger', text: c => c.requestFailed } }); return; }
    this.update({ screen: 'main', busy: null, checked: null, password: '',
      setupNotice: null, authMode: this.state.active.authMode });
  };
  private async discardFreshCredential(): Promise<boolean> {
    if (!this.freshCredential) return true;
    // Recheck persisted ownership before deletion, including after reopening and
    // if another popup committed the same origin. A failed read must preserve it.
    const [connections, local] = await Promise.all([
      this.send({ type: 'GET_CONNECTIONS' }), this.send({ type: 'GET_LOCAL_STATE' }),
    ]);
    if (!connections.ok || connections.type !== 'CONNECTIONS') {
      this.update({ setupNotice: this.failure(connections) }); return false;
    }
    if (!local.ok || local.type !== 'LOCAL_STATE') {
      this.update({ setupNotice: this.failure(local) }); return false;
    }
    const saved = local.apiOrigin === this.freshCredential
      || connections.connections.some(p => p.apiOrigin === this.freshCredential);
    if (!saved) {
      const response = await this.send({ type: 'AUTH_FORGET', apiOrigin: this.freshCredential });
      if (!response.ok || response.type !== 'AUTH_FORGOTTEN') {
        this.update({ setupNotice: this.failure(response) }); return false;
      }
    }
    try { this.port.savePendingCredential(null); }
    catch { this.update({ setupNotice: { status: 'danger', text: c => c.requestFailed } }); return false; }
    this.freshCredential = null;
    return true;
  }
  checkConnection = async (requestPermission = true): Promise<void> => {
    if (this.state.busy) return;
    const origin = validOrigin(this.state.originInput);
    if (!origin) { this.update({ setupNotice: { status: 'danger', text: c => c.invalidOrigin } }); return; }
    this.update({ settingsView: 'wizard', busy: 'check', setupNotice: null, checked: null, originInput: origin });
    try {
      // Must precede any await and preserve the direct user gesture for Chrome.
      this.port.savePendingOrigin(origin);
      const allowed = requestPermission ? await this.port.requestOriginPermission(origin)
        : await this.port.hasOriginPermission(origin);
      if (!allowed) { this.update({ setupNotice: { status: 'danger', text: c => c.accessDenied } }); return; }
      if (this.freshCredential && this.freshCredential !== origin
        && !await this.discardFreshCredential()) return;
      try { await this.port.prepareLocalNetworkAccess(origin); } catch { /* Worker provides authoritative API diagnostics. */ }
      await this.acceptConnection(origin, await this.send({ type: 'CHECK_SETTINGS', apiOrigin: origin }));
    } catch { this.update({ setupNotice: { status: 'danger', text: c => c.requestFailed } }); }
    finally { this.update({ busy: null }); }
  };
  private async acceptConnection(origin: string, response: BackgroundResponse): Promise<void> {
    if (!response.ok && response.code === 'API_AUTH_REQUIRED') {
      this.update({ step: 'access', authMode: null, password: '', remember: false,
        setupNotice: null });
    } else if (response.ok && response.type === 'CONNECTION') {
      const preferred = this.state.profiles.find(p => p.apiOrigin === origin)?.defaultList
        ?? (origin === this.state.active.apiOrigin ? this.state.active.defaultList : null);
      this.update({ step: 'list', checked: { origin, lists: response.lists, version: response.version },
        defaultList: preferred && response.lists.includes(preferred) ? preferred : '', setupNotice: null });
    } else { this.update({ setupNotice: this.failure(response) }); }
  }
  connectAuth = async (): Promise<void> => {
    if (this.state.busy || this.state.step !== 'access') return;
    const origin = validOrigin(this.state.originInput);
    if (!origin) { this.back(); return; }
    if (!this.state.password) return;
    if (origin !== this.state.active.apiOrigin && !this.state.profiles.some(p => p.apiOrigin === origin)) {
      try { this.port.savePendingCredential(origin); this.freshCredential = origin; }
      catch { this.update({ setupNotice: { status: 'danger', text: c => c.requestFailed } }); return; }
    }
    this.update({ busy: 'auth', setupNotice: null });
    const response = await this.send({ type: 'AUTH_CONNECT', apiOrigin: origin,
      password: this.state.password, remember: this.state.remember,
      // Only an intentional submit after the visible HTTP warning authorizes this origin.
      allowInsecureHttp: origin.startsWith('http:') });
    this.update({ password: '' });
    if (response.ok && response.type === 'AUTH_CONNECTED') {
      this.update({ authMode: response.mode, active: origin === this.state.active.apiOrigin
        ? { ...this.state.active, authMode: response.mode } : this.state.active });
      await this.acceptConnection(origin, await this.send({ type: 'CHECK_SETTINGS', apiOrigin: origin }));
    } else { this.update({ setupNotice: this.failure(response) }); }
    this.update({ busy: null });
  };
  forgetAuth = async (): Promise<void> => {
    if (this.state.busy) return;
    const origin = validOrigin(this.state.originInput);
    if (!origin) return;
    this.update({ busy: 'forget', context: origin === this.state.active.apiOrigin ? null : this.state.context });
    const response = await this.send({ type: 'AUTH_FORGET', apiOrigin: origin });
    this.update({ busy: null, checked: null, step: 'access', password: '', remember: false,
      authMode: null,
      active: origin === this.state.active.apiOrigin ? { ...this.state.active, authMode: null } : this.state.active,
      setupNotice: response.ok && response.type === 'AUTH_FORGOTTEN'
        ? null : this.failure(response) });
    if (response.ok) await this.profiles();
  };
  saveSettings = async (): Promise<void> => {
    const { checked, defaultList, selectedList, active } = this.state;
    if (this.state.busy || !checked || !checked.lists.includes(defaultList)) return;
    this.update({ busy: 'save', setupNotice: null });
    const response = await this.send({ type: 'SAVE_SETTINGS', apiOrigin: checked.origin, defaultList });
    if (!response.ok || response.type !== 'SETTINGS_SAVED') {
      this.update({ busy: null, setupNotice: this.failure(response) }); return;
    }
    this.freshCredential = null;
    let checkpointFailed = false;
    try { this.port.savePendingOrigin(null); this.port.savePendingCredential(null); } catch { checkpointFailed = true; }
    this.update({ active: { ok: true, type: 'LOCAL_STATE', apiOrigin: checked.origin,
      defaultList, authMode: this.state.authMode }, screen: 'main', checked: null, password: '',
      suggestion: null, setupNotice: null });
    await this.profiles();
    await this.loadContext(undefined, active.apiOrigin === checked.origin ? selectedList : defaultList);
    if (checkpointFailed) this.update({ mainNotice: { status: 'warning', text: c => c.requestFailed } });
    this.update({ busy: null });
  };
  setDomainInput = (value: string): void => {
    if (this.state.busy === 'mutate') return;
    this.domainRevision++;
    this.update({ domainInput: value, context: this.state.context ? { ...this.state.context, domain: null } : null,
      mainNotice: null });
  };
  setSelectedList = (value: string): void => {
    if (!this.state.busy) this.update({ selectedList: value, mainNotice: null });
  };
  checkDomain = async (fromTab = false): Promise<void> => {
    if (this.state.busy || !this.state.active.apiOrigin) return;
    const parsed = deriveDomainInput(fromTab ? this.state.tabDomain ?? '' : this.state.domainInput);
    if (!parsed.ok) { this.update({ mainNotice: { status: 'danger', text: c => c.invalidDomain } }); return; }
    this.domainRevision++;
    this.update({ domainInput: parsed.domain, busy: 'check', mainNotice: null,
      context: this.state.context ? { ...this.state.context, domain: null } : null });
    await this.loadContext(parsed.domain, this.state.selectedList);
    this.update({ busy: null });
  };
  retry = async (): Promise<void> => {
    if (this.state.busy) return;
    this.update({ busy: 'load', mainNotice: null });
    const parsed = deriveDomainInput(this.state.domainInput);
    await this.loadContext(parsed.ok ? parsed.domain : undefined, this.state.selectedList);
    this.update({ busy: null });
  };
  mutate = async (): Promise<void> => {
    const { context, selectedList, active } = this.state;
    if (this.state.busy || !context?.domain || !context.lists.includes(selectedList) || !active.apiOrigin) return;
    const selection = deriveDomainSelectionState(selectedList, context.memberships);
    this.update({ busy: 'mutate', mainNotice: null });
    const response = await this.send({ type: 'MUTATE_DOMAIN', action: selection.action,
      domain: context.domain, list: selectedList, expectedOrigin: active.apiOrigin });
    if (response.ok && response.type === 'MUTATION_RESULT') this.mutationResult(response.result);
    else if (!response.ok && response.code === 'API_AUTH_REQUIRED') {
      this.update({ screen: 'settings', settingsView: 'wizard', step: 'access', originInput: active.apiOrigin,
        context: null, authMode: null, setupNotice: null });
    } else this.update({ mainNotice: this.failure(response) });
    this.update({ busy: null });
  };
  private mutationResult(outcome: DomainMutationOutcome): void {
    const context = this.state.context;
    if (context && 'memberships' in outcome && outcome.memberships) {
      this.update({ context: { ...context, memberships: outcome.memberships } });
    }
    let notice: Notice;
    if (outcome.status === 'applied-and-verified' || outcome.status === 'unchanged') {
      const others = deriveDomainSelectionState(outcome.list, outcome.memberships).otherLists;
      notice = { status: others.length && outcome.action === 'remove' ? 'warning' : 'success', text: c =>
        outcome.action === 'add' ? c.addedTo(outcome.list) : others.length
          ? c.removedStillIn(outcome.list, others) : c.removedReady(outcome.list) };
    } else if (outcome.status === 'applied-unverified') {
      notice = { status: 'warning', text: c => c.changedVerificationPending(outcome.action, outcome.reason) };
    } else if (outcome.status === 'blocked') {
      notice = { status: 'danger', text: c => outcome.reason === 'draft' ? c.draftBlocked : c.listUnavailable };
    } else {
      const uncertainStage = outcome.phase === 'stage' && outcome.writeMayHaveCompleted;
      notice = { status: outcome.writeMayHaveCompleted ? 'warning' : 'danger', text: c =>
        outcome.reason === 'save-outcome-unknown' ? c.saveUnknown : uncertainStage ? c.stageUncertain(outcome.reason)
          : outcome.writeMayHaveCompleted ? c.writeFailed(outcome.reason) : c.operationFailed(outcome.reason) };
      // Unknown/failed writes need an explicit recheck, never automatic POST retry.
      if (context) this.update({ context: { ...context, domain: null } });
    }
    this.update({ mainNotice: notice });
  }
  changeLanguage = async (language: UiLanguage): Promise<void> => {
    this.update({ language });
    try { await this.port.saveLanguage(language); }
    catch { this.update({ mainNotice: { status: 'warning', text: c => c.languagePersistenceFailed } }); }
  };
  get copy(): PopupCopy { return getPopupCopy(this.state.language); }
}
