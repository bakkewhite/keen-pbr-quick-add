// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { PENDING_ORIGIN_KEY, PENDING_CREDENTIAL_KEY, realPopupPort } from '../src/popup-port';

afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();});
it('the production browser adapter stores only a normalized origin across popup instances',()=>{
  realPopupPort.savePendingOrigin('https://keen-pbr.example.keenetic.pro/');
  expect(localStorage.getItem(PENDING_ORIGIN_KEY)).toBe('https://keen-pbr.example.keenetic.pro');
  expect(realPopupPort.loadPendingOrigin()).toBe('https://keen-pbr.example.keenetic.pro');
  expect(()=>realPopupPort.savePendingOrigin('https://user:secret@example.com')).toThrow();
  realPopupPort.savePendingOrigin(null);expect(realPopupPort.loadPendingOrigin()).toBeNull();
});
it('permission requests and checks are scoped to the selected origin',async()=>{
  const request=vi.fn(async()=>true),contains=vi.fn(async()=>true);
  vi.stubGlobal('chrome',{permissions:{request,contains}});
  await realPopupPort.requestOriginPermission('https://router.example');
  await realPopupPort.hasOriginPermission('https://router.example');
  expect(request).toHaveBeenCalledWith({origins:['https://router.example/*']});
  expect(contains).toHaveBeenCalledWith({origins:['https://router.example/*']});
});
it('staged credential ownership stores only an origin, never a password',()=>{
  realPopupPort.savePendingCredential('https://router.example/');
  expect(localStorage.getItem(PENDING_CREDENTIAL_KEY)).toBe('https://router.example');
  expect(realPopupPort.loadPendingCredential()).toBe('https://router.example');
  expect(()=>realPopupPort.savePendingCredential('https://user:secret@router.example')).toThrow();
  realPopupPort.savePendingCredential(null); expect(realPopupPort.loadPendingCredential()).toBeNull();
});
it('preflight is a bounded read without cookies, redirects or credentials',async()=>{
  const fetch=vi.fn(async()=>new Response('{}'));vi.stubGlobal('fetch',fetch);
  await realPopupPort.prepareLocalNetworkAccess('https://router.example');
  expect(fetch).toHaveBeenCalledWith('https://router.example/api/health/service',expect.objectContaining({
    method:'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:expect.any(AbortSignal),
  }));
});
