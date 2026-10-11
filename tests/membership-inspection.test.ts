import { expect, it, vi } from 'vitest';
import { inspectMemberships } from '../src/membership-inspection';
import { makeConfig } from './fixtures/config';

it('skips expensive routing checks when all lists are inline', async () => {
  const api = { testRouting: vi.fn() };
  expect(await inspectMemberships(api, { lists: { local: { domains: ['youtube.com'] } } }, 'youtube.com'))
    .toEqual({ matchedLists: [], status: 'not-needed' });
  expect(api.testRouting).not.toHaveBeenCalled();
});

it('collects matches from multiple rules, deduplicates, and rejects IP and unrelated domain matches', async () => {
  const api = { testRouting: vi.fn().mockResolvedValue({ target: 'youtube.com', is_domain: true,
    rule_diagnostics: [
      { target_in_lists: true, target_match: { list: 'remote_domains', via: 'youtube.com' } },
      { target_in_lists: true, target_match: { list: 'local_file', via: '*.YOUTUBE.COM.' } },
      { target_in_lists: true, target_match: { list: 'not_in_config', via: 'youtube.com' } },
      { target_in_lists: true, target_match: { list: 'ip_only', via: '203.0.113.4' } },
    ], results: [{ list_match: { list: 'remote_domains', via: 'youtube.com' } }],
  }) };
  expect(await inspectMemberships(api, makeConfig(), 'youtube.com'))
    .toEqual({ matchedLists: ['local_file', 'remote_domains'], status: 'partial' });
});

it.each([
  { target: 'other.com', is_domain: true, results: [] },
  { target: 'youtube.com', is_domain: false, results: [] },
  { error: 'unavailable' },
  { results: [{ ok: true }] },
  null,
])('treats malformed or mismatched diagnostics as unavailable: %j', async response => {
  const api = { testRouting: vi.fn().mockResolvedValue(response) };
  expect(await inspectMemberships(api, makeConfig(), 'youtube.com'))
    .toEqual({ matchedLists: [], status: 'unavailable' });
});

it('ignores an IP-only match and does not claim external completeness after an empty result', async () => {
  const api = { testRouting: vi.fn().mockResolvedValue({ target: 'youtube.com', is_domain: true,
    rule_diagnostics: [{ target_in_lists: false, target_match: { list: 'remote_domains', via: 'youtube.com' } }],
    results: [{ list_match: { list: 'remote_domains', via: '203.0.113.4' } },
      { list_match: { list: 'local_file', via: 'notyoutube.com' } }],
  }) };
  expect(await inspectMemberships(api, makeConfig(), 'youtube.com'))
    .toEqual({ matchedLists: [], status: 'partial' });
});
