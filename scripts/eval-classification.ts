// npm run eval:types [-- --industry hotel_resort]
// Measures how well the AI sorts conversations (docs/CONVERSATION-TYPES.md, "How we test it"). It reads the labelled examples in
// evals/classification/<industry>.jsonl, asks the AI to sort each one with exactly the prompt the app uses, and prints three numbers
// against their targets: the main type right (90%), complaints kept (95%), and non-sales that became leads (at most 5%). It exits with
// an error when a target is missed or a call failed, so it can run before changing a prompt, a model or a type preset.
//
// It uses the platform's own AI keys from .env and does NOT touch the database. Each example is one small real AI call, so a run costs a
// few thousand tokens. It never prints a key and never prints an example's text.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, loadEnvFile } from '../apps/api/src/kernel/config';
import { createLangChainProvider, readLlmError, type LlmCandidate } from '../apps/api/src/providers/llm';
import {
  CLASSIFIER_PROMPT_VERSION,
  buildClassificationSchema,
  buildConversationMessage,
  buildStableInstructions,
} from '../apps/api/src/modules/core/conversations/helpers/classifier-prompt';
import {
  COMPLAINT_RECALL_TARGET,
  FALSE_LEAD_RATE_LIMIT,
  PRIMARY_ACCURACY_TARGET,
  parseEvalExamples,
  parseEvalTranscript,
  scoreEvalResults,
  type EvalResult,
} from '../apps/api/src/modules/core/conversations/helpers/classification-eval';
import { listStartingConversationTypes } from '../apps/api/src/modules/core/conversations/helpers/default-conversation-types';

// The first choices for the job, the same order the app's settings use: a small, quick model of each company
const MODEL_FOR_EACH_COMPANY = {
  gemini: 'gemini-flash-lite-latest',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-5-5',
} as const;

const industryArgument = process.argv.indexOf('--industry');
const industryId = industryArgument >= 0 ? (process.argv[industryArgument + 1] ?? 'hotel_resort') : 'hotel_resort';

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

const types = listStartingConversationTypes(industryId);
const examplesFile = path.resolve(import.meta.dirname, '../evals/classification', `${industryId}.jsonl`);
if (!fs.existsSync(examplesFile)) {
  console.error(`There is no example file for "${industryId}" (looked for evals/classification/${industryId}.jsonl).`);
  process.exit(1);
}
const examples = parseEvalExamples(fs.readFileSync(examplesFile, 'utf8'));
const schema = buildClassificationSchema(types.map((type) => type.key));
const stableSystemText = buildStableInstructions(
  types.map((type) => ({ key: type.key, label: type.label, description: type.description, examples: type.examples })),
);
const leadTypeKeys = new Set(types.filter((type) => type.outcome === 'lead').map((type) => type.key));

console.log(`Sorting ${examples.length} ${industryId} examples with prompt ${CLASSIFIER_PROMPT_VERSION}`);
console.log(
  `Trying: ${candidates.map((candidate) => `${candidate.provider}/${candidate.modelName}`).join(', then ')}\n`,
);

const results: EvalResult[] = [];
let failedCalls = 0;
for (const example of examples) {
  try {
    const answer = await provider.generateObject(
      {
        tag: {
          task: 'classify_conversation',
          agentId: 'classifier-eval',
          channel: 'internal',
          promptVersion: CLASSIFIER_PROMPT_VERSION,
        },
        candidates,
        prompt: {
          stableSystemText,
          messages: [{ role: 'user', text: buildConversationMessage(parseEvalTranscript(example.text)) }],
        },
        temperature: 0,
        maxOutputTokens: 600,
      },
      schema,
    );
    results.push({
      example,
      predicted: {
        primary: { typeKey: answer.value.primary.type, confidence: answer.value.primary.confidence },
        secondary: answer.value.secondary.map((other) => ({ typeKey: other.type, confidence: other.confidence })),
        needsPerson: answer.value.needsPerson,
      },
    });
  } catch (error) {
    // A call that failed counts as a wrong answer (the type "unclear" with no confidence), and is reported
    failedCalls += 1;
    console.log(`  ${example.id}: the AI did not answer (${readLlmError(error)})`);
    results.push({
      example,
      predicted: { primary: { typeKey: 'unclear', confidence: 0 }, secondary: [], needsPerson: true },
    });
  }
}

const report = scoreEvalResults(results, leadTypeKeys);
const percent = (value: number | null) => (value === null ? 'nothing to measure' : `${(value * 100).toFixed(1)}%`);
const verdict = (passed: boolean) => (passed ? 'PASS' : 'FAIL');
console.log(
  `\nMain type right:        ${percent(report.primaryAccuracy)}  (target at least ${PRIMARY_ACCURACY_TARGET * 100}%)  ${verdict(report.passes.primaryAccuracy)}`,
);
console.log(
  `Complaints kept:        ${percent(report.complaintRecall)}  (target at least ${COMPLAINT_RECALL_TARGET * 100}%)  ${verdict(report.passes.complaintRecall)}`,
);
console.log(
  `Non-sales made leads:   ${percent(report.falseLeadRate)}  (at most ${FALSE_LEAD_RATE_LIMIT * 100}%)  ${verdict(report.passes.falseLeadRate)}`,
);
if (report.misses.length > 0) {
  console.log(`\nMain type wrong (${report.misses.length}):`);
  for (const miss of report.misses) console.log(`  ${miss.id}: expected ${miss.expected}, got ${miss.got}`);
}
if (failedCalls > 0)
  console.log(`\n${failedCalls} call(s) failed: those count as wrong. Check the keys with npm run ai:check.`);

const allPassed = Object.values(report.passes).every(Boolean) && failedCalls === 0;
process.exit(allPassed ? 0 : 1);
