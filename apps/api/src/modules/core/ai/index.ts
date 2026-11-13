// The public face of the AI module: the only file other modules may import from it. A feature that needs the AI builds the
// service once and asks it for a job (never for a model).
export { createAiService } from './services/ai-calls.service';
export type { AiCallInput, AiCallRecord, AiCallRecorder } from './services/ai-calls.service';
export { AI_TASKS, AI_TASK_IDS } from './helpers/ai-tasks';
