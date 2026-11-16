import type { CountryCode } from 'libphonenumber-js';
import type { WidgetConfig, WidgetMessageResponse } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, notFound, tooMany } from '../../../../kernel/errors';
import type { ModuleGate } from '../../../../kernel/module-system/registry';
import type { createAgentSavedTurnService } from '../../../core/agents';
import { createConversationRecordsService } from '../../../core/conversations';
import { describeWidgetConfig } from '../helpers/describe-widget-config';
import { readVisitorContact } from '../helpers/read-visitor-contact';
import { isWebsiteAllowed } from '../helpers/website-origin';
import { signVisitorToken, verifyVisitorToken } from '../helpers/visitor-token';
import type { WindowLimiter } from '../helpers/window-limiter';
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
  /** The website's address as the browser sent it, already checked against the business's allowed websites. */
  origin: string;
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
  limiters?: WidgetLimiters | undefined;
  now?: () => Date;
}) {
  const { database, gate, savedTurns } = input;
  const now = input.now ?? (() => new Date());
  const conversationRecords = createConversationRecordsService({ database });

  return {
    /**
     * Finds the business from the widget key and checks the website. 404 for an unknown key and for a business that switched the chat off
     * (the same answer, so nothing is said about which); 403 when the website is not on the business's list (an empty list allows none).
     */
    async openWidget(widgetKey: string, requestOrigin: string | undefined): Promise<OpenedWidget> {
      const found = await webchatSettingsRepository.findSettingsByWidgetKey(database.system, widgetKey);
      if (!found || !(await gate.isActive(found.accountId, 'channel.webchat'))) throw notFound('That chat');
      if (requestOrigin === undefined || !isWebsiteAllowed(requestOrigin, found.settings.allowedWebsites)) {
        throw new ApiError(403, 'WEBSITE_NOT_ALLOWED', 'This website may not use this chat.');
      }
      return {
        accountId: found.accountId,
        defaultCountry: found.defaultCountry,
        settings: found.settings,
        origin: requestOrigin,
      };
    },

    /** How the bubble should look and which buttons it shows. Also notes that the bubble was seen working on this website. */
    async readConfig(widget: OpenedWidget): Promise<WidgetConfig> {
      await database.runInAccountTransaction(widget.accountId, (transaction) =>
        webchatSettingsRepository.recordLastSeen(transaction, {
          accountId: widget.accountId,
          website: widget.origin,
          seenAt: now(),
        }),
      );
      return describeWidgetConfig(widget.settings, input.publicBaseUrl);
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

      if (input.limiters && !input.limiters.messagesPerKey.tryTake(widget.settings.widgetKey, now())) {
        throw tooMany('This chat is very busy right now. Please try again in a minute.');
      }

      // Which chat this message belongs to: the one the token names, or none (a new chat)
      let conversationId: string | null = null;
      if (options.visitorToken !== undefined) {
        const claims = await verifyVisitorToken({
          appSecret: input.appSecret,
          token: options.visitorToken,
          now: now(),
        });
        if (!claims || claims.accountId !== accountId) throw invalidVisitorToken();
        const chat = await conversationRecords.findChat(accountId, claims.conversationId, 'webchat');
        if (!chat) throw invalidVisitorToken();
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

      // When the visitor has given a phone number or an email, the conversation is linked to them, so the sorting can make the contact
      const contact = readVisitorContact(saved.turn.state.details, widget.defaultCountry as CountryCode);
      if (contact.phoneKey !== undefined || contact.email !== undefined) {
        await conversationRecords.linkVisitorContact(accountId, saved.conversationId, {
          ...contact,
          actor: MODULE_ACTOR,
        });
      }

      return {
        reply: saved.turn.reply,
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
