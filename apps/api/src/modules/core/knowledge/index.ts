// The public face of the knowledge module: the only file other modules may import from it.
// The AI agent (F19) records a question it could not answer with `logUnansweredQuestion`. Later slices add the confirmed-answers reader
// for the AI agent and the default country for contacts.
export { createUnansweredQuestionsService } from './services/unanswered-questions.service';
