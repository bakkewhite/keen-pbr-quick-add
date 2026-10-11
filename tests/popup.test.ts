import { describe, expect, it, vi } from 'vitest';
import { PopupModel } from '../src/popup-model';
import { deriveDomainSelectionState } from '../src/domain-state';
import type { BackgroundResponse } from '../src/messages';
import { popupFixture, LAN, REMOTE } from './helpers/popup-port';

describe('React popup state machine: connection workflow', () => {
  it('starts on main for a working saved connection', async () => {
    const f=popupFixture(); await f.model.start();
    expect(f.model.getSnapshot()).toMatchObject({screen:'main',selectedList:'local',domainInput:'youtube.com'});
  });
  it('starts first setup at address, with no guessed or verified origin', async () => {
    const f=popupFixture(true); await f.model.start();
    expect(f.model.getSnapshot()).toMatchObject({screen:'settings',step:'address',originInput:'',checked:null,suggestion:REMOTE});
    expect(f.send.mock.calls.some(([r])=>r.type==='CHECK_SETTINGS')).toBe(false);
  });
  it('skips password for an unprotected API and saves only explicitly at the list step', async () => {
    const f=popupFixture(true); await f.model.start(); f.model.setOrigin(REMOTE); await f.model.checkConnection();
    expect(f.model.getSnapshot()).toMatchObject({step:'list',defaultList:'',active:{apiOrigin:null}});
    await f.model.saveSettings(); expect(f.send.mock.calls.some(([r])=>r.type==='SAVE_SETTINGS')).toBe(false);
    f.model.setDefaultList('local'); await f.model.saveSettings();
    expect(f.model.getSnapshot()).toMatchObject({screen:'main',active:{apiOrigin:REMOTE,defaultList:'local'}});
    expect(f.getPending()).toBeNull();
  });
  it('requires access only when the API requests it, then clears the password and advances', async () => {
    const f=popupFixture(true); f.authNeeded.add(REMOTE); await f.model.start();
    f.model.setOrigin(REMOTE); await f.model.checkConnection();
    expect(f.model.getSnapshot()).toMatchObject({step:'access',setupNotice:null});
    f.model.setPassword('test-only-secret'); await f.model.connectAuth();
    expect(f.model.getSnapshot()).toMatchObject({step:'list',password:'',authMode:'session'});
    expect(f.send).toHaveBeenCalledWith({type:'AUTH_CONNECT',apiOrigin:REMOTE,password:'test-only-secret',remember:false,allowInsecureHttp:false});
  });
  it('HTTP credentials are authorized only by an intentional submit', async () => {
    const f=popupFixture(); f.authNeeded.add(LAN); await f.model.start(); f.model.setPassword('test-only');
    expect(f.send.mock.calls.some(([r])=>r.type==='AUTH_CONNECT')).toBe(false);
    await f.model.connectAuth();
    expect(f.send).toHaveBeenCalledWith({type:'AUTH_CONNECT',apiOrigin:LAN,password:'test-only',remember:false,allowInsecureHttp:true});
  });
  it('keeps an incorrect login at access with a cleared input', async () => {
    const f=popupFixture(); f.authNeeded.add(LAN); await f.model.start();
    f.override(r=>r.type==='AUTH_CONNECT'?{ok:false,code:'AUTH_INVALID_PASSWORD',message:'wrong'}:undefined);
    f.model.setPassword('wrong'); await f.model.connectAuth();
    expect(f.model.getSnapshot()).toMatchObject({step:'access',password:'',setupNotice:{status:'danger'}});
  });
  it('uses a saved profile default without changing the active connection before finish', async () => {
    const f=popupFixture(); f.profiles.push({apiOrigin:REMOTE,defaultList:'other',authMode:null}); await f.model.start();
    f.model.openSettings(); f.model.setOrigin(REMOTE); await f.model.checkConnection();
    expect(f.model.getSnapshot()).toMatchObject({step:'list',defaultList:'other',active:{apiOrigin:LAN}});
    await f.model.cancel(); expect(f.model.getSnapshot()).toMatchObject({screen:'main',active:{apiOrigin:LAN},selectedList:'local'});
  });
  it('does not substitute another default when the saved list vanished', async () => {
    const f=popupFixture(); f.setDefault('gone'); await f.model.start();
    expect(f.model.getSnapshot().selectedList).toBe('');
    f.model.openSettings(); await f.model.checkConnection(); expect(f.model.getSnapshot().defaultList).toBe('');
  });
  it('preserves a temporary main-list selection when settings are saved for the same router', async () => {
    const f=popupFixture(); await f.model.start(); f.model.setSelectedList('other'); f.model.openSettings();
    await f.model.checkConnection(); await f.model.saveSettings();
    expect(f.model.getSnapshot()).toMatchObject({screen:'main',selectedList:'other',active:{defaultList:'local'}});
  });
  it('invalidates a checked candidate when going back and changing the address', async () => {
    const f=popupFixture(); await f.model.start(); f.model.openSettings(); await f.model.checkConnection();
    f.model.back(); f.model.setOrigin(REMOTE); await f.model.saveSettings();
    expect(f.model.getSnapshot()).toMatchObject({step:'address',checked:null});
    expect(f.send.mock.calls.some(([r])=>r.type==='SAVE_SETTINGS')).toBe(false);
  });
  it('cleans a new unsaved credential on cancel without forgetting a saved profile', async () => {
    const f=popupFixture(); f.authNeeded.add(REMOTE); await f.model.start(); f.model.openSettings();
    f.model.setOrigin(REMOTE); await f.model.checkConnection(); f.model.setPassword('test-only'); await f.model.connectAuth();
    await f.model.cancel(); expect(f.send).toHaveBeenCalledWith({type:'AUTH_FORGET',apiOrigin:REMOTE});
    expect(f.model.getSnapshot().active.apiOrigin).toBe(LAN);
  });
  it('blocks cancel if cleanup of a new credential failed', async () => {
    const f=popupFixture(); f.authNeeded.add(REMOTE); await f.model.start(); f.model.openSettings();
    f.model.setOrigin(REMOTE); await f.model.checkConnection(); f.model.setPassword('test-only'); await f.model.connectAuth();
    f.override(r=>r.type==='AUTH_FORGET'?{ok:false,code:'AUTH_FORGET_FAILED',message:'failed'}:undefined);
    await f.model.cancel(); expect(f.model.getSnapshot()).toMatchObject({screen:'settings',setupNotice:{status:'danger'}});
  });
  it('forget disables the active domain and requires login again', async () => {
    const f=popupFixture(); f.authenticated.add(LAN); await f.model.start(); f.model.openSettings(); await f.model.checkConnection();
    await f.model.forgetAuth(); expect(f.model.getSnapshot()).toMatchObject({step:'access',context:null,checked:null});
    await f.model.cancel(); await f.model.mutate();
    expect(f.send.mock.calls.some(([r])=>r.type==='MUTATE_DOMAIN')).toBe(false);
  });
  it('password-delete failure never restores the action or reports success', async () => {
    const f=popupFixture(); await f.model.start(); f.model.openSettings(); await f.model.checkConnection();
    f.override(r=>r.type==='AUTH_FORGET'?{ok:false,code:'AUTH_FORGET_FAILED',message:'failed'}:undefined);
    await f.model.forgetAuth(); expect(f.model.getSnapshot()).toMatchObject({context:null,setupNotice:{status:'danger'}});
  });
  it('leaves a failed save on the list step and preserves the old active origin', async () => {
    const f=popupFixture(); await f.model.start(); f.model.openSettings(); f.model.setOrigin(REMOTE); await f.model.checkConnection();
    f.model.setDefaultList('local'); f.override(r=>r.type==='SAVE_SETTINGS'?{ok:false,code:'INTERNAL_ERROR',message:'failed'}:undefined);
    await f.model.saveSettings(); expect(f.model.getSnapshot()).toMatchObject({screen:'settings',step:'list',active:{apiOrigin:LAN}});
  });
  it('changes and persists language without repeating router calls', async () => {
    const f=popupFixture(); await f.model.start(); const calls=f.send.mock.calls.length;
    await f.model.changeLanguage('en'); expect(f.send.mock.calls).toHaveLength(calls);
    expect(f.port.saveLanguage).toHaveBeenCalledWith('en');
  });
  it('initializes only once even with repeated React mounts', async () => {
    const f=popupFixture(); await Promise.all([f.model.start(),f.model.start()]);
    expect(f.send.mock.calls.filter(([r])=>r.type==='GET_CONTEXT')).toHaveLength(1);
  });
});

describe('domain and mutation regression coverage', () => {
  it('keeps a manually entered subdomain through check and the selected-list mutation', async () => {
    const f = popupFixture(); f.setMemberships([]); await f.model.start();
    f.model.setDomainInput('https://gemini.google.com/app?hl=ru');
    await f.model.checkDomain();
    expect(f.model.getSnapshot()).toMatchObject({ domainInput: 'gemini.google.com', context: { domain: 'gemini.google.com' } });
    expect(f.send).toHaveBeenCalledWith({ type: 'GET_CONTEXT', domainInput: 'gemini.google.com', expectedOrigin: LAN });
    await f.model.mutate();
    expect(f.send).toHaveBeenCalledWith({ type: 'MUTATE_DOMAIN', domain: 'gemini.google.com', list: 'local', action: 'add', expectedOrigin: LAN });
    expect(f.model.getSnapshot().active.defaultList).toBe('local');
  });
  it('supports manual input on a blank tab, normalizes before GET and never writes on check', async () => {
    const f=popupFixture(); f.setDomain(null); await f.model.start(); f.model.setDomainInput('example.com/sub/page');
    const checking=f.model.checkDomain(); expect(f.model.getSnapshot().domainInput).toBe('example.com'); await checking;
    expect(f.send).toHaveBeenCalledWith({type:'GET_CONTEXT',domainInput:'example.com',expectedOrigin:LAN});
    expect(f.send.mock.calls.some(([r])=>r.type==='MUTATE_DOMAIN')).toBe(false);
  });
  it.each(['','chrome://newtab','localhost','127.0.0.1','https://user:pass@example.com'])('does not query an invalid manual domain %s', async input => {
    const f=popupFixture(); await f.model.start(); const count=f.send.mock.calls.length;
    f.model.setDomainInput(input); await f.model.checkDomain(); expect(f.send.mock.calls).toHaveLength(count);
  });
  it.each([true,false])('ignores a stale %s response if the user replaces the checked domain', async success => {
    const f=popupFixture(); await f.model.start(); let finish!:(r:BackgroundResponse)=>void;
    f.override(r=>r.type==='GET_CONTEXT'?new Promise<BackgroundResponse>(resolve=>{finish=resolve;}):undefined);
    f.model.setDomainInput('example.com'); const task=f.model.checkDomain(); await Promise.resolve();
    f.model.setDomainInput('different.com'); finish(success?{ok:true,type:'CONTEXT',domain:'example.com',apiOrigin:LAN,
      lists:['local'],memberships:[],defaultList:'local'}:{ok:false,code:'API_UNAVAILABLE',message:'old failure'});
    await task; expect(f.model.getSnapshot()).toMatchObject({domainInput:'different.com',context:{domain:null},mainNotice:null});
  });
  it('checks From tab separately and leaves the default list unchanged', async () => {
    const f=popupFixture(); await f.model.start(); f.model.setDomainInput('example.com'); await f.model.checkDomain(true);
    expect(f.model.getSnapshot()).toMatchObject({domainInput:'youtube.com',active:{defaultList:'local'}});
  });
  it('selects remove for an explicit entry and retains other and external matches after it', async () => {
    const f=popupFixture(); f.setInspection({status:'partial',matchedLists:['subscription']}); await f.model.start();
    expect(deriveDomainSelectionState('local',f.model.getSnapshot().context!.memberships).action).toBe('remove');
    await f.model.mutate(); expect(f.send).toHaveBeenCalledWith({type:'MUTATE_DOMAIN',action:'remove',list:'local',domain:'youtube.com',expectedOrigin:LAN});
    expect(f.model.getSnapshot().context).toMatchObject({memberships:['other'],membershipInspection:{matchedLists:['subscription']}});
  });
  it('does not remove an external subscription through the inline list', async () => {
    const f=popupFixture(); f.setMemberships([]); f.setInspection({status:'partial',matchedLists:['local']}); await f.model.start();
    await f.model.mutate(); expect(f.send.mock.calls.find(([r])=>r.type==='MUTATE_DOMAIN')?.[0]).toMatchObject({action:'add'});
  });
  it('updates membership to Remove immediately after Add', async () => {
    const f=popupFixture(); f.setMemberships([]); await f.model.start(); await f.model.mutate();
    expect(f.model.getSnapshot().context?.memberships).toContain('local');
  });
  it('locks requests, domain and selector during an outstanding mutation', async () => {
    const f=popupFixture(); await f.model.start(); let finish!:(r:BackgroundResponse)=>void;
    f.override(r=>r.type==='MUTATE_DOMAIN'?new Promise<BackgroundResponse>(resolve=>{finish=resolve;}):undefined);
    const task=f.model.mutate(); await Promise.resolve(); f.model.setDomainInput('changed.com'); f.model.setSelectedList('other'); await f.model.mutate();
    expect(f.model.getSnapshot()).toMatchObject({domainInput:'youtube.com',selectedList:'local'});
    finish({ok:true,type:'MUTATION_RESULT',result:{status:'unchanged',domain:'youtube.com',list:'local',action:'remove',memberships:[]}});
    await task; expect(f.send.mock.calls.filter(([r])=>r.type==='MUTATE_DOMAIN')).toHaveLength(1);
  });
  it.each(['applied-unverified','blocked','failed'] as const)('does not turn %s into a verified success', async status => {
    const f=popupFixture(); await f.model.start();
    f.override(r=>r.type==='MUTATE_DOMAIN'?{ok:true,type:'MUTATION_RESULT',result:status==='applied-unverified'
      ?{status,action:'remove',list:'local',domain:'youtube.com',memberships:['other'],reason:'verification-unavailable'}
      :status==='blocked'?{status,reason:'draft'}:{status,phase:'save',reason:'save-outcome-unknown',writeMayHaveCompleted:true}}:undefined);
    await f.model.mutate(); expect(f.model.getSnapshot().mainNotice?.status).not.toBe('success');
    expect(f.send.mock.calls.filter(([r])=>r.type==='MUTATE_DOMAIN')).toHaveLength(1);
  });
});
