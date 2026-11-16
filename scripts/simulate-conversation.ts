// npm run conversation:simulate -- --email manager@example.com --text "Hi, do you have a room on 20 December?" [--channel webchat] [--allow-remote]
// npm run conversation:simulate -- --email manager@example.com --text "First line" --text "Second line" --channel whatsapp
//
// Makes ONE pretend conversation in a business (the one the email's person works in), puts your text in as the customer's messages, and
// sorts it exactly as the app will when a real conversation ends: the rules first, then the AI, then the router. It prints what was decided.
// It is for trying the sorting before any channel (website chat, WhatsApp, email, phone) exists.
//
// It WRITES to the database that DATABASE_URL points to (a conversation, its messages, its outcomes and one AI call), and it makes a real AI
// call with that business's own AI settings (so it counts towards that business's AI use). A database that is not on this computer needs
// --allow-remote, which you add on purpose. It never prints your text, an AI key or a phone number.
import { loadConfig, loadEnvFile } from '../apps/api/src/kernel/config';
import { createDatabase } from '../apps/api/src/kernel/database';
import { ApiError } from '../apps/api/src/kernel/errors';
import { createAiService } from '../apps/api/src/modules/core/ai';
import {
  createConversationClassifier,
  createConversationFinaliser,
  createConversationRecordsService,
} from '../apps/api/src/modules/core/conversations';
import { createLangChainProvider } from '../apps/api/src/providers/llm';

/** Every value given after a flag, in order ("--text a --text b" gives ["a", "b"]). */
function valuesOf(flag: string): string[] {
  const values: string[] = [];
  for (const [position, argument] of process.argv.entries()) {
    if (argument === flag && process.argv[position + 1] !== undefined) values.push(process.argv[position + 1]!);
  }
  return values;
}

loadEnvFile();
process.env.LOG_LEVEL = 'warn'; // the app logs every request; a script only needs to hear about problems
const config = loadConfig();
const databaseAddress = new URL(config.db.url);
const isLocalDatabase = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(databaseAddress.hostname);

const email = valuesOf('--email')[0]?.trim().toLowerCase();
const texts = valuesOf('--text').filter((text) => text.trim() !== '');
const channelArgument = valuesOf('--channel')[0] ?? 'webchat';
const channels = ['webchat', 'whatsapp', 'email', 'phone'] as const;
const channel = channels.find((candidate) => candidate === channelArgument);

console.log(`Database: ${databaseAddress.hostname}${databaseAddress.pathname}`);
if (!email || texts.length === 0 || !channel) {
  console.log(
    'Usage: npm run conversation:simulate -- --email <a person of the business> --text "what the customer says" [--text "more"] [--channel webchat|whatsapp|email|phone]',
  );
  process.exit(1);
}
if (!isLocalDatabase && !process.argv.includes('--allow-remote')) {
  console.log('This database is not on this computer, so nothing was done.');
  console.log('If you are sure it is your development database, run again with --allow-remote added.');
  process.exit(1);
}

const database = createDatabase(config.db);
try {
  await database.ping();
  // Which business: the one this person works in (read on the owner connection, the way the other scripts do)
  const person = await database.pool.query<{ account_id: string; business_name: string }>(
    `select u.account_id, a.name as business_name from app.users u join app.accounts a on a.id = u.account_id where u.email = $1`,
    [email],
  );
  const business = person.rows[0];
  if (!business) {
    console.log(`No person with that email was found.`);
    process.exit(1);
  }
  console.log(`Business: ${business.business_name}`);

  const records = createConversationRecordsService({ database });
  const finaliser = createConversationFinaliser({
    database,
    classifier: createConversationClassifier({
      aiService: createAiService({ database, config, llm: createLangChainProvider() }),
    }),
  });

  const conversationId = await records.startConversation(business.account_id, { channel });
  for (const text of texts)
    await records.addMessage(business.account_id, conversationId, { sender: 'customer', body: text });

  const result = await finaliser.finaliseConversation(business.account_id, conversationId);
  console.log(`\nConversation ${conversationId}`);
  console.log(
    `  Type:         ${result.typeKey}  (decided by: ${result.typeSource === 'rule' ? 'a rule in code' : 'the AI'})`,
  );
  console.log(`  AI unsure:    ${result.aiUnsure ? 'yes' : 'no'}`);
  console.log(`  Needs a person: ${result.needsPerson ? 'yes' : 'no'}`);
  console.log('  What it leads to:');
  for (const outcome of result.outcomes)
    console.log(`    - ${outcome.kind}  (from the type ${outcome.typeKey}${outcome.aiUnsure ? ', AI unsure' : ''})`);
  console.log('\nThe lead or ticket itself is not created yet: that arrives with the next step of this feature.');
} catch (error) {
  if (error instanceof ApiError) {
    console.log(`\nIt did not work: ${error.code} (${error.status}): ${error.message}`);
  } else {
    console.log(`\nIt did not work: ${error instanceof Error ? error.message : 'an unknown problem'}`);
  }
  process.exitCode = 1;
} finally {
  await database.close();
}
