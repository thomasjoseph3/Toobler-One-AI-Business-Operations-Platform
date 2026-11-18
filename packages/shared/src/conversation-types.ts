import { z } from 'zod';

// The shape of conversation types between the API and the web app (docs/CONVERSATION-TYPES.md). A type is one reason a
// person gets in touch; each type decides what happens next.

/** What happens to a conversation of this type: a lead, a ticket, only a log line, the Filtered tab, nothing shown, or a person must look. */
export const conversationOutcomeSchema = z.enum(['lead', 'ticket', 'log', 'filter', 'ignore', 'review']);
export type ConversationOutcome = z.infer<typeof conversationOutcomeSchema>;

/** How the AI agent carries on once the type is known. */
export const conversationPlaybookSchema = z.enum(['sales', 'service', 'brief_end', 'emergency']);
export type ConversationPlaybook = z.infer<typeof conversationPlaybookSchema>;

/** The kind and the priority of a ticket the router raises (the same words as the tickets feature). */
export const conversationTicketTypeSchema = z.enum(['callback', 'question', 'complaint', 'existing_customer', 'other']);
export const conversationTicketPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

/** Who should be told about a conversation of this type, and when. Sending the alert is a later feature (F23). */
export const conversationAlertSchema = z.object({
  who: z.enum(['owner', 'manager', 'alert_number', 'service_team', 'front_desk', 'doctor_on_call']),
  when: z.enum(['now', 'office_hours']),
});
export type ConversationAlert = z.infer<typeof conversationAlertSchema>;

/** One type as the API shows it. */
export const conversationTypeSchema = z.object({
  id: z.string(),
  /** The stable name the classifier and the router use ("complaint"). */
  key: z.string(),
  /** The business's own word for it. */
  label: z.string(),
  description: z.string(),
  examples: z.array(z.string()),
  /** A type every business has: it can be renamed and re-routed, never removed. */
  isSystem: z.boolean(),
  outcome: conversationOutcomeSchema,
  /** Only when the outcome is a ticket. */
  ticketType: conversationTicketTypeSchema.nullable(),
  priority: conversationTicketPrioritySchema.nullable(),
  needsPerson: z.boolean(),
  alert: conversationAlertSchema.nullable(),
  playbook: conversationPlaybookSchema,
  isActive: z.boolean(),
  sort: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ConversationType = z.infer<typeof conversationTypeSchema>;

export const conversationTypesListResponseSchema = z.object({ items: z.array(conversationTypeSchema) });
export type ConversationTypesListResponse = z.infer<typeof conversationTypesListResponseSchema>;

/** Up to 25 types can be active in one business, so the classifier's instructions stay small and accurate. */
export const MAX_ACTIVE_CONVERSATION_TYPES = 25;

/** An empty or blank text means "nothing was given". */
const trimmedText = (maxLength: number) => z.string().trim().min(1).max(maxLength);

/** Adding a custom type (a manager). The key is made from the label by the server. A ticket outcome needs the ticket's kind and priority. */
export const createConversationTypeRequestSchema = z
  .object({
    label: trimmedText(80),
    description: trimmedText(500),
    examples: z.array(trimmedText(300)).max(5).optional(),
    outcome: conversationOutcomeSchema,
    ticketType: conversationTicketTypeSchema.optional(),
    priority: conversationTicketPrioritySchema.optional(),
    needsPerson: z.boolean().optional(),
    alert: conversationAlertSchema.optional(),
    playbook: conversationPlaybookSchema.optional(),
  })
  .strict()
  .refine(
    (request) =>
      request.outcome === 'ticket'
        ? request.ticketType !== undefined && request.priority !== undefined
        : request.ticketType === undefined && request.priority === undefined,
    { message: 'A ticket outcome needs a ticket type and a priority, and no other outcome takes them.' },
  );
export type CreateConversationTypeRequest = z.infer<typeof createConversationTypeRequestSchema>;

/** The address part naming a conversation type. */
export const conversationTypeIdParamsSchema = z.object({ id: z.uuid() });

/**
 * Changing a type (a manager). Only the fields sent change; the key and the system flag can never be sent. Sending `alert: null`
 * clears the alert. Moving to a ticket outcome needs a ticket kind and priority (sent now, or already on the type); moving to any
 * other outcome clears them, and sending them with another outcome is refused. The service checks the final result.
 */
export const updateConversationTypeRequestSchema = z
  .object({
    label: trimmedText(80),
    description: trimmedText(500),
    examples: z.array(trimmedText(300)).max(5),
    outcome: conversationOutcomeSchema,
    ticketType: conversationTicketTypeSchema,
    priority: conversationTicketPrioritySchema,
    needsPerson: z.boolean(),
    alert: conversationAlertSchema.nullable(),
    playbook: conversationPlaybookSchema,
    isActive: z.boolean(),
  })
  .partial()
  .strict()
  .refine((request) => Object.values(request).some((value) => value !== undefined), {
    message: 'Send at least one thing to change.',
  })
  .refine(
    (request) =>
      request.outcome === undefined ||
      request.outcome === 'ticket' ||
      (request.ticketType === undefined && request.priority === undefined),
    { message: 'Only a ticket outcome takes a ticket type and a priority.' },
  );
export type UpdateConversationTypeRequest = z.infer<typeof updateConversationTypeRequestSchema>;

/** The most types a reorder request may list (a guard against runaway requests; a business has far fewer). */
export const MAX_CONVERSATION_TYPES_IN_ORDER = 200;

/** Putting the types in a new order (a manager): every type of the business exactly once, in the order wanted. */
export const reorderConversationTypesRequestSchema = z
  .object({ typeIds: z.array(z.uuid()).min(1).max(MAX_CONVERSATION_TYPES_IN_ORDER) })
  .strict();
export type ReorderConversationTypesRequest = z.infer<typeof reorderConversationTypesRequestSchema>;

/** The ways a person can get in touch (what the "Try it" box can pretend the pasted text came from). */
export const conversationChannelSchema = z.enum(['webchat', 'whatsapp', 'email', 'phone']);
export type ConversationChannel = z.infer<typeof conversationChannelSchema>;

/** The longest text "Try it" reads, in characters: more than this is cut by the classifier anyway, and it keeps the AI cost small. */
export const MAX_TRY_IT_TEXT_LENGTH = 4000;

/**
 * "Try it" (a manager): paste a message or a whole conversation and see which type it gets and what would happen, without saving
 * anything. It makes one real AI call, so it counts towards the business's AI use.
 */
export const tryConversationTypeRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(MAX_TRY_IT_TEXT_LENGTH),
    channel: conversationChannelSchema.optional(),
  })
  .strict();
export type TryConversationTypeRequest = z.infer<typeof tryConversationTypeRequestSchema>;

/** A type the AI named, with the business's own word for it and how sure the AI was (0 to 1). */
export const namedTypeSchema = z.object({ typeKey: z.string(), label: z.string(), confidence: z.number() });
export type NamedType = z.infer<typeof namedTypeSchema>;

/** One thing the router would do for the conversation. */
export const trialOutcomeSchema = z.object({
  typeKey: z.string(),
  typeLabel: z.string(),
  kind: conversationOutcomeSchema,
  /** Applied, but the AI was only fairly sure. */
  aiUnsure: z.boolean(),
  /** For a ticket: its kind and priority. */
  ticketType: conversationTicketTypeSchema.nullable(),
  priority: conversationTicketPrioritySchema.nullable(),
  needsPerson: z.boolean(),
  alert: conversationAlertSchema.nullable(),
  /** Whether a contact would be kept for this conversation. */
  keepContact: z.boolean(),
  /** A lead was wanted but the lead engine is off, so it is only logged and a callback task is made. */
  createCallbackTask: z.boolean(),
});
export type TrialOutcome = z.infer<typeof trialOutcomeSchema>;

/** What "Try it" answers: what the AI said, what the router would do about it, and which AI answered. Nothing is saved. */
export const tryConversationTypeResponseSchema = z.object({
  classification: z.object({
    primary: namedTypeSchema,
    secondary: z.array(namedTypeSchema),
    needsPerson: z.boolean(),
    /** The AI's one-line reason. */
    reason: z.string(),
  }),
  decision: z.object({
    /** The type the conversation would be shown under ("unclear" when the AI was not sure). */
    primaryTypeKey: z.string(),
    primaryLabel: z.string(),
    needsPerson: z.boolean(),
    aiUnsure: z.boolean(),
    outcomes: z.array(trialOutcomeSchema),
  }),
  servedBy: z.object({ provider: z.string(), modelName: z.string() }),
});
export type TryConversationTypeResponse = z.infer<typeof tryConversationTypeResponseSchema>;

/** The address part naming a conversation. */
export const conversationIdParamsSchema = z.object({ id: z.uuid() });

/** One message of a conversation. */
export const conversationMessageSchema = z.object({
  id: z.string(),
  sender: z.enum(['customer', 'agent', 'staff', 'system']),
  /** The person who wrote a staff message (their name is null when they no longer work there); null for every other sender. */
  byUser: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
  body: z.string(),
  createdAt: z.string(),
});
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

/** What a conversation led to, once per type. */
export const conversationOutcomeViewSchema = z.object({
  typeKey: z.string(),
  typeLabel: z.string(),
  kind: conversationOutcomeSchema,
  confidence: z.number(),
  aiUnsure: z.boolean(),
  /** The lead or ticket this outcome made or joined, once carried out. */
  leadId: z.string().nullable(),
  ticketId: z.string().nullable(),
  /** False while it waits (for example, nobody could be identified). */
  carriedOut: z.boolean(),
  /** False for an outcome that no longer applies after a correction (what it made is kept). */
  isCurrent: z.boolean(),
});

/** One conversation with its messages and what it led to, for staff. */
export const conversationDetailSchema = z.object({
  id: z.string(),
  channel: conversationChannelSchema,
  /** The other person's phone with the plus (as the channel saw it), and/or their email. */
  fromPhone: z.string().nullable(),
  fromEmail: z.string().nullable(),
  contact: z
    .object({ id: z.string(), name: z.string().nullable(), phone: z.string().nullable(), email: z.string().nullable() })
    .nullable(),
  status: z.enum(['open', 'sorted']),
  /** Null until the conversation is sorted. */
  type: z
    .object({
      key: z.string(),
      label: z.string(),
      confidence: z.number(),
      /** A rule in code, the AI, or a person. */
      source: z.enum(['rule', 'ai_final', 'staff']),
      /** The AI's one-line reason, or the rule's name. */
      reason: z.string().nullable(),
      aiUnsure: z.boolean(),
    })
    .nullable(),
  needsPerson: z.boolean(),
  /** The person who has taken the conversation over from the AI, while the hold lasts (an expired hold is shown as no hold). */
  heldBy: z.object({ userId: z.string(), name: z.string().nullable() }).nullable(),
  heldUntil: z.string().nullable(),
  /** When staff marked it done, or null. */
  doneAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  sortedAt: z.string().nullable(),
  createdAt: z.string(),
  messages: z.array(conversationMessageSchema),
  outcomes: z.array(conversationOutcomeViewSchema),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

/** A person changing a conversation's type to one of the business's switched-on types. Choosing the type it already has confirms it. */
export const setConversationTypeRequestSchema = z.object({ typeKey: z.string().trim().min(1).max(60) }).strict();
export type SetConversationTypeRequest = z.infer<typeof setConversationTypeRequestSchema>;

/**
 * The Filtered list (spam, wrong numbers, silent calls): `filtered=true` is required, because the Filtered list is the only list of conversations so far.
 * Newest first, paged like the other lists.
 */
export const listFilteredConversationsQuerySchema = z.object({
  filtered: z.literal('true'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListFilteredConversationsQuery = z.infer<typeof listFilteredConversationsQuerySchema>;

/** One filtered conversation in the Filtered tab: who, how it came, why it was filtered and the customer's first words. */
export const filteredConversationSchema = z.object({
  id: z.string(),
  channel: conversationChannelSchema,
  fromPhone: z.string().nullable(),
  fromEmail: z.string().nullable(),
  /** The type it was filtered as, in the business's own word ("Spam", "Wrong number", "No conversation"). */
  type: z.object({ key: z.string(), label: z.string() }),
  /** Why the AI or the rules chose that type, when known. */
  reason: z.string().nullable(),
  /** The start of the customer's first message (up to 160 characters), or null when they wrote nothing. */
  firstWords: z.string().nullable(),
  createdAt: z.string(),
});
export type FilteredConversation = z.infer<typeof filteredConversationSchema>;

export const filteredConversationsResponseSchema = z.object({
  items: z.array(filteredConversationSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type FilteredConversationsResponse = z.infer<typeof filteredConversationsResponseSchema>;

// ---- The inbox, staff takeover and the reply (F21) ----

/**
 * The inbox: every real conversation, needs-a-person first, then the newest activity first. All filters are optional. (`filtered=true` is the Filtered tab and
 * is a different list.)
 */
export const listInboxQuerySchema = z
  .object({
    channel: conversationChannelSchema.optional(),
    status: z.enum(['open', 'done']).optional(),
    /** `me`: the conversations I hold; `any`: the ones anyone holds. */
    held: z.enum(['me', 'any']).optional(),
    needs_person: z.literal('true').optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export type ListInboxQuery = z.infer<typeof listInboxQuerySchema>;

/** One row of the inbox. */
export const inboxItemSchema = z.object({
  id: z.string(),
  channel: conversationChannelSchema,
  contact: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
  fromPhone: z.string().nullable(),
  fromEmail: z.string().nullable(),
  /** The AI's summary once there is one, otherwise the start of the customer's first message (up to 160 characters), or null. */
  preview: z.string().nullable(),
  /** The type in the business's own word, once sorted. */
  type: z.object({ key: z.string(), label: z.string() }).nullable(),
  aiUnsure: z.boolean(),
  needsPerson: z.boolean(),
  heldBy: z.object({ userId: z.string(), name: z.string().nullable() }).nullable(),
  doneAt: z.string().nullable(),
  ended: z.boolean(),
  /** When the newest message was written (or the conversation started, when it has none). */
  lastActivityAt: z.string(),
  createdAt: z.string(),
});
export type InboxItem = z.infer<typeof inboxItemSchema>;

export const inboxResponseSchema = z.object({
  items: z.array(inboxItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type InboxResponse = z.infer<typeof inboxResponseSchema>;

/** A staff reply on the customer's channel. */
export const replyToConversationRequestSchema = z.object({ body: z.string().trim().min(1).max(2000) }).strict();
export type ReplyToConversationRequest = z.infer<typeof replyToConversationRequestSchema>;
