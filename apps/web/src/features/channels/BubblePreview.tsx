import type { WebchatButton } from '@toobler-one/shared';
import { t, type MessageKey } from '../../app/i18n';

/** The words on each launcher button. */
const BUTTON_WORDS: Record<WebchatButton, MessageKey> = {
  chat: 'channels.webchat.buttons.chat',
  call: 'channels.webchat.buttons.call',
  whatsapp: 'channels.webchat.buttons.whatsapp',
};

/**
 * A small picture of the chat as visitors will meet it: the greeting in the chosen colour and the buttons that really show, in order. It is a
 * drawing only (nothing in it is pressable) so the owner can see a change before saving it.
 */
export function BubblePreview(props: {
  colour: string;
  greeting: string;
  position: 'bottom_right' | 'bottom_left';
  shownButtons: readonly WebchatButton[];
}) {
  const { colour, greeting, position, shownButtons } = props;
  const isColour = /^#[0-9A-Fa-f]{6}$/.test(colour);
  const background = isColour ? colour : '#1F6FEB';
  return (
    <figure
      aria-label={t('channels.webchat.preview.label')}
      className="m-0 rounded-md border border-border-default bg-surface-subtle p-3"
    >
      <div
        className={`flex flex-col gap-2 ${position === 'bottom_left' ? 'items-start' : 'items-end'}`}
        aria-hidden="true"
      >
        <div className="w-full max-w-[16rem] rounded-lg border border-border-default bg-surface p-3 shadow-sm">
          <p className="text-label-xs mb-1 text-text-secondary">{t('channels.webchat.preview.window')}</p>
          <p className="text-body-md rounded-md px-3 py-2 text-white" style={{ backgroundColor: background }}>
            {greeting.trim() === '' ? '…' : greeting}
          </p>
        </div>
        <div className="flex gap-2">
          {shownButtons.map((button) => (
            <span
              key={button}
              className="text-label-sm rounded-full px-3 py-2 text-white"
              style={{ backgroundColor: background }}
            >
              {t(BUTTON_WORDS[button])}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="text-label-xs mt-2 text-text-secondary">{t('channels.webchat.preview')}</figcaption>
    </figure>
  );
}
