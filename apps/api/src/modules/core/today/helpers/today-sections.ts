// What the Today page shows, decided in code from leads and tasks the caller may see. Pure logic: no database and no
// clock. The service reads the rows and works out the day boundaries (in the business's time zone); this file only sorts
// them into the five sections and does the "this week" sums, so every rule can be tested on its own with plain dates.
//
// The three definitions the requirement leaves to us (recorded as R81 in docs/REQUIREMENTS-REVIEW.md):
//   - "not yet contacted": the lead has had no staff touch yet (`contactedAt` is null). A touch is a stage move or a
//     staff note today; a logged call will count too once F29 adds calls.
//   - "came in overnight": a new, uncontacted lead created since the last closing time (the service passes that moment).
//   - "time to first call": time from the lead being created to its first touch, shown as "time to first reply" until
//     F29 logs real calls.

/** A lead, reduced to only what Today needs to sort and count it. `contactedAt` is the first staff touch, or null. */
export interface LeadForToday {
  id: string;
  contactId: string;
  ownerUserId: string | null;
  temperature: 'unscored' | 'hot' | 'warm' | 'cold';
  /** 'open' while the lead is live; 'won' or 'lost' once it is closed. */
  stageKind: 'open' | 'won' | 'lost';
  createdAt: Date;
  /** When staff promised to call back, if they did. A past callback on an open lead is "late". */
  callbackAt: Date | null;
  /** When the lead was closed (won or lost), if it has been. */
  closedAt: Date | null;
  /** The first time staff touched the lead (earliest stage move or note); null means nobody has yet. */
  contactedAt: Date | null;
}

/** A task, reduced to only what Today needs. An open task has `doneAt` null. */
export interface TaskForToday {
  id: string;
  ownerUserId: string;
  dueAt: Date;
  doneAt: Date | null;
}

/** The day boundaries the service works out in the business's time zone and passes in, so this file stays free of clocks. */
export interface TodayBounds {
  now: Date;
  /** Local midnight tonight: a task due before this (and not yet past) is due "today". */
  startOfTomorrow: Date;
  /** Local midnight at the start of this week (Monday): the window for the "this week" counts. */
  startOfWeek: Date;
  /** The most recent closing time (18:00 business-local by default): leads in since then "came in overnight". */
  lastClosingTime: Date;
}

/** One lead as it appears in a section: just its ids and the words/temperature the card shows; names are added later. */
export interface TodayLeadItem {
  leadId: string;
  contactId: string;
  temperature: LeadForToday['temperature'];
  /** Why it is here: a past callback ('callback'), newly in ('new'), or simply hot ('hot'). */
  reason: 'callback' | 'new' | 'hot';
}

/** One task as it appears in a section: its id and due time; the person and title are added by the service. */
export interface TodayTaskItem {
  taskId: string;
  dueAt: Date;
}

/** The "this week" numbers, all computed in code (the AI never counts). */
export interface ThisWeekSummary {
  leadsIn: number;
  leadsContacted: number;
  leadsWon: number;
  /** Average minutes from a lead coming in to its first staff touch, over this week's touched leads; null if none yet. */
  averageMinutesToFirstReply: number | null;
}

/** Everything the Today page shows, ready for the service to attach names to. */
export interface TodaySections {
  late: { leads: TodayLeadItem[]; tasks: TodayTaskItem[] };
  hot: TodayLeadItem[];
  dueToday: TodayTaskItem[];
  overnight: TodayLeadItem[];
  thisWeek: ThisWeekSummary;
}

/** True while the lead is still live (not won or lost). */
function isOpen(lead: LeadForToday): boolean {
  return lead.stageKind === 'open';
}

/** True when no staff has touched the lead yet (no stage move, no note); the basis of "not yet contacted". */
function isNotContacted(lead: LeadForToday): boolean {
  return lead.contactedAt === null;
}

/** Tasks sorted soonest-due first, so the next thing to do is at the top. */
function bySoonestDue(first: TodayTaskItem, second: TodayTaskItem): number {
  return first.dueAt.getTime() - second.dueAt.getTime();
}

/** Leads sorted newest-first by when they came in, so the freshest enquiry is at the top. */
function byNewestLead(leadById: Map<string, LeadForToday>) {
  return (first: TodayLeadItem, second: TodayLeadItem): number =>
    leadById.get(second.leadId)!.createdAt.getTime() - leadById.get(first.leadId)!.createdAt.getTime();
}

/**
 * Sorts the caller's leads and tasks into the five Today sections and works out the week numbers.
 * The caller has already limited `leads` and `tasks` to what the signed-in person may see (their own, or the team).
 */
export function buildTodaySections(
  leads: readonly LeadForToday[],
  tasks: readonly TaskForToday[],
  bounds: TodayBounds,
): TodaySections {
  const nowTime = bounds.now.getTime();
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));

  // Late: open tasks already past due, and open leads whose promised callback time has gone by.
  const lateTasks = tasks
    .filter((task) => task.doneAt === null && task.dueAt.getTime() < nowTime)
    .map((task) => ({ taskId: task.id, dueAt: task.dueAt }))
    .sort(bySoonestDue);
  const lateLeads = leads
    .filter((lead) => isOpen(lead) && lead.callbackAt !== null && lead.callbackAt.getTime() < nowTime)
    .map((lead) => ({
      leadId: lead.id,
      contactId: lead.contactId,
      temperature: lead.temperature,
      reason: 'callback' as const,
    }))
    .sort(byNewestLead(leadById));

  // Hot: hot leads nobody has contacted yet.
  const hot = leads
    .filter((lead) => lead.temperature === 'hot' && isOpen(lead) && isNotContacted(lead))
    .map((lead) => ({
      leadId: lead.id,
      contactId: lead.contactId,
      temperature: lead.temperature,
      reason: 'hot' as const,
    }))
    .sort(byNewestLead(leadById));

  // Due today: open tasks due later today (past-due ones are already under Late).
  const dueToday = tasks
    .filter(
      (task) =>
        task.doneAt === null &&
        task.dueAt.getTime() >= nowTime &&
        task.dueAt.getTime() < bounds.startOfTomorrow.getTime(),
    )
    .map((task) => ({ taskId: task.id, dueAt: task.dueAt }))
    .sort(bySoonestDue);

  // Came in overnight: new, still-uncontacted leads that arrived since the last closing time.
  const overnight = leads
    .filter(
      (lead) => isOpen(lead) && isNotContacted(lead) && lead.createdAt.getTime() >= bounds.lastClosingTime.getTime(),
    )
    .map((lead) => ({
      leadId: lead.id,
      contactId: lead.contactId,
      temperature: lead.temperature,
      reason: 'new' as const,
    }))
    .sort(byNewestLead(leadById));

  return {
    late: { leads: lateLeads, tasks: lateTasks },
    hot,
    dueToday,
    overnight,
    thisWeek: summariseThisWeek(leads, bounds.startOfWeek),
  };
}

/** The week numbers: leads that came in, were first touched, or were won since the week began, and the average time to first touch. */
function summariseThisWeek(leads: readonly LeadForToday[], startOfWeek: Date): ThisWeekSummary {
  const weekStartTime = startOfWeek.getTime();
  const cameInThisWeek = leads.filter((lead) => lead.createdAt.getTime() >= weekStartTime);
  const leadsContacted = leads.filter(
    (lead) => lead.contactedAt !== null && lead.contactedAt.getTime() >= weekStartTime,
  ).length;
  const leadsWon = leads.filter(
    (lead) => lead.stageKind === 'won' && lead.closedAt !== null && lead.closedAt.getTime() >= weekStartTime,
  ).length;

  // Average time to first touch over the leads that came in this week and have since been touched.
  const touchedThisWeek = cameInThisWeek.filter((lead) => lead.contactedAt !== null);
  const averageMinutesToFirstReply =
    touchedThisWeek.length === 0
      ? null
      : Math.round(
          touchedThisWeek.reduce(
            (total, lead) => total + (lead.contactedAt!.getTime() - lead.createdAt.getTime()) / 60_000,
            0,
          ) / touchedThisWeek.length,
        );

  return {
    leadsIn: cameInThisWeek.length,
    leadsContacted,
    leadsWon,
    averageMinutesToFirstReply,
  };
}
