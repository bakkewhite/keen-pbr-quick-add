import { describe, expect, it } from 'vitest';
import {
  getDomainMemberships,
  getEligibleDomainLists,
  planDomainMutation,
} from '../src/config';
import { makeConfig } from './fixtures/config';

describe('getEligibleDomainLists', () => {
  it('returns only routed inline-domain lists in stable name order', () => {
    expect(getEligibleDomainLists(makeConfig())).toEqual([
      { name: 'google_ai', domains: ['ai.example'] },
      { name: 'local', domains: ['alpha.example'] },
    ]);
  });

  it('excludes malformed source fields instead of treating them as empty', () => {
    const config = makeConfig();
    config.lists.malformed = {
      domains: ['malformed.example'],
      ip_cidrs: { unexpected: true },
      url: '',
      file: '',
    };
    const rules = config.route?.rules;
    if (!Array.isArray(rules)) throw new Error('Expected route rules');
    rules.push({ list: ['malformed'], outbound: 'vpn_auto' });

    expect(getEligibleDomainLists(config).map(({ name }) => name))
      .not.toContain('malformed');
  });
});

describe('domain membership and mutation planning', () => {
  it('reports explicit entries in all lists without making those lists editable', () => {
    const config = makeConfig();
    config.lists.inactive!.domains = ['*.EXAMPLE.COM.'];
    config.lists.remote_domains!.domains = ['example.com'];
    expect(getDomainMemberships(config, 'example.com')).toEqual(['inactive', 'remote_domains']);
    expect(planDomainMutation(config, 'remote_domains', 'example.com', 'remove')).toEqual({ kind: 'invalid-list' });
  });
  it('finds canonical membership across eligible lists in stable order', () => {
    const config = makeConfig();
    config.lists.local!.domains = ['*.AI.EXAMPLE.', 'alpha.example'];

    expect(getDomainMemberships(config, 'ai.example')).toEqual([
      'google_ai',
      'local',
    ]);
  });

  it('appends one domain without mutating or reshaping the source config', () => {
    const original = makeConfig();
    const snapshot = structuredClone(original);
    const result = planDomainMutation(original, 'local', 'example.com', 'add');

    expect(result.kind).toBe('updated');
    if (result.kind !== 'updated') throw new Error('Expected updated result');
    expect(original).toEqual(snapshot);
    expect(result.config.lists.local?.domains).toEqual([
      'alpha.example',
      'example.com',
    ]);
    expect({
      ...result.config,
      lists: { ...result.config.lists, local: original.lists.local },
    }).toEqual(original);
    expect(result.memberships).toEqual(['local']);
  });

  it('allows add when the domain exists only in another list', () => {
    const result = planDomainMutation(
      makeConfig(),
      'local',
      'ai.example',
      'add',
    );

    expect(result.kind).toBe('updated');
    if (result.kind !== 'updated') throw new Error('Expected updated');
    expect(result.memberships).toEqual(['google_ai', 'local']);
    expect(result.config.lists.local?.domains).toEqual([
      'alpha.example',
      'ai.example',
    ]);
  });

  it('removes every canonical match only from the selected list', () => {
    const config = makeConfig();
    config.lists.local!.domains = ['*.AI.EXAMPLE.', 'alpha.example', 'ai.example'];
    const result = planDomainMutation(config, 'local', 'ai.example', 'remove');

    expect(result.kind).toBe('updated');
    if (result.kind !== 'updated') throw new Error('Expected updated');
    expect(result.config.lists.local?.domains).toEqual(['alpha.example']);
    expect(result.config.lists.google_ai?.domains).toEqual(['ai.example']);
    expect(result.memberships).toEqual(['google_ai']);
  });

  it('returns current memberships for no-write add and remove', () => {
    expect(planDomainMutation(
      makeConfig(), 'local', 'alpha.example', 'add',
    )).toEqual({ kind: 'unchanged', memberships: ['local'] });
    expect(planDomainMutation(
      makeConfig(), 'local', 'ai.example', 'remove',
    )).toEqual({ kind: 'unchanged', memberships: ['google_ai'] });
  });

  it('rejects an unavailable list for both actions', () => {
    expect(planDomainMutation(
      makeConfig(), 'remote_domains', 'example.com', 'add',
    )).toEqual({ kind: 'invalid-list' });
    expect(planDomainMutation(
      makeConfig(), 'remote_domains', 'example.com', 'remove',
    )).toEqual({ kind: 'invalid-list' });
  });
});
