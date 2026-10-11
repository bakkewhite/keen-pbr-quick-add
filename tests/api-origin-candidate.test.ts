import { describe, expect, it } from 'vitest';
import { deriveApiOriginCandidate } from '../src/api-origin-candidate';

describe('deriveApiOriginCandidate', () => {
  it('returns the origin for the standard keen-pbr port', () => {
    expect(deriveApiOriginCandidate({
      url: 'http://192.168.1.1:12121/dashboard?tab=lists',
      title: 'Router',
    })).toBe('http://192.168.1.1:12121');
  });

  it('returns a reverse-proxy origin identified by the tab title', () => {
    expect(deriveApiOriginCandidate({
      url: 'https://keen-pbr.example.net/lists',
      title: 'Home router · keen-pbr',
    })).toBe('https://keen-pbr.example.net');
  });

  it.each([
    { url: 'https://example.com/', title: 'Example' },
    { url: 'chrome://extensions/', title: 'Extensions' },
    { url: 'not a url', title: 'keen-pbr' },
  ])('rejects non-candidate tab %#', (tab) => {
    expect(deriveApiOriginCandidate(tab)).toBeNull();
  });
});
