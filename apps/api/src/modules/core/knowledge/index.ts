// The public face of the knowledge module: the only file other modules may import from it.
// The AI agent (F19) records a question it could not answer with `logUnansweredQuestion` and looks answers up with `searchKnowledge`. Later slices add the confirmed-answers reader
// for the AI agent and the default country for contacts.
export { createUnansweredQuestionsService } from './services/unanswered-questions.service';
export { createKnowledgeSearchService } from './services/knowledge-search.service';
// The AI agent (F19) reads what the business has told it (confirmed answers, situations, opening hours) through this one function.
export { findBusinessKnowledgeForTheAgent } from './services/agent-knowledge.service';
export type {
  BusinessFactForTheAgent,
  BusinessKnowledgeForTheAgent,
  SituationForTheAgent,
} from './services/agent-knowledge.service';
// The setup wizard (F31) reads which questions are answered through the profile service.
export { createKnowledgeService } from './services/knowledge.service';
// The setup wizard's reading job asks which questions a website can fill in, and saves what it read as "waiting for a check".
export { createPrefilledAnswersService, listPrefillableQuestions } from './services/prefilled-answers.service';
export type { PrefilledAnswer, SavePrefilledAnswersResult } from './services/prefilled-answers.service';
export type { QuestionDefinition } from './helpers/question-types';
