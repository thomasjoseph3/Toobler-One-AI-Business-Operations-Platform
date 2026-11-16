// npm run eval:agent [-- --only <scenario id>] [--show]
// Measures whether the AI agent follows its rules (docs/features/F19-ai-agent-and-test-the-agent.md, "Tests"). Scripted customers (the
// scenarios in evals/agent/hotel_resort.jsonl) talk to the real agent, with a real AI model, about an example business
// (evals/agent/hotel_resort.business.json). Every conversation is checked against the rules that always apply (no amount nobody gave, no
// request for card or OTP details) and the scenario's own expectations (the right promise, the right tools, no competitor names).
//
// It uses the platform's own AI keys from .env and does NOT touch the database: the example business, its FAQs and the list of unanswered
// questions are all in memory. A run makes a few dozen small AI calls (a few cents). It never prints a key. Exit code 1 when a scenario fails.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, loadEnvFile } from '../apps/api/src/kernel/config';
import { createLangChainProvider, readLlmError, type LlmCandidate } from '../apps/api/src/providers/llm';
import {
  checkScenario,
  parseAgentEvalScenarios,
  summariseEvalRun,
} from '../apps/api/src/modules/core/agents/helpers/agent-eval';
import { EMPTY_AGENT_CONVERSATION_STATE } from '../apps/api/src/modules/core/agents/helpers/agent-conversation-state';
import type { AgentTurnData } from '../apps/api/src/modules/core/agents/helpers/agent-turn-data';
import {
  describeBusinessFacts,
  describeOffers,
  describeSituations,
  describeWhatWeSell,
} from '../apps/api/src/modules/core/agents/helpers/build-agent-prompt';
import {
  createAgentRuntime,
  type AgentAiService,
} from '../apps/api/src/modules/core/agents/services/agent-runtime.service';
import type { Database } from '../apps/api/src/kernel/database';

// The first choices for the job, the same kind of model the app's settings use for chat replies
const MODEL_FOR_EACH_COMPANY = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-5-5',
} as const;

interface ExampleBusiness {
  businessName: string;
  timeZone: string;
  facts: AgentTurnData['knowledge']['facts'];
  situations: AgentTurnData['knowledge']['situations'];
  offerings: AgentTurnData['whatWeSell']['offerings'];
  offers: AgentTurnData['whatWeSell']['offers'];
  faqs: Array<{ question: string; answer: string }>;
}

// --show prints each reply and the tools used (the customers here are made up, so nothing private is shown)
const showDetails = process.argv.includes('--show');
const onlyArgument = process.argv.indexOf('--only');
const onlyScenarioId = onlyArgument >= 0 ? process.argv[onlyArgument + 1] : undefined;

loadEnvFile();
const config = loadConfig();
const provider = createLangChainProvider();

const candidates: LlmCandidate[] = [];
for (const companyId of ['gemini', 'openai', 'anthropic'] as const) {
  const apiKey = config.ai.platformKeys[companyId][0];
  if (apiKey) {
    candidates.push({
      provider: companyId,
      modelName: MODEL_FOR_EACH_COMPANY[companyId],
      apiKey,
      keySource: 'platform',
      keyPosition: 1,
    });
  }
}
if (candidates.length === 0) {
  console.error(
    'No AI key found in .env (GEMINI_API_KEY, OPENAI_API_KEY or ANTHROPIC_API_KEY). Add one and try again.',
  );
  process.exit(1);
}

const evalFolder = path.resolve(import.meta.dirname, '../evals/agent');
const business = JSON.parse(
  fs.readFileSync(path.join(evalFolder, 'hotel_resort.business.json'), 'utf8'),
) as ExampleBusiness;
const allScenarios = parseAgentEvalScenarios(fs.readFileSync(path.join(evalFolder, 'hotel_resort.jsonl'), 'utf8'));
const scenarios = onlyScenarioId ? allScenarios.filter((scenario) => scenario.id === onlyScenarioId) : allScenarios;
if (scenarios.length === 0) {
  console.error(`There is no scenario "${onlyScenarioId}".`);
  process.exit(1);
}

// A Monday morning in the business's own time zone, so the example business is open
const turnData: AgentTurnData = {
  businessName: business.businessName,
  timeZone: business.timeZone,
  knowledge: { facts: business.facts, situations: business.situations, weeklyHours: { allDay: true } },
  whatWeSell: { offerings: business.offerings, offers: business.offers },
  now: new Date('2026-11-16T04:00:00Z'),
};

/** The AI company's models, without the database: the same prompt and tools the app uses, with these candidates. */
const aiService: AgentAiService = {
  generateWithTools: (input) =>
    provider.generateWithTools({
      tag: input.tag,
      candidates,
      prompt: input.prompt,
      tools: input.tools,
      temperature: 0.3,
      maxOutputTokens: 1200,
    }),
  generateText: (input) =>
    provider.generateText({
      tag: input.tag,
      candidates,
      prompt: input.prompt,
      temperature: 0.3,
      maxOutputTokens: 1200,
    }),
};

// Filler words that say nothing about the subject (the app's real search leaves them out too)
const FILLER_WORDS = new Set([
  'have',
  'does',
  'your',
  'with',
  'there',
  'what',
  'where',
  'when',
  'which',
  'this',
  'that',
  'from',
  'about',
  'place',
  'here',
]);
const meaningfulWords = (text: string): string[] =>
  (text.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((word) => !FILLER_WORDS.has(word));

/** The FAQs, searched by words they share with the question (the app uses the database for this). */
const knowledgeSearch = {
  searchKnowledge: async (_accountId: string, text: string, limit = 3) => {
    const wanted = new Set(meaningfulWords(text));
    const scored = business.faqs
      .map((faq) => ({
        faq,
        score: meaningfulWords(faq.question).filter((word) => wanted.has(word)).length,
      }))
      .filter((item) => item.score > 0)
      .sort((first, second) => second.score - first.score)
      .slice(0, limit);
    return {
      items: scored.map((item) => ({
        sourceKind: 'faq' as const,
        sourceId: item.faq.question,
        question: item.faq.question,
        answer: item.faq.answer,
        score: item.score,
      })),
    };
  },
};
const unansweredQuestions = { logUnansweredQuestion: async () => ({ id: 'in-memory', count: 1 }) };

const runtime = createAgentRuntime({
  // The runtime reads nothing from the database here: the example business is given to it
  database: undefined as unknown as Database,
  aiService,
  knowledgeSearch,
  unansweredQuestions,
  readTurnData: async () => turnData,
  now: () => turnData.now,
});

const businessText = [
  describeBusinessFacts(turnData.knowledge),
  describeSituations(turnData.knowledge),
  describeWhatWeSell(turnData.whatWeSell),
  describeOffers(turnData.whatWeSell),
  ...business.faqs.map((faq) => `${faq.question} ${faq.answer}`),
];

console.log(`Running ${scenarios.length} agent scenarios against ${business.businessName}`);
console.log(
  `Trying: ${candidates.map((candidate) => `${candidate.provider}/${candidate.modelName}`).join(', then ')}\n`,
);

const results: Array<{ id: string; problems: string[] }> = [];
for (const scenario of scenarios) {
  let state = EMPTY_AGENT_CONVERSATION_STATE;
  const messages: Array<{ role: 'user' | 'assistant'; text: string }> = [];
  const replies: string[] = [];
  const toolsCalled: string[] = [];
  const toolResults: string[] = [];
  let problems: string[];
  try {
    for (const customerMessage of scenario.customerMessages) {
      messages.push({ role: 'user', text: customerMessage });
      const turn = await runtime.runTurn({
        accountId: 'eval-business',
        conversationId: null,
        channel: 'webchat',
        messages,
        state,
      });
      state = turn.state;
      replies.push(turn.reply);
      messages.push({ role: 'assistant', text: turn.reply });
      if (showDetails) {
        console.log(`   customer: ${customerMessage}`);
        console.log(`   agent:    ${turn.reply}`);
        console.log(
          `   tools:    ${turn.toolCalls.map((call) => `${call.toolName}${call.ok ? '' : ' (failed)'} ${JSON.stringify(call.input)}`).join(' | ') || '(none)'}`,
        );
      }
      for (const call of turn.toolCalls) {
        toolsCalled.push(call.toolName);
        if (call.ok) toolResults.push(call.result);
      }
    }
    problems = checkScenario(scenario, {
      replies,
      toolsCalled,
      finalState: state,
      sourcesForAmounts: [...scenario.customerMessages, ...toolResults, ...businessText],
    });
  } catch (error) {
    // A failed AI call is a failed scenario, said by its kind (never the provider's own words)
    problems = [`The AI call failed (${readLlmError(error)}).`];
  }
  results.push({ id: scenario.id, problems });
  console.log(`${problems.length === 0 ? 'PASS' : 'FAIL'}  ${scenario.id}`);
  for (const problem of problems) console.log(`        ${problem}`);
}

const summary = summariseEvalRun(results);
console.log(`\n${summary.passed} of ${summary.total} scenarios passed.`);
if (summary.failedIds.length > 0) {
  console.log(`Failed: ${summary.failedIds.join(', ')}`);
  process.exit(1);
}
