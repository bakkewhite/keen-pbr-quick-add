import { canonicalizeConfiguredDomain } from './domain';
import type { KeenPbrConfig } from './keen-pbr-types';
import type { OperationApi } from './operation';

export interface MembershipInspection {
  matchedLists: string[];
  status: 'not-needed' | 'partial' | 'unavailable';
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** Read-only evidence from the router's cached sources, never write eligibility.
 * keen-pbr 3.3.1 reports only the first list match per rule. Even a successful
 * response cannot prove a complete inventory of URL/file-list memberships.
 */
export async function inspectMemberships(
  api: Pick<OperationApi, 'testRouting'>,
  config: KeenPbrConfig,
  domain: string,
): Promise<MembershipInspection> {
  const external = new Set(Object.entries(config.lists)
    .filter(([, list]) => [list.url, list.file].some(v => typeof v === 'string' && v.trim()))
    .map(([name]) => name));
  if (external.size === 0) return { matchedLists: [], status: 'not-needed' };
  const unavailable: MembershipInspection = { matchedLists: [], status: 'unavailable' };
  try {
    const response = object(await api.testRouting(domain));
    if (!response || response.target !== domain || response.is_domain !== true) return unavailable;
    if (!Array.isArray(response.rule_diagnostics) && !Array.isArray(response.results)) return unavailable;
    const matches = new Set<string>();
    const add = (raw: unknown): void => {
      const match = object(raw);
      if (!match || typeof match.list !== 'string' || !external.has(match.list)
        || typeof match.via !== 'string') return;
      const via = canonicalizeConfiguredDomain(match.via);
      // IP/CIDR routing is not evidence that the domain itself is in a list.
      if (via && (via === domain || domain.endsWith('.' + via))) matches.add(match.list);
    };
    for (const raw of Array.isArray(response.rule_diagnostics) ? response.rule_diagnostics : []) {
      const row = object(raw);
      if (row?.target_in_lists === true) add(row.target_match);
    }
    for (const raw of Array.isArray(response.results) ? response.results : []) add(object(raw)?.list_match);
    return { matchedLists: [...matches].sort(), status: 'partial' };
  } catch { return unavailable; }
}
