// The pretend custom fields for the browser tests. It answers the same calls as the real API (`GET /fields`, `POST /fields`), keeps what the page sent,
// and can be told to refuse the next field.

import type { PretendAnswer } from './pretend-knowledge';

export interface PretendFields {
  /** The fields the pretend API has, in the order to show them, as the real API sends them. */
  fields: Array<Record<string, unknown>>;
  /** What the page sent to change a field, by field id. */
  patchedFields: Array<{ id: string; body: Record<string, unknown> }>;
  /** What the page sent to reorder fields. */
  reorders: Array<{ object: string; ids: string[] }>;
  /** The ids of the fields the page removed. */
  removedFieldIds: string[];
  /** What the page sent to add a field. */
  postedFields: Array<Record<string, unknown>>;
  /** When set, the next field is refused with this status, code and message. */
  refusal: { status: number; code: string; message: string } | null;
  /** When true, the list cannot be loaded. */
  fails: boolean;
}

/** Two fields at the start of a test: a dropdown on leads and a date on contacts. */
export function startingFields(): PretendFields {
  return {
    fields: [
      {
        id: 'field-1',
        object: 'lead',
        key: 'car_model',
        label: 'Car model',
        type: 'dropdown',
        options: ['Swift', 'Baleno', 'Brezza'],
        aiAsks: true,
        requiredForWon: true,
      },
      {
        id: 'field-2',
        object: 'contact',
        key: 'birthday',
        label: 'Birthday',
        type: 'date',
        options: [],
        aiAsks: false,
        requiredForWon: false,
      },
    ],
    patchedFields: [],
    removedFieldIds: [],
    reorders: [],
    postedFields: [],
    refusal: null,
    fails: false,
  };
}

/** Answers a fields call, or undefined when it is not one. */
export function answerFieldsCall(
  state: PretendFields,
  call: {
    method: string;
    path: string;
    search: string;
    body: Record<string, unknown> | null;
    role: 'manager' | 'staff';
  },
): PretendAnswer | undefined {
  const fieldIdMatch = /^\/fields\/([^/]+)$/u.exec(call.path);
  if (fieldIdMatch && (call.method === 'PATCH' || call.method === 'DELETE')) {
    if (call.role !== 'manager')
      return { status: 403, body: { error: { code: 'FORBIDDEN', message: 'Not allowed.' } } };
    const field = state.fields.find((candidate) => candidate['id'] === fieldIdMatch[1]);
    if (!field) return { status: 404, body: { error: { code: 'NOT_FOUND', message: "That field wasn't found." } } };
    if (state.refusal) {
      const { status, code, message } = state.refusal;
      state.refusal = null;
      return { status, body: { error: { code, message } } };
    }
    if (call.method === 'DELETE') {
      state.removedFieldIds.push(String(field['id']));
      state.fields = state.fields.filter((candidate) => candidate !== field);
      return { status: 204 };
    }
    state.patchedFields.push({ id: String(field['id']), body: call.body ?? {} });
    Object.assign(field, call.body ?? {});
    return { status: 200, body: field };
  }
  if (call.path === '/fields/reorder' && call.method === 'POST') {
    if (call.role !== 'manager')
      return { status: 403, body: { error: { code: 'FORBIDDEN', message: 'Not allowed.' } } };
    const object = String(call.body?.['object']);
    const ids = (call.body?.['ids'] ?? []) as string[];
    state.reorders.push({ object, ids });
    const ofObject = state.fields.filter((field) => field['object'] === object);
    const others = state.fields.filter((field) => field['object'] !== object);
    state.fields = [...ids.map((id) => ofObject.find((field) => field['id'] === id)!), ...others];
    return { status: 200, body: { items: state.fields.filter((field) => field['object'] === object) } };
  }
  if (call.path !== '/fields') return undefined;
  if (call.method === 'GET') {
    if (state.fails) return { status: 500, body: { error: { code: 'UNKNOWN_ERROR', message: 'Down.' } } };
    const object = new URLSearchParams(call.search).get('object');
    return {
      status: 200,
      body: { items: state.fields.filter((field) => object === null || field['object'] === object) },
    };
  }
  if (call.method === 'POST') {
    if (call.role !== 'manager')
      return { status: 403, body: { error: { code: 'FORBIDDEN', message: 'Not allowed.' } } };
    if (state.refusal) {
      const { status, code, message } = state.refusal;
      state.refusal = null;
      return { status, body: { error: { code, message } } };
    }
    state.postedFields.push(call.body ?? {});
    const label = String(call.body?.['label']);
    const field = {
      id: `field-new-${state.postedFields.length}`,
      object: call.body?.['object'],
      key: label.toLowerCase().replace(/[^a-z0-9]+/gu, '_'),
      label,
      type: call.body?.['type'],
      options: call.body?.['options'] ?? [],
      aiAsks: call.body?.['aiAsks'] ?? false,
      requiredForWon: call.body?.['requiredForWon'] ?? false,
    };
    state.fields.push(field);
    return { status: 201, body: field };
  }
  return undefined;
}
