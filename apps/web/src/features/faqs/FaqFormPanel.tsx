import { useState, type FormEvent } from 'react';
import type { Faq } from '@toobler-one/shared';
import { Alert, Button, SidePanel, TextAreaField } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { t } from '../../app/i18n';
import { buildCreateFaqRequest, buildUpdateFaqRequest, checkFaqForm, EMPTY_FAQ_FORM, formFromFaq, type FaqFormFields, type FaqFormProblems } from './faq-form';
import { describeFaqProblem } from './problem-message';

const FORM_ID = 'faq-form';

/**
 * The side panel for a question and its answer. Three ways in: a new FAQ, an FAQ being changed, or a customer's unanswered question being
 * answered (the question is filled in, and may be reworded). It checks on the device first, sends only what changed when editing, and shows the
 * API's refusal in plain words. `onSave` does the sending for the unanswered case; otherwise this panel talks to the API itself.
 */
export function FaqFormPanel(props: {
  title: string;
  editing: Faq | null;
  startingFields: FaqFormFields;
  /** For answering an unanswered question: sends the answer instead of creating an FAQ. */
  onSendAnswer?: (fields: FaqFormFields) => Promise<void>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { title, editing, startingFields, onSendAnswer, onClose, onSaved } = props;
  const [fields, setFields] = useState<FaqFormFields>(startingFields);
  const [problems, setProblems] = useState<FaqFormProblems>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const found = checkFaqForm(fields);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    setIsSaving(true);
    setProblem(null);
    try {
      if (onSendAnswer) {
        await onSendAnswer(fields);
      } else if (editing) {
        const request = buildUpdateFaqRequest(editing, fields);
        if (Object.keys(request).length > 0) await apiRequest('PATCH', `/knowledge/faqs/${editing.id}`, request);
      } else {
        await apiRequest('POST', '/knowledge/faqs', buildCreateFaqRequest(fields));
      }
      onSaved();
    } catch (error) {
      setProblem(describeFaqProblem(error));
      setIsSaving(false);
    }
  };

  return (
    <SidePanel
      isOpen
      onClose={onClose}
      title={title}
      closeLabel={t('faqs.form.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('faqs.form.cancel')}</Button>
          <Button type="submit" form={FORM_ID} variant="primary" isLoading={isSaving}>
            {t('faqs.form.save')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={save} className="flex flex-col gap-4" noValidate>
        <TextAreaField
          label={t('faqs.form.question')}
          helperText={t('faqs.form.questionHelper')}
          rows={2}
          value={fields.question}
          onChange={(event) => setFields({ ...fields, question: event.target.value })}
          {...(problems.question ? { errorMessage: problems.question } : {})}
        />
        <TextAreaField label={t('faqs.form.answer')} rows={5} value={fields.answer} onChange={(event) => setFields({ ...fields, answer: event.target.value })} {...(problems.answer ? { errorMessage: problems.answer } : {})} />
        {problem ? <Alert tone="error">{problem}</Alert> : null}
      </form>
    </SidePanel>
  );
}

export { EMPTY_FAQ_FORM, formFromFaq };
