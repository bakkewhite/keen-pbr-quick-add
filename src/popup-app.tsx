import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Alert } from '@heroui/react/alert';
import { AlertDialog } from '@heroui/react/alert-dialog';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import { Button } from '@heroui/react/button';
import { Checkbox } from '@heroui/react/checkbox';
import { Input } from '@heroui/react/input';
import { InputGroup } from '@heroui/react/input-group';
import { Label } from '@heroui/react/label';
import { ListBox } from '@heroui/react/list-box';
import { Select } from '@heroui/react/select';
import { TextField } from '@heroui/react/textfield';
import { Tooltip } from '@heroui/react/tooltip';
import { SetupProgress } from './setup-progress';
import { deriveDomainInput } from './domain';
import { deriveDomainSelectionState } from './domain-state';
import { getPopupCopy } from './i18n';
import { PopupModel, validOrigin, type Notice, type PopupState } from './popup-model';

function Icon({ name }: { name: string }) {
  return <span className="ui-icon" style={{ maskImage: `url(icons/${name}.svg)` }} aria-hidden="true" />;
}
function IconAction({ label, icon, onPress, disabled = false }: {
  label: string; icon: string; onPress(): void; disabled?: boolean;
}) {
  return <Tooltip delay={200}>
    <Button isIconOnly size="sm" variant="ghost" aria-label={label} onPress={onPress} isDisabled={disabled}>
      <Icon name={icon} />
    </Button>
    <Tooltip.Content placement="bottom">{label}</Tooltip.Content>
  </Tooltip>;
}
function InfoTooltip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Tooltip delay={200} isOpen={open} onOpenChange={setOpen}>
    <Button isIconOnly size="sm" variant="ghost" aria-label={label}
      onHoverChange={setOpen} onPress={() => setOpen(!open)}><Icon name="info" /></Button>
    <Tooltip.Content placement="bottom" className="information-tooltip">{children}</Tooltip.Content>
  </Tooltip>;
}
function Choice({ label, value, options, onChange, placeholder, disabled = false, loading = false, help, activeLabel }: {
  label: string; value: string; options: { id: string; label: string; active?: boolean }[];
  onChange(value: string): void; placeholder: string; disabled?: boolean;
  loading?: boolean; help?: string; activeLabel?: string;
}) {
  return <div className="choice-field">
    <div className="field-heading"><span className="label">{label}</span>
      {help && <InfoTooltip label={label + ' — ' + (document.documentElement.lang === 'ru' ? 'справка' : 'help')}>{help}</InfoTooltip>}
    </div>
    <Select fullWidth aria-label={label} value={value || null} isDisabled={disabled}
      placeholder={placeholder} onChange={key => onChange(typeof key === 'string' ? key : '')}>
    <Select.Trigger><Select.Value>{loading ? <span className="loading-skeleton field-placeholder" aria-hidden="true" /> : undefined}</Select.Value><Select.Indicator /></Select.Trigger>
    <Select.Popover><ListBox>
      {options.map(option => <ListBox.Item key={option.id} id={option.id} textValue={option.label}
        className={activeLabel ? 'connection-option' : ''}
        aria-label={option.label + (option.active && activeLabel ? ' · ' + activeLabel : '')}>
        <span className="choice-option-label">{option.label}</span>
        {activeLabel ? <span className="connection-option-indicators">
          <ListBox.ItemIndicator />
          {option.active && <span className="status-dot text-success" role="img" aria-label={activeLabel} />}
        </span> : <ListBox.ItemIndicator />}
      </ListBox.Item>)}
    </ListBox></Select.Popover>
    </Select>
  </div>;
}
function CheckBox({ children, value, onChange, disabled = false }: {
  children: ReactNode; value: boolean; onChange(value: boolean): void; disabled?: boolean;
}) {
  return <Checkbox isSelected={value} onChange={onChange} isDisabled={disabled}>
    <Checkbox.Content><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>{children}</Checkbox.Content>
  </Checkbox>;
}
function Feedback({ notice, language, compact = false }: { notice: Notice | null; language: PopupState['language']; compact?: boolean }) {
  if (!notice) return null;
  if (compact) return <div className="inline-feedback" data-status={notice.status}
    role={notice.status === 'danger' ? 'alert' : 'status'}>
    <Icon name={notice.status === 'success' ? 'check_circle' : notice.status === 'danger' ? 'error' : 'info'} />
    <span>{notice.text(getPopupCopy(language))}</span>
  </div>;
  return <Alert status={notice.status} role={notice.status === 'danger' ? 'alert' : 'status'}>
    <Alert.Indicator /><Alert.Content><Alert.Description>{notice.text(getPopupCopy(language))}</Alert.Description></Alert.Content>
  </Alert>;
}

export function PopupApp({ model }: { model: PopupModel }) {
  const s = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const c = getPopupCopy(s.language);
  const ru = s.language === 'ru';
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { void model.start(); }, [model]);
  useEffect(() => { document.documentElement.lang = s.language; }, [s.language]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [s.screen, s.settingsView, s.step]);
  const isSettings = s.screen === 'settings';
  const isManager = isSettings && s.settingsView === 'connections';
  const canLeaveWizard = !!s.active.apiOrigin || s.profiles.length > 0;
  const busy = s.busy !== null;
  const origin = validOrigin(s.originInput);
  const steps = ru ? ['Адрес', 'Доступ', 'Список'] : ['Address', 'Access', 'List'];
  const step = ['address', 'access', 'list'].indexOf(s.step);
  return <div id="app" className="bg-background text-foreground">
    <header className="popup-header">
      {isSettings && (isManager ? !!s.active.apiOrigin : canLeaveWizard)
        ? <IconAction icon="arrow_back" label={c.backAction} disabled={busy}
          onPress={() => void (isManager ? model.cancel() : model.returnToConnections())} />
        : <img className="brand-mark" src="icons/keen-pbr.svg" alt="" />}
      <h1>{isManager ? c.connectionsTitle : isSettings ? c.settingsTitle : 'keen-pbr'}</h1>
      <div className="header-actions">
        {isSettings ? <div role="group" aria-label={c.languageAction} className="language-controls">
          {(['en', 'ru'] as const).map(language => <Button key={language} size="sm"
            variant={language === s.language ? 'secondary' : 'ghost'} aria-pressed={language === s.language}
            onPress={() => void model.changeLanguage(language)}>{language.toUpperCase()}</Button>)}
        </div> : <IconAction icon="settings" label={c.settingsAction} disabled={busy} onPress={model.openSettings} />}
      </div>
    </header>
    <main className="popup-body" aria-busy={busy}>
      {isSettings ? isManager ? <ConnectionManager model={model} state={s} /> : <>
        <SetupProgress steps={steps} current={step} label={c.connectionLabel} />
        <section className="setup-stage" aria-labelledby="stage-title">
          <div className="stage-heading">
            <h2 id="stage-title" ref={heading} tabIndex={-1} className={s.step !== 'address' ? 'sr-only' : ''}>
              {s.step === 'address' ? (ru ? 'К какому роутеру подключиться?' : 'Which router?')
                : s.step === 'access' ? c.authTitle : c.defaultListLabel}
            </h2>
            {s.step === 'address' && <InfoTooltip label={c.connectionInfo}>{c.connectionScenario}</InfoTooltip>}
          </div>
          {s.step === 'address' && <>
            <p className="text-muted text-sm">{ru ? 'Укажите адрес Web UI keen-pbr, не основной админки Keenetic.'
              : 'Use the keen-pbr Web UI address, not the main Keenetic admin page.'}</p>
            <TextField fullWidth value={s.originInput} onChange={model.setOrigin} isDisabled={busy}>
              <Label>{ru ? 'Адрес keen-pbr' : 'keen-pbr address'}</Label>
              <InputGroup><InputGroup.Input id="api-origin" placeholder="https://keen-pbr.example.keenetic.pro"
                autoComplete="url" spellCheck={false} onKeyDown={e => {
                  if (e.key === 'Enter' && origin && !busy) { e.preventDefault(); void model.checkConnection(); }
                }} />
                {origin && <InputGroup.Suffix><IconAction icon="open_in_new" label={c.openAddress}
                  onPress={() => window.open(origin + '/', '_blank', 'noopener,noreferrer')} /></InputGroup.Suffix>}
              </InputGroup>
            </TextField>
            <div className="address-shortcuts">
              {origin !== 'http://my.keenetic.net:12121' && <Button size="sm" variant="ghost" isDisabled={busy}
                onPress={() => model.setOrigin('http://my.keenetic.net:12121')}>
                {c.useKeeneticOrigin}
              </Button>}
              {s.suggestion && s.suggestion !== origin && <Button size="sm" variant="ghost" isDisabled={busy}
                onPress={() => model.setOrigin(s.suggestion ?? '')}>{c.useCurrentTab}</Button>}
            </div>
            <p className="text-muted text-xs">{ru ? 'HTTPS — дома и удалённо. Локальный адрес — в сети роутера или через VPN.'
              : 'HTTPS works locally and remotely. A local address needs the router network or a VPN.'}</p>
          </>}
          {s.step === 'access' && <>
            <div className="connection-summary">
              <p className="endpoint text-sm">{origin}</p>
              <p className="connection-result text-danger" role="status"><Icon name="error" />
                {ru ? 'Требуется вход в keen-pbr' : 'Sign in to keen-pbr required'}</p>
            </div>
            <TextField fullWidth type="password" value={s.password} onChange={model.setPassword} isDisabled={busy}>
              <div className="field-heading"><Label>{c.passwordLabel}</Label>
                <InfoTooltip label={c.passwordLabel + ' — ' + (ru ? 'справка' : 'help')}>{c.authHelp}</InfoTooltip></div>
              <Input id="auth-password" autoComplete="current-password"
                aria-describedby={origin?.startsWith('http:') ? 'http-warning' : undefined}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void model.connectAuth(); } }} />
            </TextField>
            {origin?.startsWith('http:') && <p id="http-warning" className="http-warning text-xs text-muted">{c.httpWarning}</p>}
            <CheckBox value={s.remember} onChange={model.setRemember} disabled={busy}>{c.rememberLabel}</CheckBox>
            {s.remember && <p className="text-muted text-xs">{c.rememberHelp}</p>}
          </>}
          {s.step === 'list' && s.checked && <>
            <div className="connection-summary">
              <p className="endpoint text-sm">{s.checked.origin}</p>
              <div className="connection-result" role="status"><Icon name="check_circle" /><span>{c.connected(s.checked.version)}</span></div>
            </div>
            <Choice label={c.defaultListLabel} value={s.defaultList} placeholder={c.chooseList} disabled={busy}
              help={c.defaultListHelp}
              options={s.checked.lists.map(name => ({ id: name, label: name }))} onChange={model.setDefaultList} />
            {!s.checked.lists.length && <p role="alert" className="text-danger">{c.listUnavailable}</p>}
            {s.authMode && <div className="credential-summary">
              <span className="text-muted text-xs">{s.authMode === 'local' ? c.authLocal : c.authSession}</span>
              <Button variant="ghost" size="sm" isDisabled={busy} onPress={() => void model.forgetAuth()}>{c.forgetAuth}</Button>
            </div>}
          </>}
          <Feedback notice={s.setupNotice} language={s.language} />
          <div className="wizard-actions">
            {s.step === 'address' ? canLeaveWizard && <Button variant="ghost" isDisabled={busy}
              onPress={() => void model.returnToConnections()}>{c.cancelConnection}</Button>
              : <Button variant="ghost" isDisabled={busy} onPress={model.back}>{c.backAction}</Button>}
            <Button className="grow" isPending={busy} isDisabled={busy || (s.step === 'address' ? !origin
              : s.step === 'access' ? !s.password
                : !s.checked?.lists.includes(s.defaultList))}
              onPress={() => void (s.step === 'address' ? model.checkConnection()
                : s.step === 'access' ? model.connectAuth() : model.saveSettings())}>
              {busy ? c.checking : s.step === 'list' ? c.save : (ru ? 'Продолжить' : 'Continue')}
            </Button>
          </div>
        </section>
      </> : <DomainScreen model={model} state={s} />}
    </main>
  </div>;
}

function ConnectionManager({ model, state: s }: { model: PopupModel; state: PopupState }) {
  const c = getPopupCopy(s.language);
  const busy = s.busy !== null;
  const [selectedOrigin, setSelectedOrigin] = useState('');
  const profiles = [...s.profiles].sort((a, b) => Number(b.apiOrigin === s.active.apiOrigin) - Number(a.apiOrigin === s.active.apiOrigin));
  const selected = profiles.find(profile => profile.apiOrigin === selectedOrigin);
  return <section className="connection-manager" aria-label={c.savedConnections}>
    {s.active.apiOrigin ? <Card className="active-profile-card">
      <Card.Content>
        <Chip color="success" variant="soft" size="sm" className="active-profile-chip">
          <span className="status-dot" aria-hidden="true" /><Chip.Label>{c.activeConnectionLabel}</Chip.Label>
        </Chip>
        <p className="endpoint text-sm font-medium">{s.active.apiOrigin}</p>
      </Card.Content>
    </Card> : <p className="text-muted text-sm">{c.noConnection}</p>}
    {profiles.length > 0 && <div className="saved-connection-picker">
      <Choice label={c.savedConnections} value={selected?.apiOrigin ?? ''} disabled={busy}
        placeholder={c.chooseConnection} onChange={setSelectedOrigin} activeLabel={c.activeConnectionLabel}
        options={profiles.map(profile => ({ id: profile.apiOrigin,
          label: profile.apiOrigin, active: profile.apiOrigin === s.active.apiOrigin }))} />
      {selected && <div className="connection-actions">
        {selected.apiOrigin !== s.active.apiOrigin && <Button size="sm" isDisabled={busy}
          onPress={() => void model.useConnection(selected.apiOrigin)}>{c.useSaved}</Button>}
        <Button size="sm" variant="ghost" isDisabled={busy}
          onPress={() => void model.editConnection(selected.apiOrigin)}>{c.editSaved}</Button>
        <Button size="sm" variant="danger-soft" aria-label={c.removeSaved + ' ' + selected.apiOrigin} isDisabled={busy}
          onPress={() => model.requestRemove(selected.apiOrigin)}>{c.removeSaved}</Button>
      </div>}
    </div>}
    <Feedback notice={s.setupNotice} language={s.language} />
    <Button fullWidth variant={profiles.length ? 'secondary' : 'primary'} isDisabled={busy}
      onPress={() => model.beginConnection()}>{c.addConnection}</Button>
    {s.removeCandidate && <AlertDialog.Backdrop isOpen onOpenChange={open => { if (!open) model.cancelRemove(); }} isKeyboardDismissDisabled={busy}>
        <AlertDialog.Container size="xs">
          <AlertDialog.Dialog>
            <AlertDialog.Header><AlertDialog.Heading>{c.removeConnectionTitle}</AlertDialog.Heading></AlertDialog.Header>
            <AlertDialog.Body><p className="endpoint text-sm">{s.removeCandidate}</p>
              <p className="text-muted text-sm">{c.removeConnectionHelp}</p></AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="ghost" isDisabled={busy} onPress={model.cancelRemove}>{c.cancelConnection}</Button>
              <Button variant="danger" isPending={busy} isDisabled={busy} onPress={() => void model.removeConnection()}>{c.removeSaved}</Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
    </AlertDialog.Backdrop>}
  </section>;
}

function DomainScreen({ model, state: s }: { model: PopupModel; state: PopupState }) {
  const c = getPopupCopy(s.language);
  const parsed = deriveDomainInput(s.domainInput);
  const selection = deriveDomainSelectionState(s.selectedList, s.context?.memberships ?? []);
  const busy = s.busy !== null;
  const checking = s.busy === 'load' || s.busy === 'check' || s.busy === 'save';
  const inputLoading = checking && !s.context && !s.domainInput;
  const verified = !!s.context?.domain && parsed.ok && parsed.domain === s.context.domain;
  const inspection = verified ? s.context?.membershipInspection : undefined;
  const otherLists = [...new Set([...selection.otherLists, ...(inspection?.matchedLists ?? [])])]
    .filter(name => name !== s.selectedList);
  let notice = s.mainNotice;
  if (!notice && !busy) {
    if (!s.domainInput) notice = { status: 'warning', text: c => c.enterDomain };
    else if (!verified) notice = { status: 'warning', text: c => parsed.ok ? c.domainNeedsCheck : c.invalidDomain };
    else if (!s.selectedList) notice = { status: 'warning', text: c => c.defaultUnavailable };
    else if (selection.selectedPresent) notice = { status: 'success', text: c => c.presentInSelected(s.selectedList) };
    else if (selection.otherLists.length) notice = { status: 'warning', text: c => c.absentFromSelected(s.selectedList) };
    else if (inspection?.status === 'partial' || inspection?.status === 'unavailable') notice = {
      status: 'warning', text: c => c.absentFromSelected(s.selectedList) };
    else notice = { status: 'success', text: c => c.ready };
  }
  return <section className="domain-screen" data-state={checking ? 'checking' : verified ? 'ready' : 'idle'}>
    <div className="active-connection">
      <span className="endpoint context-text text-muted">{s.active.apiOrigin
        ?? <span className="loading-skeleton endpoint-placeholder" aria-hidden="true" />}</span>
      <IconAction icon="open_in_new" label={c.openWebUi} disabled={!s.active.apiOrigin}
        onPress={() => window.open(s.active.apiOrigin + '/', '_blank', 'noopener,noreferrer')} />
    </div>
    <TextField fullWidth value={s.domainInput} onChange={model.setDomainInput} isDisabled={busy}>
      <Label>{c.domainInputLabel}</Label><InputGroup>
        {inputLoading && <InputGroup.Prefix><span className="loading-skeleton field-placeholder" aria-hidden="true" /></InputGroup.Prefix>}
        <InputGroup.Input id="domain-input" placeholder={inputLoading ? '' : 'example.com'} autoComplete="off" spellCheck={false}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void model.checkDomain(); } }} />
        {parsed.ok && <InputGroup.Suffix><Button className="domain-check" size="sm" variant="ghost" isDisabled={busy || !s.active.apiOrigin}
          onPress={() => void model.checkDomain()}>{c.checkDomain}</Button></InputGroup.Suffix>}
      </InputGroup>
    </TextField>
    {s.tabDomain && (!parsed.ok || parsed.domain !== s.tabDomain) && <Button className="from-tab" size="sm"
      variant="ghost" isDisabled={busy} onPress={() => void model.checkDomain(true)}>{c.domainFromTab}</Button>}
    <Choice label={c.listLabel} value={s.selectedList} onChange={model.setSelectedList} placeholder={c.chooseList}
      disabled={busy || !s.context} loading={checking && !s.context}
      options={(s.context?.lists ?? []).map(name => ({ id: name, label: name }))} />
    <div className="domain-status-row">
      {checking ? <div className="domain-loading context-text text-muted" role="status">
        <span className="loading-indicator" aria-hidden="true" /><span>{c.checkingDomain}</span>
      </div> : <>
        <Feedback notice={notice} language={s.language} compact />
        {inspection?.status === 'partial' && <InfoTooltip label={c.membershipHelpLabel}>{c.externalPartial}</InfoTooltip>}
      </>}
    </div>
    {verified && <div className="membership-details text-xs text-muted">
      {otherLists.length > 0 && <>
        <p>{c.otherListsLabel}</p>
        <ul className="membership-chips" aria-label={c.otherListsLabel}>
          {otherLists.map(name => <li key={name}><Chip size="sm" variant="soft" className="membership-chip text-success">
            <span className="status-dot" aria-hidden="true" /><Chip.Label>{name}</Chip.Label>
          </Chip></li>)}
        </ul>
      </>}
      {inspection?.status === 'unavailable' && <p>{c.externalUnavailable}</p>}
    </div>}
    <div className="domain-action-slot">
      {checking ? <div className="loading-skeleton action-placeholder" aria-hidden="true" />
        : !s.context && s.active.apiOrigin ? <Button fullWidth variant="secondary" isDisabled={busy} onPress={() => void model.retry()}>{c.retryConnection}</Button>
        : <Button className="domain-action" fullWidth variant={selection.selectedPresent ? 'danger-soft' : 'primary'} isPending={s.busy === 'mutate'}
          isDisabled={busy || !verified || !s.context?.lists.includes(s.selectedList)} onPress={() => void model.mutate()}>
          {s.busy === 'mutate' ? selection.selectedPresent ? c.removing : c.adding
            : selection.selectedPresent ? c.remove(s.selectedList) : c.add(s.selectedList)}
        </Button>}
    </div>
    {!s.active.apiOrigin && !busy && <Button variant="secondary" onPress={model.openSettings}>
      {s.language === 'ru' ? 'Настроить подключение' : 'Set up connection'}
    </Button>}
  </section>;
}
