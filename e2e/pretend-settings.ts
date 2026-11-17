// The pretend AI settings, keys, usage and modules for the browser tests. It answers the same calls as the real API (`/ai/settings`, `/ai/keys`,
// `/ai/usage`, `/modules`), keeps what the page sent, and can be told to refuse. A key is never kept: only its preview, as the real API does.

import type { PretendAnswer } from './pretend-knowledge';

export interface PretendSettings {
  keyMode: string;
  platformAccess: { enabled: boolean; monthlyCallCap: number | null; expiresAt: string | null };
  usage: { calls: number; failures: number; fallbacks: number; used: number };
  keys: Array<Record<string, unknown>>;
  modules: Array<Record<string, unknown>>;
  /** What the page sent. A key's text is checked here and then thrown away, so a test can check it travelled once and was never kept. */
  addedKeys: Array<{ provider: string; label: string; keyLength: number }>;
  keyModeChanges: string[];
  testedKeyIds: string[];
  deletedKeyIds: string[];
  moduleChanges: Array<{ id: string; enabled: boolean }>;
  /** What the next key test finds. */
  nextTestOutcome: 'works' | 'rejected' | 'quota' | 'no_model' | 'unreachable';
  /** When set, the next change is refused with this status, code and message. */
  refusal: { status: number; code: string; message: string } | null;
  aiFails: boolean;
  modulesFail: boolean;
}

const NOW = '2026-11-17T10:00:00.000Z';

export function startingSettings(): PretendSettings {
  return {
    keyMode: 'own_then_platform',
    platformAccess: { enabled: true, monthlyCallCap: 1000, expiresAt: '2026-12-31' },
    usage: { calls: 250, failures: 3, fallbacks: 1, used: 250 },
    keys: [
      {
        id: '0191f0a0-0000-7000-8000-0000000000a1',
        provider: 'gemini',
        label: 'Main Gemini key',
        keyPreview: '••••3f9a',
        status: 'working',
        statusNote: 'Answered a real request.',
        statusCheckedAt: NOW,
        createdAt: NOW,
      },
      {
        id: '0191f0a0-0000-7000-8000-0000000000a2',
        provider: 'openai',
        label: 'Spare OpenAI key',
        keyPreview: '••••77bc',
        status: 'unchecked',
        statusNote: null,
        statusCheckedAt: null,
        createdAt: NOW,
      },
    ],
    modules: [
      {
        id: 'engine.leads',
        kind: 'engine',
        name: 'Lead engine',
        description: 'Leads, contacts and the pipeline.',
        requires: [],
        state: 'active',
      },
      {
        id: 'channel.webchat',
        kind: 'channel',
        name: 'Website chat',
        description: 'The chat bubble on your website.',
        requires: ['engine.leads'],
        state: 'active',
      },
      {
        id: 'channel.whatsapp',
        kind: 'channel',
        name: 'WhatsApp',
        description: 'The AI answers on WhatsApp.',
        requires: ['engine.leads'],
        state: 'not_in_plan',
      },
      {
        id: 'feature.followups',
        kind: 'feature',
        name: 'Follow-ups',
        description: 'Automatic follow-up messages.',
        requires: ['engine.leads'],
        state: 'off',
      },
    ],
    addedKeys: [],
    keyModeChanges: [],
    testedKeyIds: [],
    deletedKeyIds: [],
    moduleChanges: [],
    nextTestOutcome: 'works',
    refusal: null,
    aiFails: false,
    modulesFail: false,
  };
}

export function answerSettingsCall(
  state: PretendSettings,
  call: { method: string; path: string; body: Record<string, unknown> | null; role: 'manager' | 'staff' },
): PretendAnswer | undefined {
  const { method, path, body, role } = call;
  const isAi = path.startsWith('/ai/');
  const isModules = path.startsWith('/modules');
  if (!isAi && !isModules) return undefined;
  const refuseStaff = (): PretendAnswer => ({
    status: 403,
    body: { error: { code: 'FORBIDDEN', message: 'Not allowed.' } },
  });
  const refused = (): PretendAnswer | undefined => {
    if (!state.refusal) return undefined;
    const { status, code, message } = state.refusal;
    return { status, body: { error: { code, message } } };
  };

  if (isAi && role !== 'manager') return refuseStaff(); // every AI route is for managers

  if (path === '/ai/settings' && method === 'GET') {
    if (state.aiFails) return { status: 500, body: { error: { code: 'BROKEN', message: 'Broken.' } } };
    return { status: 200, body: { keyMode: state.keyMode, taskModels: {}, platformAccess: state.platformAccess } };
  }
  if (path === '/ai/settings' && method === 'PUT') {
    const refusal = refused();
    if (refusal) return refusal;
    state.keyModeChanges.push(String(body?.['keyMode']));
    state.keyMode = String(body?.['keyMode']);
    return { status: 200, body: { keyMode: state.keyMode, taskModels: {}, platformAccess: state.platformAccess } };
  }
  if (path === '/ai/usage' && method === 'GET') {
    return {
      status: 200,
      body: {
        from: '2026-11-01',
        to: '2026-11-17',
        groupBy: null,
        totals: {
          calls: state.usage.calls,
          failures: state.usage.failures,
          fallbacks: state.usage.fallbacks,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          cacheHitRate: 0,
        },
        groups: [],
        platform: {
          enabled: state.platformAccess.enabled,
          monthlyCallCap: state.platformAccess.monthlyCallCap,
          usedThisMonth: state.usage.used,
          remainingThisMonth:
            state.platformAccess.monthlyCallCap === null
              ? null
              : state.platformAccess.monthlyCallCap - state.usage.used,
          expiresAt: state.platformAccess.expiresAt,
        },
      },
    };
  }
  if (path === '/ai/keys' && method === 'GET') return { status: 200, body: { items: state.keys } };
  if (path === '/ai/keys' && method === 'POST') {
    const refusal = refused();
    if (refusal) return refusal;
    const key = String(body?.['key'] ?? '');
    state.addedKeys.push({
      provider: String(body?.['provider']),
      label: String(body?.['label']),
      keyLength: key.length,
    });
    const created = {
      id: `0191f0a0-0000-7000-8000-0000000000${(0xa3 + state.addedKeys.length - 1).toString(16)}`,
      provider: body?.['provider'],
      label: body?.['label'],
      keyPreview: `••••${key.slice(-4)}`,
      status: 'unchecked',
      statusNote: null,
      statusCheckedAt: null,
      createdAt: NOW,
    };
    state.keys.push(created);
    return { status: 201, body: created };
  }
  const keyMatch = /^\/ai\/keys\/([^/]+)(\/test)?$/.exec(path);
  if (keyMatch) {
    const target = state.keys.find((item) => item['id'] === keyMatch[1]);
    if (!target) return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'That was not found.' } } };
    if (method === 'DELETE') {
      state.deletedKeyIds.push(String(target['id']));
      state.keys = state.keys.filter((item) => item !== target);
      return { status: 204 };
    }
    if (method === 'POST' && keyMatch[2]) {
      state.testedKeyIds.push(String(target['id']));
      const works = state.nextTestOutcome === 'works';
      Object.assign(target, {
        status: works ? 'working' : state.nextTestOutcome === 'quota' ? 'limited' : 'failed',
        statusCheckedAt: NOW,
      });
      return {
        status: 200,
        body: {
          key: target,
          outcome: state.nextTestOutcome,
          modelName: works ? 'gemini-2.5-flash' : null,
          latencyMs: works ? 412.6 : null,
        },
      };
    }
  }

  if (path === '/modules' && method === 'GET') {
    if (state.modulesFail) return { status: 500, body: { error: { code: 'BROKEN', message: 'Broken.' } } };
    return { status: 200, body: { items: state.modules } };
  }
  const moduleMatch = /^\/modules\/([a-z]+\.[a-z_]+)$/.exec(path);
  if (moduleMatch && method === 'PATCH') {
    if (role !== 'manager') return refuseStaff();
    const refusal = refused();
    if (refusal) return refusal;
    const target = state.modules.find((item) => item['id'] === moduleMatch[1]);
    if (!target) return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'That was not found.' } } };
    const enabled = body?.['enabled'] === true;
    state.moduleChanges.push({ id: String(target['id']), enabled });
    target['state'] = enabled ? 'active' : 'off';
    return { status: 200, body: target };
  }
  return undefined;
}
