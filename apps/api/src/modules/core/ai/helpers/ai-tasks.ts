// The kinds of job the AI does. The app asks for a job (never a model name), and the settings decide which model does it.
// A feature that needs a new kind of job adds a line here; the model list in the database says which models suit it.

export interface AiTaskDefinition {
  id: string;
  label: string;
  description: string;
}

export const AI_TASKS: readonly AiTaskDefinition[] = [
  {
    id: 'classify_conversation',
    label: 'Sorting conversations',
    description:
      'Reads a conversation and says what it was about: an enquiry, a complaint, a supplier, spam and so on.',
  },
  {
    id: 'analyse_email',
    label: 'Reading emails',
    description: 'Reads an email a customer sent and decides what it is about and what it needs.',
  },
  {
    id: 'draft_email',
    label: 'Drafting email replies',
    description: 'Writes the reply to a customer email.',
  },
  {
    id: 'chat_reply',
    label: 'Replying to customers',
    description: 'Writes the replies the AI agent sends in chat, WhatsApp and email.',
  },
  {
    id: 'summarise',
    label: 'Summaries',
    description: 'Writes a short summary of a conversation for the inbox and the timeline.',
  },
  {
    id: 'setup_chat',
    label: 'Setup chat',
    description: 'Talks a new business through setting up its profile.',
  },
  {
    id: 'extract_from_website',
    label: 'Reading a website',
    description: "Reads a business's website and fills in its profile.",
  },
];

/** The ids of all jobs, for checking input. */
export const AI_TASK_IDS: readonly string[] = AI_TASKS.map((task) => task.id);
