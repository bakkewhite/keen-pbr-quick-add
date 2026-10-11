import type { DomainMutationAction } from './config';
import type { DomainMutationOutcome } from './operation';
import type { MembershipInspection } from './membership-inspection';

export type PopupRequest =
  | { type: 'GET_CONTEXT'; domainInput?: string; expectedOrigin?: string }
  | { type: 'GET_LOCAL_STATE' }
  | { type: 'GET_CONNECTIONS' }
  | { type: 'REMOVE_CONNECTION'; apiOrigin: string }
  | { type: 'AUTH_CONNECT'; apiOrigin: string; password: string; remember: boolean; allowInsecureHttp: boolean }
  | { type: 'AUTH_FORGET'; apiOrigin: string }
  | { type: 'CHECK_SETTINGS'; apiOrigin: string }
  | { type: 'SAVE_SETTINGS'; apiOrigin: string; defaultList: string }
  | { type: 'MUTATE_DOMAIN'; action: DomainMutationAction; list: string; domain?: string; expectedOrigin?: string };

export type BackgroundResponse =
  | { ok: true; type: 'CONNECTIONS'; connections: Array<{ apiOrigin: string; defaultList: string; authMode: 'session' | 'local' | null }> }
  | { ok: true; type: 'LOCAL_STATE'; apiOrigin: string | null; defaultList: string | null; authMode: 'session' | 'local' | null }
  | { ok: true; type: 'AUTH_CONNECTED'; mode: 'session' | 'local' }
  | { ok: true; type: 'AUTH_FORGOTTEN' }
  | { ok: true; type: 'CONNECTION_REMOVED' }
  | {
      ok: true;
      type: 'SETUP_CONTEXT';
      apiOriginCandidate: string | null;
    }
  | {
      ok: true;
      type: 'CONTEXT';
      domain: string | null;
      tabDomain?: string | null;
      lists: string[];
      memberships: string[];
      membershipInspection?: MembershipInspection;
      defaultList: string | null;
      apiOrigin: string | null;
    }
  | { ok: true; type: 'CONNECTION'; lists: string[]; version: string | null }
  | { ok: true; type: 'SETTINGS_SAVED'; oldPermissionRemoved: boolean }
  | { ok: true; type: 'MUTATION_RESULT'; result: DomainMutationOutcome }
  | {
      ok: false;
      code: string;
      message: string;
      diagnostic?: string;
    };

export function isPopupRequest(value: unknown): value is PopupRequest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  switch (candidate.type) {
    case 'GET_CONTEXT':
      return (candidate.domainInput === undefined || (typeof candidate.domainInput === 'string' && candidate.domainInput.length <= 2048))
        && (candidate.expectedOrigin === undefined || typeof candidate.expectedOrigin === 'string');
    case 'GET_LOCAL_STATE':
    case 'GET_CONNECTIONS':
      return true;
    case 'AUTH_CONNECT':
      return typeof candidate.apiOrigin === 'string'
        && typeof candidate.password === 'string'
        && typeof candidate.remember === 'boolean'
        && typeof candidate.allowInsecureHttp === 'boolean';
    case 'AUTH_FORGET':
    case 'REMOVE_CONNECTION':
      return typeof candidate.apiOrigin === 'string';
    case 'CHECK_SETTINGS':
      return typeof candidate.apiOrigin === 'string';
    case 'SAVE_SETTINGS':
      return typeof candidate.apiOrigin === 'string'
        && typeof candidate.defaultList === 'string';
    case 'MUTATE_DOMAIN':
      return (candidate.action === 'add' || candidate.action === 'remove')
        && (candidate.domain === undefined || (typeof candidate.domain === 'string' && candidate.domain.length <= 2048))
        && (candidate.expectedOrigin === undefined || typeof candidate.expectedOrigin === 'string')
        && typeof candidate.list === 'string'
        && /^[a-z][a-z0-9_]{0,23}$/.test(candidate.list);
    default:
      return false;
  }
}
