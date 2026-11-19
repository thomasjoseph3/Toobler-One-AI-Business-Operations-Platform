import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { WidgetConfig } from '@toobler-one/shared';
import { CHAT_TEXT, MOST_CHARACTERS_IN_A_MESSAGE } from './chat-text';
import { forgetToken, readSavedToken, saveToken } from './chat-storage';
import { describeSendError } from './describe-send-error';
import { endWidgetChat, fetchWidgetChat, fetchWidgetConfig, sendWidgetMessage, WidgetApiError } from './widget-api';

/** One line of the conversation as shown. */
interface ShownMessage {
  id: number;
  sender: 'customer' | 'agent' | 'staff';
  body: string;
}

/** How often an open chat asks for new messages (so a team member's reply shows up). */
const ASK_FOR_NEW_MESSAGES_EVERY_MILLISECONDS = 4000;

/** Tells the page around this window (the loader) that the visitor wants the window closed. The window itself never closes. */
function askToClose(): void {
  window.parent.postMessage({ type: 'toobler-chat:close' }, '*');
}

/**
 * The chat window a visitor sees inside the bubble: the business's greeting, the conversation, and a box to type in. It says plainly that
 * it is an AI assistant. A reload carries on the same chat (the token is kept in the browser); "End chat" ends it and starts fresh.
 */
export function ChatWindow({ widgetKey }: { widgetKey: string | null }) {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(widgetKey === null);
  const [messages, setMessages] = useState<ShownMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // True while a person of the business has taken the chat over from the AI
  const [isHeldByPerson, setIsHeldByPerson] = useState(false);
  const nextMessageId = useRef(1);
  const tokenRef = useRef<string | null>(null);
  // Whether a message is being sent, readable inside the timer above without restarting it
  const isSendingRef = useRef(false);
  const listEnd = useRef<HTMLDivElement | null>(null);
  const inputBox = useRef<HTMLTextAreaElement | null>(null);

  /** Makes a message with its own id. */
  const makeMessage = useCallback((sender: ShownMessage['sender'], body: string): ShownMessage => {
    const message = { id: nextMessageId.current, sender, body };
    nextMessageId.current += 1;
    return message;
  }, []);

  // On opening: the bubble's look, then the chat so far when this browser has a chat to carry on
  useEffect(() => {
    if (widgetKey === null) return;
    let isStillWanted = true;
    void (async () => {
      try {
        const lookedUp = await fetchWidgetConfig(widgetKey);
        if (!isStillWanted) return;
        setConfig(lookedUp);
        document.documentElement.style.setProperty('--chat-accent', lookedUp.colour);
      } catch {
        if (isStillWanted) setIsUnavailable(true);
        return;
      }
      const savedToken = readSavedToken(widgetKey);
      if (savedToken === null) return;
      try {
        const chat = await fetchWidgetChat(widgetKey, savedToken);
        if (!isStillWanted) return;
        if (chat.ended) {
          forgetToken(widgetKey);
          return;
        }
        tokenRef.current = savedToken;
        setMessages(chat.messages.map((earlier) => makeMessage(earlier.sender, earlier.body)));
        setIsHeldByPerson(chat.heldByPerson);
      } catch (error) {
        // The server does not know this token any more: start fresh. Any other failure leaves the chat to start fresh too.
        if (error instanceof WidgetApiError && error.status === 401) forgetToken(widgetKey);
      }
    })();
    return () => {
      isStillWanted = false;
    };
  }, [widgetKey, makeMessage]);

  // While the chat is open, ask for new messages every few seconds: a team member's reply (and the "joined" note) arrive this way
  useEffect(() => {
    if (widgetKey === null || config === null) return;
    const timer = setInterval(() => {
      const token = tokenRef.current;
      if (token === null || isSendingRef.current) return;
      fetchWidgetChat(widgetKey, token)
        .then((chat) => {
          if (tokenRef.current !== token || isSendingRef.current) return;
          setIsHeldByPerson(chat.heldByPerson);
          // The server's list is the truth: show it when it has something this window does not show yet
          setMessages((shown) =>
            chat.messages.length > shown.length
              ? chat.messages.map((earlier) => makeMessage(earlier.sender, earlier.body))
              : shown,
          );
        })
        .catch(() => undefined); // a missed ask is tried again a few seconds later
    }, ASK_FOR_NEW_MESSAGES_EVERY_MILLISECONDS);
    return () => clearInterval(timer);
  }, [widgetKey, config, makeMessage]);

  // Keep the newest message in view, and the typing box ready
  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: 'end' });
  }, [messages, isSending]);
  useEffect(() => {
    if (config) inputBox.current?.focus();
  }, [config]);

  // Escape asks for the window to be closed
  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') askToClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  /** Sends what the visitor typed. A token the server no longer knows is dropped and the message starts a new chat. */
  async function sendDraft() {
    const text = draft.trim();
    if (widgetKey === null || text === '' || isSending) return;
    setProblem(null);
    setIsSending(true);
    isSendingRef.current = true;
    const shownMessage = makeMessage('customer', text);
    setMessages((earlier) => [...earlier, shownMessage]);
    setDraft('');
    try {
      let answer;
      try {
        answer = await sendWidgetMessage(widgetKey, tokenRef.current, text);
      } catch (error) {
        if (!(error instanceof WidgetApiError) || error.status !== 401 || tokenRef.current === null) throw error;
        forgetToken(widgetKey);
        tokenRef.current = null;
        answer = await sendWidgetMessage(widgetKey, null, text);
      }
      tokenRef.current = answer.visitorToken;
      saveToken(widgetKey, answer.visitorToken);
      setIsHeldByPerson(answer.heldByPerson);
      // While a person holds the chat the AI says nothing: the reply is null and the team member answers in their own time
      const aiReply = answer.reply;
      if (aiReply !== null) setMessages((earlier) => [...earlier, makeMessage('agent', aiReply)]);
    } catch (error) {
      // Nothing was saved, so the message is given back to be sent again
      setMessages((earlier) => earlier.filter((message) => message.id !== shownMessage.id));
      setDraft(text);
      setProblem(describeSendError(error));
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
      inputBox.current?.focus();
    }
  }

  /** Ends the chat on the server and starts a clean one. */
  async function endChat() {
    if (widgetKey === null || tokenRef.current === null) {
      setMessages([]);
      return;
    }
    const token = tokenRef.current;
    tokenRef.current = null;
    forgetToken(widgetKey);
    setMessages([]);
    setIsHeldByPerson(false);
    setProblem(null);
    try {
      await endWidgetChat(widgetKey, token);
    } catch {
      // The chat ends by itself after 15 minutes of silence, so a failed call here costs nothing
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void sendDraft();
  }

  /** Enter sends; Shift+Enter makes a new line. */
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendDraft();
    }
  }

  if (isUnavailable) {
    return (
      <main className="chat" aria-label={CHAT_TEXT.windowLabel}>
        <p className="chat-notice">{CHAT_TEXT.unavailable}</p>
      </main>
    );
  }
  if (config === null) {
    return (
      <main className="chat" aria-label={CHAT_TEXT.windowLabel}>
        <p className="chat-notice">{CHAT_TEXT.loading}</p>
      </main>
    );
  }

  const charactersLeft = MOST_CHARACTERS_IN_A_MESSAGE - draft.length;
  return (
    <main className="chat" aria-label={CHAT_TEXT.windowLabel}>
      <header className="chat-header">
        <div>
          <p className="chat-title">{CHAT_TEXT.assistantLabel}</p>
        </div>
        <div className="chat-header-actions">
          <button
            type="button"
            className="chat-text-button"
            onClick={() => void endChat()}
            title={CHAT_TEXT.endChatHint}
          >
            {CHAT_TEXT.endChat}
          </button>
          <button type="button" className="chat-icon-button" onClick={askToClose} aria-label={CHAT_TEXT.close}>
            ×
          </button>
        </div>
      </header>

      <div className="chat-messages" role="log" aria-live="polite" aria-label={CHAT_TEXT.windowLabel}>
        <div className="chat-row chat-row-agent">
          <p className="chat-bubble chat-bubble-agent">
            <span className="chat-sr-only">{CHAT_TEXT.assistantSaid}: </span>
            {config.greeting}
          </p>
        </div>
        {messages.map((message) => (
          <div key={message.id} className={`chat-row chat-row-${message.sender}`}>
            <p className={`chat-bubble chat-bubble-${message.sender}`}>
              <span className="chat-sr-only">
                {message.sender === 'customer'
                  ? CHAT_TEXT.youSaid
                  : message.sender === 'staff'
                    ? CHAT_TEXT.teamMemberSaid
                    : CHAT_TEXT.assistantSaid}
                :{' '}
              </span>
              {message.body}
            </p>
          </div>
        ))}
        {isHeldByPerson ? <p className="chat-typing">{CHAT_TEXT.teamMemberJoined}</p> : null}
        {isSending && !isHeldByPerson ? <p className="chat-typing">{CHAT_TEXT.typing}</p> : null}
        <div ref={listEnd} />
      </div>

      {problem ? (
        <p className="chat-problem" role="alert">
          {problem}
        </p>
      ) : null}

      <form className="chat-form" onSubmit={handleSubmit}>
        <label className="chat-sr-only" htmlFor="chat-input">
          {CHAT_TEXT.inputLabel}
        </label>
        <textarea
          id="chat-input"
          ref={inputBox}
          className="chat-input"
          rows={1}
          value={draft}
          maxLength={MOST_CHARACTERS_IN_A_MESSAGE}
          placeholder={CHAT_TEXT.inputPlaceholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="submit" className="chat-send" disabled={isSending || draft.trim() === ''}>
          {CHAT_TEXT.send}
        </button>
        {charactersLeft <= 100 ? <p className="chat-count">{charactersLeft}</p> : null}
      </form>
    </main>
  );
}
