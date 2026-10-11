import type {
  RoutingHealth,
  RoutingTest,
  SaveResponse,
  ServiceHealth,
} from './api';
import { KeenPbrApiError } from './api';
import {
  getDomainMemberships,
  planDomainMutation,
} from './config';
import type { DomainMutationAction } from './config';
import type { ConfigEnvelope, KeenPbrConfig } from './keen-pbr-types';

export interface OperationApi {
  getConfig(): Promise<ConfigEnvelope>;
  stageConfig(config: KeenPbrConfig): Promise<Record<string, unknown>>;
  saveConfig(): Promise<SaveResponse>;
  getServiceHealth(): Promise<ServiceHealth>;
  getRoutingHealth(): Promise<RoutingHealth>;
  testRouting(target: string): Promise<RoutingTest>;
}

export interface DomainMutationRequest {
  action: DomainMutationAction;
  list: string;
  domain: string;
}

interface MutationIdentity extends DomainMutationRequest {
  memberships: string[];
}

export type DomainMutationOutcome =
  | ({ status: 'applied-and-verified' } & MutationIdentity)
  | ({ status: 'applied-unverified'; reason: string } & MutationIdentity)
  | ({ status: 'unchanged' } & MutationIdentity)
  | {
      status: 'blocked';
      reason: 'draft' | 'invalid-list';
      memberships?: string[];
    }
  | {
      status: 'failed';
      phase: 'read' | 'stage' | 'save' | 'health';
      writeMayHaveCompleted: boolean;
      reason: string;
    };

export interface Timing {
  confirmationTimeoutMs: number;
  confirmationDelayMs: number;
  healthAttempts: number;
  healthDelayMs: number;
  now(): number;
  sleep(ms: number): Promise<void>;
}

const defaultTiming: Timing = {
  confirmationTimeoutMs: 20_000,
  confirmationDelayMs: 500,
  healthAttempts: 10,
  healthDelayMs: 300,
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

function serviceReady(health: ServiceHealth): boolean {
  return health.status === 'running'
    && health.config_is_draft !== true
    && typeof health.resolver_config_hash === 'string'
    && health.resolver_config_hash.length > 0
    && health.resolver_config_hash_actual === health.resolver_config_hash;
}

function routingVerified(health: RoutingHealth, test: RoutingTest): boolean {
  return health.overall === 'ok'
    && Array.isArray(test.results)
    && test.results.length > 0
    && test.results.every((result) => result.ok === true);
}

function errorReason(error: unknown): string {
  return error instanceof KeenPbrApiError ? error.kind : 'unknown';
}

export async function mutateDomainList(
  api: OperationApi,
  request: DomainMutationRequest,
  timing: Timing = defaultTiming,
): Promise<DomainMutationOutcome> {
  let envelope: ConfigEnvelope;
  try {
    envelope = await api.getConfig();
  } catch (error) {
    return {
      status: 'failed',
      phase: 'read',
      writeMayHaveCompleted: false,
      reason: errorReason(error),
    };
  }

  if (envelope.is_draft) return { status: 'blocked', reason: 'draft' };

  const plan = planDomainMutation(
    envelope.config,
    request.list,
    request.domain,
    request.action,
  );
  if (plan.kind === 'invalid-list') {
    return { status: 'blocked', reason: 'invalid-list' };
  }
  if (plan.kind === 'unchanged') {
    return {
      status: 'unchanged',
      ...request,
      memberships: plan.memberships,
    };
  }

  try {
    await api.stageConfig(plan.config);
  } catch (error) {
    return {
      status: 'failed',
      phase: 'stage',
      writeMayHaveCompleted: error instanceof KeenPbrApiError
        ? error.writeMayHaveCompleted
        : false,
      reason: errorReason(error),
    };
  }

  let save: SaveResponse | null = null;
  let saveUncertain = false;
  try {
    save = await api.saveConfig();
  } catch (error) {
    const uncertain = error instanceof KeenPbrApiError
      && error.writeMayHaveCompleted;
    if (!uncertain) {
      return {
        status: 'failed',
        phase: 'save',
        writeMayHaveCompleted: true,
        reason: errorReason(error),
      };
    }
    saveUncertain = true;
  }

  if (save?.rolled_back) {
    return {
      status: 'failed',
      phase: 'save',
      writeMayHaveCompleted: true,
      reason: 'rolled-back',
    };
  }
  if (save && (!save.saved || !save.applied)) {
    return {
      status: 'failed',
      phase: 'save',
      writeMayHaveCompleted: true,
      reason: 'not-applied',
    };
  }

  let memberships = plan.memberships;
  if (saveUncertain) {
    const deadline = timing.now() + timing.confirmationTimeoutMs;
    let confirmedMemberships: string[] | null = null;

    while (timing.now() < deadline) {
      try {
        const confirmation = await api.getConfig();
        const observedMemberships = getDomainMemberships(
          confirmation.config,
          request.domain,
        );
        const selectedPresent = observedMemberships.includes(request.list);
        const requestedStateObserved = request.action === 'add'
          ? selectedPresent
          : !selectedPresent;
        if (!confirmation.is_draft && requestedStateObserved) {
          confirmedMemberships = observedMemberships;
          break;
        }
      } catch {
        // The API can restart after save; confirmation remains read-only.
      }

      if (timing.now() < deadline) {
        await timing.sleep(timing.confirmationDelayMs);
      }
    }

    if (!confirmedMemberships) {
      return {
        status: 'failed',
        phase: 'save',
        writeMayHaveCompleted: true,
        reason: 'save-outcome-unknown',
      };
    }
    memberships = confirmedMemberships;
  }

  const identity: MutationIdentity = { ...request, memberships };
  let ready = false;
  for (let attempt = 0; attempt < timing.healthAttempts; attempt += 1) {
    try {
      ready = serviceReady(await api.getServiceHealth());
      if (ready) break;
    } catch {
      // Read-only recheck continues until the bounded attempt count.
    }
    if (attempt + 1 < timing.healthAttempts) {
      await timing.sleep(timing.healthDelayMs);
    }
  }

  if (!ready) {
    return {
      status: 'applied-unverified',
      ...identity,
      reason: 'health-not-converged',
    };
  }

  if (request.action === 'remove') {
    return { status: 'applied-and-verified', ...identity };
  }

  try {
    const routingHealth = await api.getRoutingHealth();
    const routingTest = await api.testRouting(request.domain);
    return routingVerified(routingHealth, routingTest)
      ? { status: 'applied-and-verified', ...identity }
      : {
          status: 'applied-unverified',
          ...identity,
          reason: 'routing-not-confirmed',
        };
  } catch {
    return {
      status: 'applied-unverified',
      ...identity,
      reason: 'verification-unavailable',
    };
  }
}
