import { useState, type FormEvent } from 'react';
import type { KnowledgeQuestion } from '@toobler-one/shared';
import { Alert, Button, Checkbox, SegmentedControl, TextAreaField, TextField } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import { draftToValue, emptyListRow, startDraft, type AnswerDraft } from './answer-draft';
import { HoursEditor } from './HoursEditor';
import { ListEditor } from './ListEditor';
import { describeSaveProblem } from './problem-message';

const OTHER_CHOICE = 'Other';

/** The one-at-a-time choice list: big tap targets, the options of the question, and "Other" with a box for the words when allowed. */
function ChoiceList(props: {
  question: KnowledgeQuestion;
  draft: Extract<AnswerDraft, { kind: 'pick_one' }>;
  onChange: (draft: Extract<AnswerDraft, { kind: 'pick_one' }>) => void;
}) {
  const { question, draft, onChange } = props;
  const options = [...(question.options ?? [])];
  if (question.allowOther && !options.includes(OTHER_CHOICE)) options.push(OTHER_CHOICE);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">{question.text}</legend>
      {options.map((option) => (
        <label key={option} className="text-body-md flex min-h-10 cursor-pointer items-center gap-3 text-text-primary">
          <input
            type="radio"
            name={`choice-${question.key}`}
            value={option}
            checked={draft.choice === option}
            onChange={() => onChange({ ...draft, choice: option })}
            className="size-4 accent-[var(--color-action)]"
          />
          {option}
        </label>
      ))}
      {draft.choice === OTHER_CHOICE ? (
        <TextField
          label={t('knowledge.editor.otherText')}
          value={draft.otherText}
          onChange={(event) => onChange({ ...draft, otherText: event.target.value })}
        />
      ) : null}
    </fieldset>
  );
}

/** What fits the question's own type: a text box, a choice list, ticks, Yes or No, the week's hours, or rows. */
function EditorFields(props: {
  question: KnowledgeQuestion;
  draft: AnswerDraft;
  onChange: (draft: AnswerDraft) => void;
}) {
  const { question, draft, onChange } = props;
  switch (draft.kind) {
    case 'text':
      return question.type === 'long_text' ? (
        <TextAreaField
          label={question.text}
          value={draft.text}
          onChange={(event) => onChange({ ...draft, text: event.target.value })}
        />
      ) : (
        <TextField
          label={question.text}
          value={draft.text}
          type={question.type === 'link' ? 'url' : 'text'}
          onChange={(event) => onChange({ ...draft, text: event.target.value })}
        />
      );
    case 'pick_one':
      return <ChoiceList question={question} draft={draft} onChange={onChange} />;
    case 'pick_several': {
      const options = [...(question.options ?? [])];
      if (question.allowOther && !options.includes(OTHER_CHOICE)) options.push(OTHER_CHOICE);
      return (
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{question.text}</legend>
          {options.map((option) => (
            <Checkbox
              key={option}
              label={option}
              checked={draft.choices.includes(option)}
              onChange={(event) =>
                onChange({
                  ...draft,
                  choices: event.target.checked
                    ? [...draft.choices, option]
                    : draft.choices.filter((choice) => choice !== option),
                })
              }
            />
          ))}
          {draft.choices.includes(OTHER_CHOICE) ? (
            <TextField
              label={t('knowledge.editor.otherText')}
              value={draft.otherText}
              onChange={(event) => onChange({ ...draft, otherText: event.target.value })}
            />
          ) : null}
        </fieldset>
      );
    }
    case 'yes_no':
      return (
        <div className="flex flex-col gap-3">
          <SegmentedControl
            ariaLabel={`${question.text} ${t('knowledge.editor.yesNo')}`}
            options={[
              { value: 'yes', label: t('knowledge.editor.yes') },
              { value: 'no', label: t('knowledge.editor.no') },
            ]}
            value={draft.yes === null ? ('' as 'yes') : draft.yes ? 'yes' : 'no'}
            onChange={(value) => onChange({ ...draft, yes: value === 'yes' })}
          />
          {draft.yes === true && question.yesDetail ? (
            <TextField
              label={question.yesDetail.label}
              type={question.yesDetail.kind === 'link' ? 'url' : 'text'}
              value={draft.detail}
              onChange={(event) => onChange({ ...draft, detail: event.target.value })}
            />
          ) : null}
        </div>
      );
    case 'weekly_hours':
      return <HoursEditor draft={draft} onChange={onChange} />;
    case 'list':
      return <ListEditor question={question} draft={draft} onChange={onChange} />;
    case 'price':
      return (
        <TextField
          label={question.text}
          inputMode="decimal"
          value={draft.rupees}
          onChange={(event) => onChange({ ...draft, rupees: event.target.value })}
        />
      );
    case 'not_answerable':
      return <p className="text-body-md text-text-secondary">{t('knowledge.question.fileLater')}</p>;
  }
}

/**
 * The editor for one question: fields that fit its type, Save and Cancel. It checks the answer on the device first, then sends it
 * (`PUT /knowledge/answers/{key}`); the API's refusal, if any, is shown in its own words. `onSaved` runs after the answer is saved.
 */
export function AnswerEditor(props: { question: KnowledgeQuestion; onSaved: () => void; onCancel: () => void }) {
  const { question, onSaved, onCancel } = props;
  const [draft, setDraft] = useState<AnswerDraft>(() => {
    const started = startDraft(question, question.answer?.value ?? null);
    // A list starts with one empty row so there is something to type in
    return started.kind === 'list' && started.rows.length === 0
      ? { ...started, rows: [emptyListRow(question.rowFields ?? [])] }
      : started;
  });
  const [problem, setProblem] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const result = draftToValue(question, draft);
    if (!result.ok) {
      setProblem(result.message);
      return;
    }
    setIsSaving(true);
    setProblem(null);
    try {
      await apiRequest('PUT', `/knowledge/answers/${question.key}`, { value: result.value });
      onSaved();
    } catch (error) {
      setProblem(
        error instanceof ApiRequestError || error instanceof Error
          ? describeSaveProblem(error)
          : t('knowledge.problem.unknown'),
      );
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={save}
      className="flex flex-col gap-4"
      aria-label={formatMessage('knowledge.editor.formFor', { question: question.text })}
    >
      <EditorFields question={question} draft={draft} onChange={setDraft} />
      {problem ? <Alert tone="error">{problem}</Alert> : null}
      <div className="flex gap-3">
        <Button type="submit" variant="primary" isLoading={isSaving} disabled={draft.kind === 'not_answerable'}>
          {isSaving ? t('knowledge.editor.saving') : t('knowledge.editor.save')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSaving}>
          {t('knowledge.editor.cancel')}
        </Button>
      </div>
    </form>
  );
}
