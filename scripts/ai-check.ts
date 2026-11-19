// npm run ai:check
// A hands-on check of the platform's own AI keys (the ones in .env): for each key it asks the AI company for its list of models and
// makes one tiny real call ("reply with the single word OK"). It prints what it found and how long it took. It NEVER prints a key,
// and it does not touch the database. Each call costs a few tokens. Run it after changing keys or models in .env.
import { loadConfig, loadEnvFile } from '../apps/api/src/kernel/config';
import { createLangChainProvider, LLM_PROVIDER_IDS, readLlmError } from '../apps/api/src/providers/llm';

// One quick model per company to try, most likely to exist first. The app picks real models from its own list (the admin model
// list); this script only proves the key and the company respond.
const MODELS_TO_TRY: Record<(typeof LLM_PROVIDER_IDS)[number], string[]> = {
  gemini: ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite'],
  openai: ['gpt-4o-mini'],
  anthropic: ['claude-haiku-5-5'],
};

loadEnvFile();
const config = loadConfig();
const provider = createLangChainProvider();
let problems = 0;

for (const companyId of LLM_PROVIDER_IDS) {
  const keys = config.ai.platformKeys[companyId];
  console.log(`\n${companyId}: ${keys.length} key${keys.length === 1 ? '' : 's'} in .env`);
  for (const [index, apiKey] of keys.entries()) {
    const label = `  key ${index + 1}`;
    try {
      const listed = await provider.listModels(companyId, apiKey);
      console.log(`${label}: sees ${listed.length} models`);
    } catch (error) {
      problems += 1;
      console.log(`${label}: could not list models (${readLlmError(error)})`);
    }
    try {
      const answer = await provider.generateText({
        tag: { task: 'key_test', agentId: 'ai-check', channel: 'internal', promptVersion: 'ai-check-1' },
        candidates: MODELS_TO_TRY[companyId].map((modelName) => ({
          provider: companyId,
          modelName,
          apiKey,
          keySource: 'platform' as const,
          keyPosition: index + 1,
        })),
        prompt: {
          stableSystemText: 'You are a connection test. Reply with the single word OK.',
          messages: [{ role: 'user', text: 'ping' }],
        },
        maxOutputTokens: 200,
      });
      const { servedBy, latencyMs, usage, attempts } = answer.details;
      console.log(
        `${label}: answered by ${servedBy.modelName} in ${latencyMs} ms (${usage.inputTokens} in, ${usage.outputTokens} out, ${attempts.length} try)`,
      );
    } catch (error) {
      problems += 1;
      const kinds = (error as { attempts?: Array<{ outcome: string }> }).attempts
        ?.map((attempt) => attempt.outcome)
        .join(', ');
      console.log(`${label}: no answer (${kinds ?? readLlmError(error)})`);
    }
  }
}
console.log(problems === 0 ? '\nAll keys answered.' : `\n${problems} problem${problems === 1 ? '' : 's'} found.`);
process.exit(problems === 0 ? 0 : 1);
