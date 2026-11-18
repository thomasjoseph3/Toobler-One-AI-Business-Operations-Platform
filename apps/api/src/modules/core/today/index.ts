// The public face of the Today module (F22): the only file other modules may import from it.
// For now it exposes the pure section logic and its types; later slices add the read endpoint and service.
export { buildTodaySections } from './helpers/today-sections';
export type {
  LeadForToday,
  TaskForToday,
  TodayBounds,
  TodaySections,
  TodayLeadItem,
  TodayTaskItem,
  ThisWeekSummary,
} from './helpers/today-sections';
