import { z } from 'zod';

// The shape of "Test the agent" between the API and the web app: a staff member chats as a pretend customer and sees what the AI agent
// would say, where each answer came from, and what it would save and promise. A test chat is saved but never becomes a lead or a ticket.

/** The most characters of one test message. */
export const AGENT_TEST_MESSAGE_MAX = 2000;

export const agentTestChatRequestSchema = z
  .object({
    /** Leave out to start a new test chat; give it to carry on one. Only a test chat of this business is accepted. */
    conversationId: z.uuid().optional(),
    message: z.string().trim().min(1).max(AGENT_TEST_MESSAGE_MAX),
  })
  .strict();
export type AgentTestChatRequest = z.infer<typeof agentTestChatRequestSchema>;

/** Where an answer came from. */
export const agentAnswerSourceSchema = z.object({
  kind: z.enum(['faq', 'offerings', 'business_info']),
  /** In words: the FAQ's question, "Offerings and offers", or "Business profile". */
  label: z.string(),
});
export type AgentAnswerSource = z.infer<typeof agentAnswerSourceSchema>;

/** The one promise a conversation ends with. */
export const agentPromiseSchema = z.object({
  kind: z.enum(['call_back_open', 'call_back_closed', 'send_confirmation', 'passed_to_manager']),
  /** The words the customer was told. */
  sentence: z.string(),
  /** When a callback falls due, or null when the promise has no time of its own. */
  dueAt: z.string().nullable(),
});
export type AgentPromise = z.infer<typeof agentPromiseSchema>;

export const agentTestChatResponseSchema = z.object({
  conversationId: z.uuid(),
  /** What the agent says to the customer. */
  reply: z.string(),
  answeredFrom: z.array(agentAnswerSourceSchema),
  /** Every tool the agent used this turn, and whether it worked. */
  toolsCalled: z.array(z.object({ name: z.string(), ok: z.boolean(), input: z.unknown() })),
  /** What the customer has told the agent so far, by label (only what they said). */
  detailsSaved: z.record(z.string(), z.string()),
  /** What the conversation is, for choosing the promise. */
  situation: z.enum(['sale_enquiry', 'ready_to_book', 'not_a_sale']),
  /** The one promise made, or null while none has been. */
  promise: agentPromiseSchema.nullable(),
  /** Amounts the agent tried to say that nobody confirmed, held back (usually empty). */
  heldBackAmounts: z.array(z.number()),
});
export type AgentTestChatResponse = z.infer<typeof agentTestChatResponseSchema>;

/** The address of one test chat. */
export const agentTestChatParamsSchema = z.object({ conversationId: z.uuid() });

/** A saved test chat read back: what was said, what the agent learned, the promise, and the summary once there is one. */
export const agentTestChatDetailSchema = z.object({
  conversationId: z.uuid(),
  messages: z.array(
    z.object({
      sender: z.enum(['customer', 'agent']),
      body: z.string(),
      createdAt: z.string(),
    }),
  ),
  detailsSaved: z.record(z.string(), z.string()),
  situation: z.enum(['sale_enquiry', 'ready_to_book', 'not_a_sale']),
  promise: agentPromiseSchema.nullable(),
  /** The summary the inbox would show, or null until the chat has been summarised. */
  summary: z.string().nullable(),
  summarisedAt: z.string().nullable(),
});
export type AgentTestChatDetail = z.infer<typeof agentTestChatDetailSchema>;

/** The summary of a test chat, just written. */
export const agentTestChatSummarySchema = z.object({
  conversationId: z.uuid(),
  summary: z.string(),
  summarisedAt: z.string(),
  /** False when code wrote it from what was saved (nothing said, or the AI's own held an amount nobody gave). */
  writtenByAi: z.boolean(),
});
export type AgentTestChatSummary = z.infer<typeof agentTestChatSummarySchema>;
