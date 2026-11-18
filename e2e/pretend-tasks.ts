// The pretend tasks for the browser tests. It answers the same calls as the real API (`GET /tasks`, `POST /tasks`), keeps what the page
// sent, and can be told to refuse the next task.

import type { PretendAnswer } from './pretend-knowledge';

export interface PretendTasks {
  /** The tasks the pretend API has, soonest first, as the real API sends them (each carries its tab in `bucket`). */
  tasks: Array<Record<string, unknown>>;
  /** What the page sent to add a task. */
  postedTasks: Array<Record<string, unknown>>;
  /** What the page sent to change a task, and which tasks it deleted. */
  patchedTasks: Array<{ taskId: string; body: Record<string, unknown> }>;
  deletedTaskIds: string[];
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
    patchedTasks: [],
    deletedTaskIds: [],
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
  // When each asked-about lead's earliest open task is due (the date in the Leads list's Next activity column)
  if (call.path === '/tasks/next-due' && call.method === 'GET') {
    const leadIds = (new URLSearchParams(call.search).get('lead_ids') ?? '').split(',').filter((id) => id !== '');
    const dates = Object.fromEntries(
      leadIds.map((askedLeadId) => {
        const due = state.tasks
          .filter((task) => task['leadId'] === askedLeadId && task['bucket'] !== 'done')
          .map((task) => String(task['dueAt']))
          .sort();
        return [askedLeadId, due[0] ?? null];
      }),
    );
    return { status: 200, body: { dates } };
  }
  const idMatch = /^\/tasks\/([\w-]+)$/u.exec(call.path);
  if (idMatch) return answerOneTaskCall(state, idMatch[1]!, call);
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

/** Answers a change or delete of one task: the pretend API does what the real one does to the list (done moves it to Done, a new due time moves it between tabs). */
function answerOneTaskCall(
  state: PretendTasks,
  taskId: string,
  call: { method: string; body: Record<string, unknown> | null },
): PretendAnswer | undefined {
  const task = state.tasks.find((candidate) => candidate['id'] === taskId);
  if (!task) return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'That task was not found.' } } };
  if (call.method === 'DELETE') {
    state.deletedTaskIds.push(taskId);
    state.tasks = state.tasks.filter((candidate) => candidate['id'] !== taskId);
    return { status: 204, body: undefined };
  }
  if (call.method !== 'PATCH') return undefined;
  if (state.refusal) {
    const { status, code, message } = state.refusal;
    state.refusal = null;
    return { status, body: { error: { code, message } } };
  }
  const body = call.body ?? {};
  state.patchedTasks.push({ taskId, body });
  if (typeof body['title'] === 'string') task['title'] = body['title'];
  if (typeof body['kind'] === 'string') task['kind'] = body['kind'];
  if (typeof body['dueAt'] === 'string') {
    task['dueAt'] = body['dueAt'];
    task['bucket'] = new Date(body['dueAt']).getTime() > Date.now() + 2 * 3_600_000 ? 'upcoming' : 'today';
  }
  if (body['done'] === true) {
    task['bucket'] = 'done';
    task['doneAt'] = new Date().toISOString();
  }
  if (body['done'] === false) {
    task['bucket'] = 'today';
    task['doneAt'] = null;
  }
  return { status: 200, body: task };
}
