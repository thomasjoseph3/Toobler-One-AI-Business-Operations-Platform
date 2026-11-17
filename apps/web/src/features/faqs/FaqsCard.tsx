import { useState } from 'react';
import type { Faq } from '@toobler-one/shared';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import { describeFaqProblem } from './problem-message';
import { FAQ_SOURCE_WORDS, isWaitingForCheck } from './unanswered-state';

/** Every FAQ, newest first. Anyone on the team can add, change and delete one (delete asks "Are you sure?" naming it). A drafted FAQ is marked "Please check". */
export function FaqsCard(props: { faqs: readonly Faq[]; onAdd: () => void; onEdit: (faq: Faq) => void; onChanged: () => void }) {
  const { faqs, onAdd, onEdit, onChanged } = props;
  const [toDelete, setToDelete] = useState<Faq | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setIsDeleting(true);
    setProblem(null);
    try {
      await apiRequest('DELETE', `/knowledge/faqs/${toDelete.id}`);
      onChanged();
    } catch (error) {
      setProblem(describeFaqProblem(error));
    } finally {
      setToDelete(null);
      setIsDeleting(false);
    }
  };

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-heading-sm text-text-primary">{t('faqs.list.title')}</h2>
        <Button variant="primary" size="compact" onClick={onAdd}>
          {t('faqs.list.add')}
        </Button>
      </div>
      {problem ? <Alert tone="error" className="mb-3">{problem}</Alert> : null}
      {faqs.length === 0 ? (
        <EmptyState icon={<span aria-hidden>💬</span>} title={t('faqs.list.empty.title')} description={t('faqs.list.empty.description')} />
      ) : (
        <ul>
          {faqs.map((faq) => (
            <li key={faq.id} className="flex flex-col gap-2 border-b border-border-default py-4 last:border-b-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-label-md text-text-primary">{faq.question}</h3>
                {isWaitingForCheck(faq) ? <Badge tone="warning">{t('faqs.list.check')}</Badge> : null}
              </div>
              <p className="text-body-md whitespace-pre-line text-text-primary">{faq.answer}</p>
              <p className="text-label-sm text-text-secondary">{t(FAQ_SOURCE_WORDS[faq.source])}</p>
              {isWaitingForCheck(faq) ? <p className="text-label-sm text-text-secondary">{t('faqs.list.checkHelp')}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="compact" onClick={() => onEdit(faq)} aria-label={formatMessage('faqs.list.edit', { question: faq.question })}>
                  {t('faqs.list.editButton')}
                </Button>
                <Button variant="destructive" size="compact" onClick={() => setToDelete(faq)} aria-label={formatMessage('faqs.list.delete', { question: faq.question })}>
                  {t('faqs.list.deleteButton')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        isOpen={toDelete !== null}
        title={t('faqs.list.deleteTitle')}
        description={toDelete ? formatMessage('faqs.list.deleteDescription', { question: toDelete.question }) : ''}
        confirmLabel={t('faqs.list.deleteConfirm')}
        cancelLabel={t('faqs.form.cancel')}
        closeLabel={t('faqs.form.close')}
        tone="danger"
        isConfirming={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </Card>
  );
}
