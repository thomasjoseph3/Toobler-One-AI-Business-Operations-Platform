import type { CountryCode } from 'libphonenumber-js';
import type { WidgetChat, WidgetConfig, WidgetMessageResponse } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, notFound, tooMany } from '../../../../kernel/errors';
import type { ModuleGate } from '../../../../kernel/module-system/registry';
import type { createAgentSavedTurnService } from '../../../core/agents';
import { findBusinessLiveAt } from '../../../core/auth';
import { createConversationRecordsService } from '../../../core/conversations';
import { describeWidgetConfig } from '../helpers/describe-widget-config';
import { readVisitorContact } from '../helpers/read-visitor-contact';
import { isWebsiteAllowed } from '../helpers/website-origin';
import { signVisitorToken, verifyVisitorToken } from '../helpers/visitor-token';
import type { WindowLimiter } from '../helpers/window-limiter';
import { handOverChat } from './chat-hand-over.service';
import * as webchatSettingsRepository from '../repositories/webchat-settings.repository';
import type { SettingsFoundByKey } from '../repositories/webchat-settings.repository';

type SavedTurnService = ReturnType<typeof createAgentSavedTurnService>;

/** What this module stamps on the chats and messages it writes (no signed-in person is involved). */
const MODULE_ACTOR: Actor = { kind: 'system', id: 'channel.webchat' };

/** A chat with more messages than this (both sides together) is refused, so a chat cannot grow, and cost, without end. */
export const MOST_MESSAGES_IN_A_WEB_CHAT = 100;

/** What the agent is told about where it is talking (it never names the channel itself). */
const WEBCHAT_CHANNEL_NOTE =
  "The customer is typing in a small chat bubble on the business's own website. Keep replies short (two or three sentences) and friendly.";

/** The business, its settings and the website that is calling: everything a public call needs once the key and the website are checked. */
export interface OpenedWidget {
  accountId: string;
  defaultCountry: string;
  settings: SettingsFoundByKey['settings'];
  /** The website's address as the browser sent it, already checked against the business's allowed websites. Null for a call from the chat window itself (see openWidget). */
  origin: string | null;
}

/** The limits that are kept in memory: messages per widget key, and new chats per address. Left out in tests that switch limits off. */
export interface WidgetLimiters {
  messagesPerKey: WindowLimiter;
  newChatsPerAddress: WindowLimiter;
}

/**
 * What a visitor's browser does on a business's website, with no sign-in: read how the bubble should look, and chat with the agent. The
 * business comes only from the widget key; the website must be one the business listed; a chat is carried on only with the visitor token
 * the server gave out for it.
 */
export function createWidgetChatService(input: {
  database: Database;
  gate: ModuleGate;
  publicBaseUrl: string;
  appSecret: string;
  savedTurns: SavedTurnService;
  /** Queues a background job (the sorting and the summary when a chat ends). */
  enqueueJob: (jobName: string, data: { accountId: string; conversationId: string }) => Promise<void>;
  limiters?: WidgetLimiters | undefined;
  now?: () => Date;
}) {
  const { database, gate, savedTurns } = input;
  const now = input.now ?? (() => new Date());
  const conversationRecords = createConversationRecordsService({ database });

  /** Finds the chat a visitor token names, or throws 401 when the token is not ours, has run out, or names no web chat of this business. */
  async function findChatOfVisitor(widget: OpenedWidget, visitorToken: string | undefined) {
    if (visitorToken === undefined) throw invalidVisitorToken();
    const claims = await verifyVisitorToken({ appSecret: input.appSecret, token: visitorToken, now: now() });
    if (!claims || claims.accountId !== widget.accountId) throw invalidVisitorToken();
    const chat = await conversationRecords.findChat(widget.accountId, claims.conversationId, 'webchat');
    if (!chat) throw invalidVisitorToken();
    return chat;
  }

  return {
    /**
     * Finds the business from the widget key and checks who is calling. 404 for an unknown key and for a business that switched the chat off
     * (the same answer, so nothing is said about which). The call must come from a website on the business's list (403 otherwise; an empty
     * list allows none). One more caller is accepted: the chat window itself, which the API serves and which a browser only shows inside the
     * business's own websites. Its calls are on the API's own address, so the browser marks them `same-origin` (a mark a web page cannot fake),
     * and they count only while the business has listed at least one website.
     */
    async openWidget(
      widgetKey: string,
      requestOrigin: string | undefined,
      callerIsOurOwnPage = false,
    ): Promise<OpenedWidget> {
      const found = await webchatSettingsRepository.findSettingsByWidgetKey(database.system, widgetKey);
      if (!found || !(await gate.isActive(found.accountId, 'channel.webchat'))) throw notFound('That chat');
      const { allowedWebsites } = found.settings;
      const fromAllowedWebsite = requestOrigin !== undefined && isWebsiteAllowed(requestOrigin, allowedWebsites);
      if (fromAllowedWebsite) {
        return {
          accountId: found.accountId,
          defaultCountry: found.defaultCountry,
          settings: found.settings,
          origin: requestOrigin,
        };
      }
      if (callerIsOurOwnPage && allowedWebsites.length > 0) {
        return {
          accountId: found.accountId,
          defaultCountry: found.defaultCountry,
          settings: found.settings,
          origin: null,
        };
      }
      throw new ApiError(403, 'WEBSITE_NOT_ALLOWED', 'This website may not use this chat.');
    },

    /** How the bubble should look and which buttons it shows. Also notes that the bubble was seen working on this website. */
    async readConfig(widget: OpenedWidget): Promise<WidgetConfig> {
      // "Last seen" is about the business's own websites: the chat window's own calls do not count
      const { origin } = widget;
      if (origin !== null) {
        await database.runInAccountTransaction(widget.accountId, (transaction) =>
          webchatSettingsRepository.recordLastSeen(transaction, {
            accountId: widget.accountId,
            website: origin,
            seenAt: now(),
          }),
        );
      }
      return describeWidgetConfig(widget.settings, input.publicBaseUrl);
    },

    /** The chat so far, for a visitor coming back after a page reload. 401 without a good token. Does not change anything. */
    async readChat(options: { widget: OpenedWidget; visitorToken: string | undefined }): Promise<WidgetChat> {
      const chat = await findChatOfVisitor(options.widget, options.visitorToken);
      const messages = await conversationRecords.readChatMessages(options.widget.accountId, chat.id);
      return {
        messages: messages.map((message) => ({
          sender: message.sender,
          body: message.body,
          createdAt: message.createdAt.toISOString(),
        })),
        ended: chat.ended,
        heldByPerson: !chat.ended && (await conversationRecords.isHeldByPerson(options.widget.accountId, chat.id)),
      };
    },

    /**
     * The visitor closes the bubble: the chat ends and is handed on for sorting and summary. 401 without a good token. Closing a chat that
     * has already ended changes nothing and queues nothing, so closing twice (or a repeated request) costs nothing.
     */
    async endChat(options: { widget: OpenedWidget; visitorToken: string | undefined }): Promise<void> {
      const chat = await findChatOfVisitor(options.widget, options.visitorToken);
      if (chat.ended) return;
      await handOverChat({ database, enqueueJob: input.enqueueJob }, options.widget.accountId, chat.id);
    },

    /**
     * A visitor's message. Without a token it starts a new chat; with one it carries on the chat the token names (401 when the token is
     * not ours, has run out, belongs to another business, or names a chat that is not this business's web chat). When the chat has ended,
     * the message starts a new one. Answers the agent's reply and the token to send with the next message.
     */
    async sendMessage(options: {
      widget: OpenedWidget;
      visitorToken: string | undefined;
      message: string;
      address: string;
    }): Promise<WidgetMessageResponse> {
      const { widget } = options;
      const { accountId } = widget;

      // A business that has not gone live yet does not answer visitors (the setup wizard's "Go live"): it says so plainly
      const liveAt = await database.runInAccountTransaction(accountId, (transaction) =>
        findBusinessLiveAt(transaction, accountId),
      );
      if (liveAt === null) {
        throw new ApiError(503, 'NOT_OPEN_YET', "We're not open for chat yet. Please check back soon.");
      }

      if (input.limiters && !input.limiters.messagesPerKey.tryTake(widget.settings.widgetKey, now())) {
        throw tooMany('This chat is very busy right now. Please try again in a minute.');
      }

      // Which chat this message belongs to: the one the token names, or none (a new chat)
      let conversationId: string | null = null;
      if (options.visitorToken !== undefined) {
        const chat = await findChatOfVisitor(widget, options.visitorToken);
        if (!chat.ended) conversationId = chat.id;
      }
      if (
        conversationId === null &&
        input.limiters &&
        !input.limiters.newChatsPerAddress.tryTake(options.address, now())
      ) {
        throw tooMany('Too many new chats from your connection. Please try again later.');
      }

      const earlierMessages = conversationId
        ? await conversationRecords.readChatMessages(accountId, conversationId)
        : [];
      if (earlierMessages.length >= MOST_MESSAGES_IN_A_WEB_CHAT) {
        throw new ApiError(400, 'CHAT_TOO_LONG', 'This chat is long enough. Please close it and start a new one.');
      }

      let saved;
      try {
        saved = await savedTurns.answerAndSave({
          accountId,
          conversationId,
          startConversation: { channel: 'webchat', actor: MODULE_ACTOR },
          earlierMessages: earlierMessages.map((earlier) => ({ sender: earlier.sender, body: earlier.body })),
          message: options.message,
          channel: 'webchat',
          channelNote: WEBCHAT_CHANNEL_NOTE,
          actor: MODULE_ACTOR,
        });
      } catch (error) {
        // The AI could not answer (no key, over the budget, the company is down): the visitor is told plainly and can send it again
        if (error instanceof ApiError) {
          throw new ApiError(
            503,
            'ASSISTANT_UNAVAILABLE',
            "Sorry, I can't answer right now. Please try again in a moment.",
          );
        }
        throw error;
      }

      // When the visitor has given a phone number or an email, the conversation is linked to them, so the sorting can make the contact.
      // (While a person holds the chat the agent learns nothing, so there is nothing to link.)
      if (saved.turn !== null) {
        const contact = readVisitorContact(saved.turn.state.details, widget.defaultCountry as CountryCode);
        if (contact.phoneKey !== undefined || contact.email !== undefined) {
          await conversationRecords.linkVisitorContact(accountId, saved.conversationId, {
            ...contact,
            actor: MODULE_ACTOR,
          });
        }
      }

      return {
        reply: saved.turn?.reply ?? null,
        heldByPerson: saved.heldByPerson,
        visitorToken: await signVisitorToken({
          appSecret: input.appSecret,
          accountId,
          conversationId: saved.conversationId,
          now: now(),
        }),
        newChat: conversationId === null,
      };
    },
  };
}

/** The answer for a token that cannot be used. The browser should forget it and start a new chat. */
function invalidVisitorToken(): ApiError {
  return new ApiError(401, 'VISITOR_TOKEN_INVALID', 'This chat can no longer be continued. Please start a new one.');
}
