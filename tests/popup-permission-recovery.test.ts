import { expect, it, vi } from 'vitest';
import { PopupModel } from '../src/popup-model';
import { popupFixture, LAN, REMOTE } from './helpers/popup-port';

it('resumes an origin-only permission checkpoint without automatically prompting or saving', async()=>{
  const f=popupFixture(); f.setPending(REMOTE); await f.model.start();
  expect(f.model.getSnapshot()).toMatchObject({screen:'settings',step:'list',originInput:REMOTE,active:{apiOrigin:LAN}});
  expect(f.port.requestOriginPermission).not.toHaveBeenCalled();
  expect(f.send.mock.calls.some(([r])=>r.type==='SAVE_SETTINGS'||r.type==='AUTH_CONNECT')).toBe(false);
});
it('restores an address without probing if permission is absent',async()=>{
  const f=popupFixture(); f.setPending(REMOTE); vi.mocked(f.port.hasOriginPermission).mockResolvedValue(false);
  await f.model.start(); expect(f.model.getSnapshot()).toMatchObject({step:'address',originInput:REMOTE});
  expect(f.send.mock.calls.some(([r])=>r.type==='CHECK_SETTINGS')).toBe(false);
});
it('discards an invalid persisted address without opening permission or sending its credentials',async()=>{
  const f=popupFixture(); f.setPending('https://user:secret@example.com'); await f.model.start();
  expect(f.getPending()).toBeNull(); expect(f.port.requestOriginPermission).not.toHaveBeenCalled();
  expect(f.send.mock.calls.some(([r])=>r.type==='CHECK_SETTINGS')).toBe(false);
});
it('clears a completed saved-origin checkpoint and opens Main',async()=>{
  const f=popupFixture();f.setPending(LAN);await f.model.start();
  expect(f.model.getSnapshot().screen).toBe('main');expect(f.getPending()).toBeNull();
});
it('does not prompt or probe when synchronous checkpoint storage failed',async()=>{
  const f=popupFixture(true);await f.model.start();f.model.setOrigin(REMOTE);
  vi.mocked(f.port.savePendingOrigin).mockImplementation(()=>{throw new Error('storage');});
  await f.model.checkConnection();expect(f.port.requestOriginPermission).not.toHaveBeenCalled();
  expect(f.send.mock.calls.some(([r])=>r.type==='CHECK_SETTINGS')).toBe(false);
});
it('checkpoints synchronously before Chrome permission request, with no password in the checkpoint',async()=>{
  const f=popupFixture(true);await f.model.start();f.model.setOrigin(REMOTE);await f.model.checkConnection();
  expect(vi.mocked(f.port.savePendingOrigin).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(f.port.requestOriginPermission).mock.invocationCallOrder[0]!);
  expect(f.getPending()).toBe(REMOTE);
});
it('does not check an origin after permission is denied',async()=>{
  const f=popupFixture(true);await f.model.start();f.model.setOrigin(REMOTE);
  vi.mocked(f.port.requestOriginPermission).mockResolvedValue(false);await f.model.checkConnection();
  expect(f.send.mock.calls.some(([r])=>r.type==='CHECK_SETTINGS')).toBe(false);
  expect(f.model.getSnapshot().setupNotice?.status).toBe('danger');
});
it('still reads worker diagnostics when the popup local-network preflight fails',async()=>{
  const f=popupFixture(true);await f.model.start();f.model.setOrigin(LAN);
  vi.mocked(f.port.prepareLocalNetworkAccess).mockRejectedValue(new Error('network'));
  await f.model.checkConnection();expect(f.send).toHaveBeenCalledWith({type:'CHECK_SETTINGS',apiOrigin:LAN});
  expect(f.model.getSnapshot().step).toBe('list');
});
