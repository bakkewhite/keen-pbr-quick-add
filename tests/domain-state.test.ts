import { describe, expect, it } from 'vitest';
import { deriveDomainSelectionState } from '../src/domain-state';

describe('deriveDomainSelectionState', () => {
  it('returns add-ready when absent everywhere', () => {
    expect(deriveDomainSelectionState('local', [])).toEqual({
      action: 'add',
      selectedPresent: false,
      otherLists: [],
    });
  });

  it('returns add-warning with stable deduplicated other lists', () => {
    expect(deriveDomainSelectionState(
      'local', ['microsoft', 'google_ai', 'microsoft'],
    )).toEqual({
      action: 'add',
      selectedPresent: false,
      otherLists: ['google_ai', 'microsoft'],
    });
  });

  it('returns remove and excludes the selected list from warnings', () => {
    expect(deriveDomainSelectionState(
      'local', ['local', 'google_ai'],
    )).toEqual({
      action: 'remove',
      selectedPresent: true,
      otherLists: ['google_ai'],
    });
  });
});
