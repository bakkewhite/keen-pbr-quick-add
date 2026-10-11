export interface KeenPbrList {
  domains?: unknown;
  ip_cidrs?: unknown;
  url?: unknown;
  file?: unknown;
  [key: string]: unknown;
}

export interface KeenPbrRouteRule {
  enabled?: unknown;
  list?: unknown;
  outbound?: unknown;
  [key: string]: unknown;
}

export interface KeenPbrConfig {
  lists: Record<string, KeenPbrList>;
  route?: {
    rules?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ConfigEnvelope {
  config: KeenPbrConfig;
  is_draft: boolean;
}
