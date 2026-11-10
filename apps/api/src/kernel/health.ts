/** One extra thing the /health route verifies, besides the database. `check` throws when that thing is down. */
export interface HealthCheck {
  name: string;
  check(): Promise<void>;
}
