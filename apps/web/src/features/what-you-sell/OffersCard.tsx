import { useState, type FormEvent } from 'react';
import type { Offer } from '@toobler-one/shared';
import { Alert, Badge, Button, Card, Checkbox, ConfirmDialog, EmptyState, SidePanel, TextField } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import {
  buildCreateOfferRequest,
  buildUpdateOfferRequest,
  checkOfferForm,
  EMPTY_OFFER_FORM,
  formatOfferDate,
  formFromOffer,
  todayInTimeZone,
  type OfferFormFields,
  type OfferFormProblems,
} from './offer-form';
import { describeChangeProblem } from './problem-message';

const FORM_ID = 'offer-form';

/** The side panel for adding or changing an offer: the words and the last day. */
function OfferFormPanel(props: { editing: Offer | null; timeZone: string; onClose: () => void; onSaved: () => void }) {
  const { editing, timeZone, onClose, onSaved } = props;
  const [fields, setFields] = useState<OfferFormFields>(editing ? formFromOffer(editing) : EMPTY_OFFER_FORM);
  const [problems, setProblems] = useState<OfferFormProblems>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const today = todayInTimeZone(timeZone, new Date());

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const found = checkOfferForm(fields, today);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    setIsSaving(true);
    setProblem(null);
    try {
      if (editing) {
        const request = buildUpdateOfferRequest(editing, fields);
        if (Object.keys(request).length > 0) await apiRequest('PATCH', `/offers/${editing.id}`, request);
      } else {
        await apiRequest('POST', '/offers', buildCreateOfferRequest(fields));
      }
      onSaved();
    } catch (error) {
      setProblem(describeChangeProblem(error));
      setIsSaving(false);
    }
  };

  return (
    <SidePanel
      isOpen
      onClose={onClose}
      title={t(editing ? 'whatYouSell.offers.form.editTitle' : 'whatYouSell.offers.form.addTitle')}
      closeLabel={t('whatYouSell.form.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('whatYouSell.form.cancel')}</Button>
          <Button type="submit" form={FORM_ID} variant="primary" isLoading={isSaving}>
            {t('whatYouSell.form.save')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={save} className="flex flex-col gap-4" noValidate>
        <TextField label={t('whatYouSell.offers.form.text')} value={fields.text} onChange={(event) => setFields({ ...fields, text: event.target.value })} {...(problems.text ? { errorMessage: problems.text } : {})} />
        <TextField
          label={t('whatYouSell.offers.form.endsOn')}
          helperText={t('whatYouSell.offers.form.endsOnHelper')}
          type="date"
          value={fields.endsOn}
          onChange={(event) => setFields({ ...fields, endsOn: event.target.value })}
          {...(problems.endsOn ? { errorMessage: problems.endsOn } : {})}
        />
        {problem ? <Alert tone="error">{problem}</Alert> : null}
      </form>
    </SidePanel>
  );
}

/** The time-limited offers: what is on now (and, if asked, what has ended). A manager adds, changes and deletes them; staff read. */
export function OffersCard(props: {
  offers: readonly Offer[];
  showEnded: boolean;
  onShowEndedChange: (showEnded: boolean) => void;
  canEdit: boolean;
  timeZone: string;
  onChanged: () => void;
}) {
  const { offers, showEnded, onShowEndedChange, canEdit, timeZone, onChanged } = props;
  // Which offer the panel is open for: none, a new one, or one being changed (a counter makes each opening start fresh)
  const [panel, setPanel] = useState<{ editing: Offer | null; openings: number } | null>(null);
  const [toDelete, setToDelete] = useState<Offer | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setIsDeleting(true);
    setProblem(null);
    try {
      await apiRequest('DELETE', `/offers/${toDelete.id}`);
      setToDelete(null);
      onChanged();
    } catch (error) {
      setProblem(describeChangeProblem(error));
      setToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-heading-sm text-text-primary">{t('whatYouSell.offers.title')}</h2>
        {canEdit ? (
          <Button variant="primary" size="compact" onClick={() => setPanel({ editing: null, openings: (panel?.openings ?? 0) + 1 })}>
            {t('whatYouSell.offers.add')}
          </Button>
        ) : null}
      </div>
      <Checkbox label={t('whatYouSell.offers.showEnded')} checked={showEnded} onChange={(event) => onShowEndedChange(event.target.checked)} />
      {problem ? <Alert tone="error" className="mt-3">{problem}</Alert> : null}
      {offers.length === 0 ? (
        <EmptyState icon={<span aria-hidden>🏷</span>} title={t('whatYouSell.offers.empty.title')} description={t('whatYouSell.offers.empty.description')} />
      ) : (
        <ul className="mt-2">
          {offers.map((offer) => (
            <li key={offer.id} className="flex flex-col gap-2 border-b border-border-default py-4 last:border-b-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-label-md text-text-primary">{offer.text}</p>
                <Badge tone={offer.current ? 'success' : 'neutral'}>{t(offer.current ? 'whatYouSell.offers.current' : 'whatYouSell.offers.ended')}</Badge>
              </div>
              <p className="text-body-md text-text-secondary">{formatMessage('whatYouSell.offers.until', { date: formatOfferDate(offer.endsOn) })}</p>
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="compact" onClick={() => setPanel({ editing: offer, openings: (panel?.openings ?? 0) + 1 })} aria-label={formatMessage('whatYouSell.offers.edit', { text: offer.text })}>
                    {t('whatYouSell.offerings.editButton')}
                  </Button>
                  <Button variant="destructive" size="compact" onClick={() => setToDelete(offer)} aria-label={formatMessage('whatYouSell.offers.delete', { text: offer.text })}>
                    {t('whatYouSell.offerings.deleteButton')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {panel ? (
        <OfferFormPanel
          key={panel.openings}
          editing={panel.editing}
          timeZone={timeZone}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null);
            onChanged();
          }}
        />
      ) : null}
      <ConfirmDialog
        isOpen={toDelete !== null}
        title={t('whatYouSell.offers.deleteTitle')}
        description={toDelete ? formatMessage('whatYouSell.offers.deleteDescription', { text: toDelete.text }) : ''}
        confirmLabel={t('whatYouSell.offerings.deleteConfirm')}
        cancelLabel={t('whatYouSell.form.cancel')}
        closeLabel={t('whatYouSell.form.close')}
        tone="danger"
        isConfirming={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </Card>
  );
}
