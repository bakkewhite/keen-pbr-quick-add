import { describe, expect, it } from 'vitest';
import { popupFixture, LAN, REMOTE } from './helpers/popup-port';
import { PopupModel } from '../src/popup-model';

describe('saved connection manager', () => {
  it('opens manager without resetting the active connection or list override', async () => {
    const f = popupFixture(); await f.model.start(); f.model.setSelectedList('other'); f.model.openSettings();
    expect(f.model.getSnapshot()).toMatchObject({ settingsView: 'connections', active: { apiOrigin: LAN }, selectedList: 'other' });
  });
  it('new wizard preserves the active profile', async () => {
    const f = popupFixture(); await f.model.start(); f.model.openSettings(); f.model.beginConnection();
    expect(f.model.getSnapshot()).toMatchObject({ settingsView: 'wizard', step: 'address', originInput: '', active: { apiOrigin: LAN } });
  });
  it('switches directly to a checked saved profile with its own default', async () => {
    const f = popupFixture(); f.profiles.push({ apiOrigin: REMOTE, defaultList: 'other', authMode: null });
    await f.model.start(); f.model.openSettings(); await f.model.useConnection(REMOTE);
    expect(f.model.getSnapshot()).toMatchObject({ screen: 'main', active: { apiOrigin: REMOTE, defaultList: 'other' }, selectedList: 'other' });
  });
  it('retaining host access for saved profiles is not an error after Save', async () => {
    const f = popupFixture(); await f.model.start(); f.model.beginConnection(REMOTE); await f.model.checkConnection(); f.model.setDefaultList('other');
    f.override(r => r.type === 'SAVE_SETTINGS' ? { ok: true, type: 'SETTINGS_SAVED', oldPermissionRemoved: false } : undefined);
    await f.model.saveSettings();
    expect(f.model.getSnapshot().mainNotice).toBeNull();
  });
  it('failed switch keeps the original active router', async () => {
    const f = popupFixture(); f.profiles.push({ apiOrigin: REMOTE, defaultList: 'other', authMode: null });
    await f.model.start(); f.model.openSettings();
    f.override(r => r.type === 'CHECK_SETTINGS' ? { ok: false, code: 'API_UNAVAILABLE', message: 'offline' } : undefined);
    await f.model.useConnection(REMOTE);
    expect(f.model.getSnapshot()).toMatchObject({ active: { apiOrigin: LAN }, setupNotice: { status: 'danger' } });
  });
  it('expired credentials enter Access without switching routers', async () => {
    const f = popupFixture(); f.profiles.push({ apiOrigin: REMOTE, defaultList: 'other', authMode: null });
    f.authNeeded.add(REMOTE); await f.model.start(); f.model.openSettings(); await f.model.useConnection(REMOTE);
    expect(f.model.getSnapshot()).toMatchObject({ settingsView: 'wizard', step: 'access', active: { apiOrigin: LAN } });
  });
  it('vanished saved default requires explicit selection', async () => {
    const f = popupFixture(); f.profiles.push({ apiOrigin: REMOTE, defaultList: 'gone', authMode: null });
    await f.model.start(); f.model.openSettings(); await f.model.useConnection(REMOTE);
    expect(f.model.getSnapshot()).toMatchObject({ step: 'list', defaultList: '', active: { apiOrigin: LAN } });
  });
  it('canceling deletion preserves the profile', async () => {
    const f = popupFixture(); await f.model.start(); f.model.openSettings(); f.model.requestRemove(LAN); f.model.cancelRemove();
    expect(f.model.getSnapshot()).toMatchObject({ removeCandidate: null, active: { apiOrigin: LAN } });
    expect(f.profiles).toHaveLength(1);
  });
  it('deletes inactive profile and credential without changing active router', async () => {
    const f = popupFixture(); f.profiles.push({ apiOrigin: REMOTE, defaultList: 'other', authMode: null });
    f.authenticated.add(REMOTE); await f.model.start(); f.model.openSettings(); f.model.requestRemove(REMOTE); await f.model.removeConnection();
    expect(f.model.getSnapshot()).toMatchObject({ active: { apiOrigin: LAN, defaultList: 'local' }, removeCandidate: null });
    expect(f.model.getSnapshot().profiles.map(p => p.apiOrigin)).toEqual([LAN]);
    expect(f.authenticated.has(REMOTE)).toBe(false);
  });
  it('deleting active profile does not choose another saved router', async () => {
    const f = popupFixture(); f.profiles.push({ apiOrigin: REMOTE, defaultList: 'other', authMode: null });
    await f.model.start(); f.model.openSettings(); f.model.requestRemove(LAN); await f.model.removeConnection();
    expect(f.model.getSnapshot()).toMatchObject({ settingsView: 'connections', active: { apiOrigin: null }, context: null, selectedList: '' });
    expect(f.model.getSnapshot().profiles.map(p => p.apiOrigin)).toEqual([REMOTE]);
  });
  it('failed deletion does not claim success', async () => {
    const f = popupFixture(); await f.model.start(); f.model.openSettings(); f.model.requestRemove(LAN);
    f.override(r => r.type === 'REMOVE_CONNECTION' ? { ok: false, code: 'AUTH_FORGET_FAILED', message: 'failed' } : undefined);
    await f.model.removeConnection();
    expect(f.model.getSnapshot()).toMatchObject({ active: { apiOrigin: LAN }, setupNotice: { status: 'danger' } });
    expect(f.model.getSnapshot().profiles.map(p => p.apiOrigin)).toEqual([LAN]);
  });
  it.each(['GET_CONNECTIONS', 'GET_LOCAL_STATE'] as const)('clears a successfully deleted active profile even when %s fails', async (type) => {
    const f = popupFixture(); await f.model.start(); f.model.openSettings(); f.model.requestRemove(LAN);
    f.override(r => r.type === type ? { ok: false, code: 'INTERNAL_ERROR', message: 'storage unavailable' } : undefined);
    await f.model.removeConnection();
    expect(f.model.getSnapshot()).toMatchObject({ active: { apiOrigin: null }, context: null, selectedList: '', setupNotice: { status: 'danger' } });
    expect(f.model.getSnapshot().profiles).toEqual([]);
  });
  it('shows a partial delete failure and refreshes its removed credential', async () => {
    const f = popupFixture(); f.authenticated.add(LAN); await f.model.start(); f.model.openSettings(); f.model.requestRemove(LAN);
    f.override(r => {
      if (r.type !== 'REMOVE_CONNECTION') return;
      f.authenticated.delete(LAN);
      return { ok: false, code: 'CONNECTION_REMOVE_FAILED', message: 'profile write failed' };
    });
    await f.model.removeConnection();
    expect(f.model.getSnapshot()).toMatchObject({ active: { apiOrigin: LAN, authMode: null }, setupNotice: { status: 'danger' } });
    expect(f.model.getSnapshot().profiles.map(p => p.apiOrigin)).toEqual([LAN]);
  });
  it('canceling new setup discards only its new unsaved credential', async () => {
    const f = popupFixture(); f.authNeeded.add(REMOTE); await f.model.start(); f.model.openSettings();
    f.model.beginConnection(REMOTE); await f.model.checkConnection(); f.model.setPassword('test-only'); await f.model.connectAuth();
    await f.model.returnToConnections();
    expect(f.model.getSnapshot()).toMatchObject({ settingsView: 'connections', active: { apiOrigin: LAN }, password: '' });
    expect(f.authenticated.has(REMOTE)).toBe(false);
  });
  it('intentional HTTP submit works without a separate checkbox', async () => {
    const f = popupFixture(); f.authNeeded.add(LAN); await f.model.start(); f.model.setPassword('test-only'); await f.model.connectAuth();
    expect(f.model.getSnapshot()).toMatchObject({ step: 'list', password: '' });
    expect(f.authenticated.has(LAN)).toBe(true);
  });
  it('cancel after popup closure removes the credential of an unfinished new connection', async () => {
    const f = popupFixture(); f.authNeeded.add(REMOTE); await f.model.start();
    f.model.beginConnection(REMOTE); await f.model.checkConnection(); f.model.setPassword('test-only'); f.model.setRemember(true); await f.model.connectAuth();
    const reopened = new PopupModel(f.port); await reopened.start(); await reopened.returnToConnections();
    expect(f.authenticated.has(REMOTE)).toBe(false);
    expect(reopened.getSnapshot().active.apiOrigin).toBe(LAN);
  });
  it('popup closure after Save never discards the committed connection credential', async () => {
    const f = popupFixture(); f.authNeeded.add(REMOTE); await f.model.start();
    f.model.beginConnection(REMOTE); await f.model.checkConnection(); f.model.setPassword('test-only'); await f.model.connectAuth();
    f.model.setDefaultList('other'); await f.model.saveSettings();
    // Simulate closing after the worker saved but before the popup cleared its marker.
    f.port.savePendingCredential(REMOTE); f.setPending(REMOTE);
    const reopened = new PopupModel(f.port); await reopened.start(); reopened.openSettings(); await reopened.returnToConnections();
    expect(f.authenticated.has(REMOTE)).toBe(true);
    expect(reopened.getSnapshot().active.apiOrigin).toBe(REMOTE);
    expect(f.port.loadPendingCredential()).toBeNull();
  });
  it('does not send a new password if the cleanup checkpoint cannot be stored', async () => {
    const f = popupFixture(); f.authNeeded.add(REMOTE); await f.model.start();
    f.model.beginConnection(REMOTE); await f.model.checkConnection(); f.model.setPassword('test-only');
    f.port.savePendingCredential = () => { throw new Error('storage unavailable'); };
    await f.model.connectAuth();
    expect(f.authenticated.has(REMOTE)).toBe(false);
    expect(f.model.getSnapshot().setupNotice?.status).toBe('danger');
  });
  it.each(['GET_CONNECTIONS', 'GET_LOCAL_STATE', 'both'] as const)('does not erase committed credentials when %s cannot establish saved ownership', async (failedRead) => {
    const f = popupFixture(); f.authNeeded.add(REMOTE); await f.model.start();
    f.model.beginConnection(REMOTE); await f.model.checkConnection(); f.model.setPassword('test-only'); await f.model.connectAuth();
    f.model.setDefaultList('other'); await f.model.saveSettings(); f.port.savePendingCredential(REMOTE); f.setPending(REMOTE);
    f.override(r => (r.type === 'GET_CONTEXT' || r.type === failedRead || (failedRead === 'both' && (r.type === 'GET_CONNECTIONS' || r.type === 'GET_LOCAL_STATE')))
      ? { ok: false, code: 'INTERNAL_ERROR', message: 'storage unavailable' } : undefined);
    const reopened = new PopupModel(f.port); await reopened.start();
    expect(reopened.getSnapshot().setupNotice?.status).toBe('danger');
    reopened.beginConnection(LAN); await reopened.checkConnection(); await reopened.returnToConnections();
    expect(f.authenticated.has(REMOTE)).toBe(true);
    expect(f.send.mock.calls.some(([r]) => r.type === 'AUTH_FORGET' && r.apiOrigin === REMOTE)).toBe(false);
  });
});
