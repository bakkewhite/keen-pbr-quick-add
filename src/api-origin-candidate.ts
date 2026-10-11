export interface ApiOriginCandidateTab {
  url: string;
  title: string;
}

export function deriveApiOriginCandidate(
  tab: ApiOriginCandidateTab,
): string | null {
  try {
    const url = new URL(tab.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const titleMatches = tab.title.toLocaleLowerCase('en-US').includes('keen-pbr');
    return url.port === '12121' || titleMatches ? url.origin : null;
  } catch {
    return null;
  }
}
