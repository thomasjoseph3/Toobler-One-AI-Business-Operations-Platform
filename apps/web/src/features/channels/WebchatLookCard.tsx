import { useState, type FormEvent } from 'react';
import type { WebchatButton, WebchatSettings } from '@toobler-one/shared';
import { Alert, Button, Card, Checkbox, SelectField, TextField } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { formatMessage, t, type MessageKey } from '../../app/i18n';
import { BubblePreview } from './BubblePreview';
import { describeChannelProblem } from './problem-message';
import {
  buildWebchatPatch,
  checkWebchatForm,
  formFromSettings,
  isButtonShown,
  isEmptyPatch,
  moveButton,
  toggleButton,
  type WebchatFormFields,
  type WebchatFormProblems,
} from './webchat-form';

const ALL_BUTTONS: readonly WebchatButton[] = ['chat', 'call', 'whatsapp'];
const BUTTON_WORDS: Record<WebchatButton, MessageKey> = {
  chat: 'channels.webchat.buttons.chat',
  call: 'channels.webchat.buttons.call',
  whatsapp: 'channels.webchat.buttons.whatsapp',
};

/**
 * How the chat looks and what its buttons do: colour, greeting, where the bubble sits, which buttons show and in what order, and the numbers
 * behind Call and WhatsApp, with a live preview. It checks on the device first and sends only what changed. Managers change; staff read.
 */
export function WebchatLookCard({
  settings,
  canEdit,
  onSaved,
}: {
  settings: WebchatSettings;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [fields, setFields] = useState<WebchatFormFields>(formFromSettings(settings));
  const [problems, setProblems] = useState<WebchatFormProblems>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const change = (changes: Partial<WebchatFormFields>) => {
    setFields((earlier) => ({ ...earlier, ...changes }));
    setIsSaved(false);
  };
  const shownButtons = fields.buttonOrder.filter((button) => isButtonShown(button, fields));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const found = checkWebchatForm(fields);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    setIsSaving(true);
    setProblem(null);
    try {
      const patch = buildWebchatPatch(settings, fields);
      if (!isEmptyPatch(patch)) await apiRequest('PATCH', '/channels/webchat', patch);
      setIsSaved(true);
      onSaved();
    } catch (error) {
      setProblem(describeChannelProblem(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <h2 className="text-heading-sm mb-3 text-text-primary">{t('channels.webchat.look.title')}</h2>
      <form onSubmit={save} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div className="flex items-end gap-3">
              <TextField
                label={t('channels.webchat.look.colourHex')}
                helperText={t('channels.webchat.look.colourHelper')}
                value={fields.colour}
                onChange={(event) => change({ colour: event.target.value })}
                disabled={!canEdit}
                className="flex-1"
                {...(problems.colour ? { errorMessage: problems.colour } : {})}
              />
              <input
                type="color"
                aria-label={t('channels.webchat.look.colour')}
                value={/^#[0-9A-Fa-f]{6}$/.test(fields.colour) ? fields.colour : '#1F6FEB'}
                onChange={(event) => change({ colour: event.target.value.toUpperCase() })}
                disabled={!canEdit}
                className="mb-6 h-10 w-12 cursor-pointer rounded-md border border-border-default bg-input p-1"
              />
            </div>
            <TextField
              label={t('channels.webchat.look.greeting')}
              value={fields.greeting}
              onChange={(event) => change({ greeting: event.target.value })}
              disabled={!canEdit}
              {...(problems.greeting ? { errorMessage: problems.greeting } : {})}
            />
            <SelectField
              label={t('channels.webchat.look.position')}
              value={fields.position}
              options={[
                { value: 'bottom_right', label: t('channels.webchat.look.bottomRight') },
                { value: 'bottom_left', label: t('channels.webchat.look.bottomLeft') },
              ]}
              onChange={(event) => change({ position: event.target.value as WebchatFormFields['position'] })}
              disabled={!canEdit}
            />
          </div>
          <BubblePreview
            colour={fields.colour}
            greeting={fields.greeting}
            position={fields.position}
            shownButtons={shownButtons}
          />
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-label-md text-text-primary">{t('channels.webchat.buttons.title')}</legend>
          <p className="text-body-md text-text-secondary">{t('channels.webchat.buttons.description')}</p>
          {problems.buttonOrder ? <p className="text-label-sm text-error">{problems.buttonOrder}</p> : null}
          <ul className="flex flex-col gap-2">
            {[...fields.buttonOrder, ...ALL_BUTTONS.filter((button) => !fields.buttonOrder.includes(button))].map(
              (button) => {
                const isOn = fields.buttonOrder.includes(button);
                const position = fields.buttonOrder.indexOf(button);
                const name = t(BUTTON_WORDS[button]);
                return (
                  <li
                    key={button}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-subtle px-3 py-2"
                  >
                    <Checkbox
                      label={formatMessage('channels.webchat.buttons.show', { button: name })}
                      checked={isOn}
                      onChange={(event) =>
                        change({ buttonOrder: toggleButton(fields.buttonOrder, button, event.target.checked) })
                      }
                      disabled={!canEdit}
                    />
                    <div className="flex items-center gap-1">
                      {isOn && !isButtonShown(button, fields) ? (
                        <span className="text-label-sm text-text-secondary">
                          {t('channels.webchat.buttons.needsNumber')}
                        </span>
                      ) : null}
                      {isOn && canEdit ? (
                        <>
                          <Button
                            type="button"
                            variant="tertiary"
                            size="compact"
                            disabled={position === 0}
                            aria-label={formatMessage('channels.webchat.buttons.moveUp', { button: name })}
                            onClick={() => change({ buttonOrder: moveButton(fields.buttonOrder, button, 'up') })}
                          >
                            ↑
                          </Button>
                          <Button
                            type="button"
                            variant="tertiary"
                            size="compact"
                            disabled={position === fields.buttonOrder.length - 1}
                            aria-label={formatMessage('channels.webchat.buttons.moveDown', { button: name })}
                            onClick={() => change({ buttonOrder: moveButton(fields.buttonOrder, button, 'down') })}
                          >
                            ↓
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              },
            )}
          </ul>
        </fieldset>

        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label={t('channels.webchat.phone')}
            inputMode="tel"
            value={fields.phoneNumber}
            onChange={(event) => change({ phoneNumber: event.target.value })}
            disabled={!canEdit}
            {...(problems.phoneNumber ? { errorMessage: problems.phoneNumber } : {})}
          />
          <TextField
            label={t('channels.webchat.whatsapp')}
            inputMode="tel"
            value={fields.whatsappNumber}
            onChange={(event) => change({ whatsappNumber: event.target.value })}
            disabled={!canEdit}
            {...(problems.whatsappNumber ? { errorMessage: problems.whatsappNumber } : {})}
          />
        </div>
        <TextField
          label={t('channels.webchat.whatsappMessage')}
          helperText={t('channels.webchat.whatsappMessageHelper')}
          value={fields.whatsappMessage}
          onChange={(event) => change({ whatsappMessage: event.target.value })}
          disabled={!canEdit}
          {...(problems.whatsappMessage ? { errorMessage: problems.whatsappMessage } : {})}
        />

        {problem ? <Alert tone="error">{problem}</Alert> : null}
        {isSaved ? <Alert tone="success">{t('channels.webchat.saved')}</Alert> : null}
        {canEdit ? (
          <div>
            <Button type="submit" variant="primary" isLoading={isSaving}>
              {t('channels.webchat.save')}
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
