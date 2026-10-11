import type { DomainMutationAction } from './config';

export interface DomainSelectionState {
  action: DomainMutationAction;
  selectedPresent: boolean;
  otherLists: string[];
}

export function deriveDomainSelectionState(
  selectedList: string,
  memberships: string[],
): DomainSelectionState {
  const normalized = [...new Set(memberships)]
    .sort((left, right) => left.localeCompare(right));
  const selectedPresent = normalized.includes(selectedList);
  return {
    action: selectedPresent ? 'remove' : 'add',
    selectedPresent,
    otherLists: normalized.filter((name) => name !== selectedList),
  };
}
