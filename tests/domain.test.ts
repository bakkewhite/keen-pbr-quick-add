import { describe, expect, it } from 'vitest';
import {
  canonicalizeConfiguredDomain,
  deriveDomainInput,
  deriveRootDomain,
} from '../src/domain';

describe('deriveRootDomain', () => {
  it.each([
    ['https://www.example.com/path', 'example.com'],
    ['https://shop.example.co.uk/cart', 'example.co.uk'],
    ['https://tenant.github.io/app', 'tenant.github.io'],
    [
      'https://stitch.withgoogle.com/projects/10870132519446028532',
      'stitch.withgoogle.com',
    ],
    ['https://пример.рф/', 'xn--e1afmkfd.xn--p1ai'],
  ])('derives %s as %s', (url, domain) => {
    expect(deriveRootDomain(url)).toEqual({ ok: true, domain });
  });

  it.each([
    ['chrome://extensions', 'unsupported-scheme'],
    ['file:///C:/temp/page.html', 'unsupported-scheme'],
    ['http://192.168.1.1/', 'ip-address'],
    ['http://localhost/', 'special-use'],
    ['https://example.test/', 'special-use'],
    ['not a url', 'invalid-url'],
  ] as const)('rejects %s as %s', (url, reason) => {
    expect(deriveRootDomain(url)).toEqual({ ok: false, reason });
  });
});

describe('deriveDomainInput', () => {
  it.each([
    ['gemini.google.com', 'gemini.google.com'],
    ['https://gemini.google.com/app?hl=ru#chat', 'gemini.google.com'],
    ['gemini.google.com/app', 'gemini.google.com'],
    ['https://GEMINI.Google.COM.:443/app', 'gemini.google.com'],
    ['gemini.google.com:8443/app', 'gemini.google.com'],
    ['https://deep.shop.example.co.uk/cart', 'deep.shop.example.co.uk'],
    ['https://app.tenant.github.io/path', 'app.tenant.github.io'],
    ['https://www.example.com/path', 'example.com'],
    ['https://WWW.gemini.google.com/app', 'gemini.google.com'],
    ['https://www2.google.com/app', 'www2.google.com'],
    ['https://app.www.example.com/page', 'app.www.example.com'],
    ['https://www.com/page', 'www.com'],
    ['https://www.co.uk/page', 'www.co.uk'],
    ['https://чат.пример.рф/app', 'xn--80a0bn.xn--e1afmkfd.xn--p1ai'],
  ])('preserves subdomains while stripping only a www prefix in %s as %s', (input, domain) => {
    expect(deriveDomainInput(input)).toEqual({ ok: true, domain });
  });

  it.each([
    ['https://www.www.google.com/app', 'google.com'],
    ['https://www.www.gemini.google.com/app', 'gemini.google.com'],
    ['www.www.com/page', 'www.com'],
    ['https://www.www.github.io/page', 'www.github.io'],
  ])('keeps the target stable across repeated normalization of %s', (input, domain) => {
    expect(deriveDomainInput(input)).toEqual({ ok: true, domain });
    expect(deriveDomainInput(domain)).toEqual({ ok: true, domain });
  });

  it.each([
    '', 'bad domain.com', 'https://user:pass@gemini.google.com',
    'https://user@gemini.google.com', '127.0.0.1', '[::1]',
    'localhost', 'example.test', 'com', 'chrome://extensions',
    'javascript:alert(1)', '*.google.com',
  ])('rejects unsafe or non-public hostname input %s', (input) => {
    expect(deriveDomainInput(input).ok).toBe(false);
  });
});

describe('canonicalizeConfiguredDomain', () => {
  it('normalizes wildcard, case, IDN, and trailing dot forms', () => {
    expect(canonicalizeConfiguredDomain(' *.Example.COM. ')).toBe('example.com');
    expect(canonicalizeConfiguredDomain('ПРИМЕР.РФ')).toBe(
      'xn--e1afmkfd.xn--p1ai',
    );
  });

  it('rejects empty and path-like values', () => {
    expect(canonicalizeConfiguredDomain('')).toBeNull();
    expect(canonicalizeConfiguredDomain('example.com/path')).toBeNull();
  });
});
