import { vi } from 'vitest';
import type { PopupPort } from '../../src/popup-port';
import type { BackgroundResponse, PopupRequest } from '../../src/messages';
import { PopupModel } from '../../src/popup-model';

export const LAN = 'http://my.keenetic.net:12121';
export const REMOTE = 'https://keen-pbr.example.keenetic.pro';
export function popupFixture(firstSetup = false) {
  let active = firstSetup ? null : LAN;
  let savedDefault = 'local';
  let pending: string | null = null;
  let pendingCredential: string | null = null;
  let domain: string | null = 'youtube.com';
  let memberships = ['local', 'other'];
  let inspection: Extract<BackgroundResponse, {type:'CONTEXT'}>['membershipInspection'];
  const authenticated = new Set<string>();
  const authNeeded = new Set<string>();
  const profiles = firstSetup ? [] : [{ apiOrigin: LAN, defaultList: 'local', authMode: null }];
  let override: ((r: PopupRequest) => Promise<BackgroundResponse | undefined> | BackgroundResponse | undefined) | null = null;
  const send = vi.fn(async (r: PopupRequest): Promise<BackgroundResponse> => {
    const overridden = await override?.(r);
    if (overridden) return overridden;
    switch (r.type) {
      case 'GET_LOCAL_STATE': return {ok:true,type:'LOCAL_STATE',apiOrigin:active,defaultList:active?savedDefault:null,
        authMode:active && authenticated.has(active)?'session':null};
      case 'GET_CONNECTIONS': return {ok:true,type:'CONNECTIONS',connections:profiles.map(p => ({ ...p }))};
      case 'GET_CONTEXT':
        if (!active) return {ok:true,type:'SETUP_CONTEXT',apiOriginCandidate:REMOTE};
        if (authNeeded.has(active) && !authenticated.has(active)) return {ok:false,code:'API_AUTH_REQUIRED',message:'requires password'};
        return {ok:true,type:'CONTEXT',apiOrigin:active,defaultList:savedDefault,domain:r.domainInput ?? domain,
          tabDomain:domain,lists:['local','other'],memberships,
          ...(inspection?{membershipInspection:inspection}:{})};
      case 'CHECK_SETTINGS':
        if (authNeeded.has(r.apiOrigin) && !authenticated.has(r.apiOrigin)) return {ok:false,code:'API_AUTH_REQUIRED',message:'requires password'};
        return {ok:true,type:'CONNECTION',lists:['local','other'],version:'3.3.1'};
      case 'AUTH_CONNECT': authenticated.add(r.apiOrigin); return {ok:true,type:'AUTH_CONNECTED',mode:r.remember?'local':'session'};
      case 'AUTH_FORGET': authenticated.delete(r.apiOrigin); return {ok:true,type:'AUTH_FORGOTTEN'};
      case 'SAVE_SETTINGS':
        active=r.apiOrigin; savedDefault=r.defaultList;
        profiles.splice(0, profiles.length, { apiOrigin: r.apiOrigin, defaultList: r.defaultList, authMode: null }, ...profiles.filter(p => p.apiOrigin !== r.apiOrigin));
        return {ok:true,type:'SETTINGS_SAVED',oldPermissionRemoved:true};
      case 'REMOVE_CONNECTION':
        authenticated.delete(r.apiOrigin);
        profiles.splice(0, profiles.length, ...profiles.filter(p => p.apiOrigin !== r.apiOrigin));
        if (active === r.apiOrigin) active = null;
        return { ok: true, type: 'CONNECTION_REMOVED' };
      case 'MUTATE_DOMAIN':
        memberships=r.action==='add'?[...memberships,r.list]:memberships.filter(n=>n!==r.list);
        return {ok:true,type:'MUTATION_RESULT',result:{status:'applied-and-verified',action:r.action,list:r.list,
          domain:r.domain ?? '',memberships}};
    }
  });
  const port: PopupPort = {
    send, loadLanguage:vi.fn(async()=> 'ru' as const), saveLanguage:vi.fn(async()=>{}),
    requestOriginPermission:vi.fn(async()=>true),hasOriginPermission:vi.fn(async()=>true),
    loadPendingOrigin:()=>pending, savePendingOrigin:vi.fn(v=>{pending=v;}),prepareLocalNetworkAccess:vi.fn(async()=>{}),
    loadPendingCredential:()=>pendingCredential, savePendingCredential:vi.fn(v=>{pendingCredential=v;}),
  };
  return { port, send, model: new PopupModel(port), authNeeded, authenticated, profiles,
    setPending:(v:string|null)=>{pending=v;}, getPending:()=>pending,
    setDomain:(v:string|null)=>{domain=v;},setDefault:(v:string)=>{savedDefault=v;if(profiles[0])profiles[0].defaultList=v;},
    setMemberships:(v:string[])=>{memberships=v;},setInspection:(v:typeof inspection)=>{inspection=v;},
    override:(fn:typeof override)=>{override=fn;},
  };
}
