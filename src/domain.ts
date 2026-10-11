import { parse } from 'tldts';

export type DomainFailureReason =
  | 'invalid-url'
  | 'unsupported-scheme'
  | 'ip-address'
  | 'special-use'
  | 'unregistrable-domain';

export type DomainResult =
  | { ok: true; domain: string }
  | { ok: false; reason: DomainFailureReason };

function toAsciiHostname(value: string): string | null {
  try {
    const url = new URL('http://' + value);
    if (url.pathname !== '/' || url.search || url.hash) {
      return null;
    }
    return url.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

export function deriveRootDomain(rawUrl: string): DomainResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'unsupported-scheme' };
  }

  const result = parse(url.hostname, {
    allowPrivateDomains: true,
    detectSpecialUse: true,
  });

  if (result.isIp) return { ok: false, reason: 'ip-address' };
  if (result.isSpecialUse && !result.isIcann && !result.isPrivate) {
    return { ok: false, reason: 'special-use' };
  }
  if (!result.domain || (!result.isIcann && !result.isPrivate)) {
    return { ok: false, reason: 'unregistrable-domain' };
  }

  const domain = toAsciiHostname(result.domain);
  return domain
    ? { ok: true, domain }
    : { ok: false, reason: 'unregistrable-domain' };
}

/** Keeps real subdomains, drops a www prefix, and rejects credentials. Shared by manual and tab input. */
export function deriveDomainInput(input: string): DomainResult {
  const value = input.trim();
  if (!value || value.length > 2048 || /[\s\\]/u.test(value)) return { ok: false, reason: 'invalid-url' };
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value);
  const isHostWithPort = /^[^/:?#]+:\d+(?:[/?#]|$)/u.test(value);
  const raw = hasScheme && !isHostWithPort ? value : 'https://' + value;
  try {
    const url = new URL(raw);
    if (url.username || url.password) return { ok: false, reason: 'invalid-url' };
    const validation = deriveRootDomain(raw);
    if (!validation.ok) return validation;
    let domain = url.hostname.toLowerCase().replace(/\.$/, '');
    // Do not strip www when it is the registrable domain itself (e.g. www.com).
    while (domain.startsWith('www.') && domain !== validation.domain) {
      domain = domain.slice(4);
    }
    return { ok: true, domain };
  } catch { return { ok: false, reason: 'invalid-url' }; }
}

export function canonicalizeConfiguredDomain(value: string): string | null {
  const stripped = value.trim().replace(/^\*\./, '').replace(/\.$/, '');
  if (!stripped || stripped.includes('/')) return null;
  return toAsciiHostname(stripped);
}
