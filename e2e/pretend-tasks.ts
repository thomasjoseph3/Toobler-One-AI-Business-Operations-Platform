// The pretend tasks for the browser tests. It answers the same calls as the real API (`GET /tasks`, `POST /tasks`), keeps what the page
// sent, and can be told to refuse the next task.

import type { PretendAnswer } from './pretend-knowledge';

export interface PretendTasks {
  /** The tasks the pretend API has, soonest first, as the real API sends them (each carries its tab in `bucket`). */
  tasks: Array<Record<string, unknown>>;
  /** What the page sent to add a task. */
  postedTasks: Array<Record<string, unknown>>;
  /** When set, the next task is refused with this status and code. */
  refusal: { status: number; code: string; message: string } | null;
}

/** Builds one pretend task for the lead-0 person ("Priya Menon 0"), owned by the signed-in person or by a colleague. */
function pretendTask(
  id: string,
  title: string,
  bucket: 'overdue' | 'today' | 'upcoming' | 'done',
  options: { ownerUserId: string; ownerName: string; kind?: string },
): Record<string, unknown> {
  const hoursFromNow = { overdue: -3, today: 2, upcoming: 72, done: -30 }[bucket];
  return {
    id,
    kind: options.kind ?? 'call',
    title,
    dueAt: new Date(Date.now() + hoursFromNow * 3_600_000).toISOString(),
    bucket,
    doneAt: bucket === 'done' ? new Date(Date.now() - 20 * 3_600_000).toISOString() : null,
    contact: { id: 'contact-0', name: 'Priya Menon 0' },
    leadId: 'lead-0',
    owner: { userId: options.ownerUserId, name: options.ownerName },
    createdByAgent: null,
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  };
}

/** Four tasks, one in each tab: three are yours, the one Maya owns is in Upcoming. */
export function startingTasks(signedInUserId: string, signedInUserName: string): PretendTasks {
  const mine = { ownerUserId: signedInUserId, ownerName: signedInUserName };
  return {
    tasks: [
      pretendTask('task-overdue', 'Call Priya about the quote', 'overdue', mine),
      pretendTask('task-today', 'Send the brochure', 'today', { ...mine, kind: 'email' }),
      pretendTask('task-upcoming', 'Check in after the stay', 'upcoming', {
        ownerUserId: 'user-colleague',
        ownerName: 'Maya Chen',
        kind: 'todo',
      }),
      pretendTask('task-done', 'Confirm the dates', 'done', mine),
    ],
    postedTasks: [],
    refusal: null,
  };
}

/** Answers a tasks call, or undefined when the call is not about tasks. */
export function answerTasksCall(
  state: PretendTasks,
  call: {
    method: string;
    path: string;
    search: string;
    body: Record<string, unknown> | null;
    userName: string;
    userId: string;
  },
): PretendAnswer | undefined {
  if (call.path !== '/tasks') return undefined;
  if (call.method === 'POST') {
    if (state.refusal) {
      const { status, code, message } = state.refusal;
      state.refusal = null;
      return { status, body: { error: { code, message } } };
    }
    state.postedTasks.push(call.body ?? {});
    const taskLeadId = call.body?.['leadId'] === undefined ? null : String(call.body['leadId']);
    const task = {
      ...pretendTask(`task-new-${state.postedTasks.length}`, String(call.body?.['title']), 'upcoming', {
        ownerUserId: call.userId,
        ownerName: call.userName,
        kind: String(call.body?.['kind'] ?? 'todo'),
      }),
      dueAt: String(call.body?.['dueAt']),
      leadId: taskLeadId,
    };
    state.tasks = [...state.tasks, task];
    return { status: 201, body: task };
  }
  if (call.method !== 'GET') return undefined;
  const params = new URLSearchParams(call.search);
  const leadId = params.get('lead_id');
  const tab = params.get('due');
  const onlyMine = params.get('owner') === 'me';
  const matching = state.tasks.filter(
    (task) =>
      (leadId === null || task['leadId'] === leadId) &&
      (!onlyMine || (task['owner'] as { userId: string }).userId === call.userId),
  );
  const countOf = (bucket: string) => matching.filter((task) => task['bucket'] === bucket).length;
  const items = matching.filter((task) => (tab === null ? task['bucket'] !== 'done' : task['bucket'] === tab));
  return {
    status: 200,
    body: {
      items,
      total: items.length,
      page: 1,
      limit: 25,
      counts: {
        overdue: countOf('overdue'),
        today: countOf('today'),
        upcoming: countOf('upcoming'),
        done: countOf('done'),
      },
    },
  };
}
