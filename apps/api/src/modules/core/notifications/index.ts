// The public face of the notifications module (F23: staff alerts and the morning summary).
// For now it exposes the pure alert rules; later slices add the event handlers, the morning-summary job and the settings.
export {
  decideAlert,
  audienceForAlert,
  isAlertKindOptional,
  isWithinOfficeHours,
  localMinutesOfDay,
  REQUIRED_ALERT_KINDS,
} from './helpers/alert-rules';
export type { AlertKind, AlertAudience, AlertDecision, OfficeHours } from './helpers/alert-rules';
