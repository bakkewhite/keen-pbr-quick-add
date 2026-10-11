import { canonicalizeConfiguredDomain } from './domain';
import type { KeenPbrConfig, KeenPbrList } from './keen-pbr-types';

export interface EligibleDomainList {
  name: string;
  domains: string[];
}

export type DomainMutationAction = 'add' | 'remove';

export type MutationResult =
  | { kind: 'updated'; config: KeenPbrConfig; memberships: string[] }
  | { kind: 'unchanged'; memberships: string[] }
  | { kind: 'invalid-list' };

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function emptySource(value: unknown): boolean {
  return value === undefined
    || value === null
    || (typeof value === 'string' && value.trim() === '');
}

function emptyStringArray(value: unknown): boolean {
  return value === undefined
    || value === null
    || (
      Array.isArray(value)
      && value.every((item) => typeof item === 'string' && item.trim() === '')
    );
}

function hasEnabledRoute(config: KeenPbrConfig, name: string): boolean {
  const rules = config.route?.rules;
  return Array.isArray(rules) && rules.some((rule: unknown) => {
    if (!rule || typeof rule !== 'object') return false;
    const value = rule as Record<string, unknown>;
    return value.enabled !== false
      && Array.isArray(value.list)
      && value.list.includes(name)
      && typeof value.outbound === 'string'
      && value.outbound.trim() !== '';
  });
}

function eligible(config: KeenPbrConfig, name: string, list: KeenPbrList): boolean {
  return strings(list.domains).length > 0
    && emptyStringArray(list.ip_cidrs)
    && emptySource(list.url)
    && emptySource(list.file)
    && hasEnabledRoute(config, name);
}

export function getEligibleDomainLists(config: KeenPbrConfig): EligibleDomainList[] {
  return Object.entries(config.lists)
    .filter(([name, list]) => eligible(config, name, list))
    .map(([name, list]) => ({ name, domains: strings(list.domains) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getDomainMemberships(
  config: KeenPbrConfig,
  domain: string,
): string[] {
  const canonical = canonicalizeConfiguredDomain(domain);
  if (!canonical) return [];

  // Presence is independent of editability: inactive and mixed-source lists
  // still contain explicit entries even though Quick Add cannot edit them.
  return Object.entries(config.lists)
    .map(([name, list]) => ({ name, domains: strings(list.domains) }))
    .filter((item) => item.domains.some(
      (entry) => canonicalizeConfiguredDomain(entry) === canonical,
    ))
    .map((item) => item.name)
    .sort((left, right) => left.localeCompare(right));
}

export function planDomainMutation(
  config: KeenPbrConfig,
  selectedList: string,
  domain: string,
  action: DomainMutationAction,
): MutationResult {
  const lists = getEligibleDomainLists(config);
  if (!lists.some((item) => item.name === selectedList)) {
    return { kind: 'invalid-list' };
  }

  const canonical = canonicalizeConfiguredDomain(domain);
  if (!canonical) return { kind: 'invalid-list' };

  const memberships = getDomainMemberships(config, canonical);
  const selectedContains = memberships.includes(selectedList);
  if (
    (action === 'add' && selectedContains)
    || (action === 'remove' && !selectedContains)
  ) {
    return { kind: 'unchanged', memberships };
  }

  const next = structuredClone(config);
  const selected = next.lists[selectedList];
  if (!selected || !Array.isArray(selected.domains)) {
    return { kind: 'invalid-list' };
  }
  selected.domains = action === 'add'
    ? [...selected.domains, canonical]
    : selected.domains.filter((entry) => (
        typeof entry !== 'string'
        || canonicalizeConfiguredDomain(entry) !== canonical
      ));
  return {
    kind: 'updated',
    config: next,
    memberships: getDomainMemberships(next, canonical),
  };
}
