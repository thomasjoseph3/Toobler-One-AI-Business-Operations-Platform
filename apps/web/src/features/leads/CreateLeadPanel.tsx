import { useState, type FormEvent } from 'react';
import type { Contact } from '@toobler-one/shared';
import { Alert, Button, SidePanel, TextAreaField, TextField } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { t, type MessageKey } from '../../app/i18n';
import { findLeadDisplayName } from './lead-display';
import {
  buildContactRequest,
  buildLeadRequest,
  checkLeadForm,
  EMPTY_LEAD_FORM,
  type LeadFormFields,
  type LeadFormProblems,
} from './lead-form';
import { useContactSearch } from './useContactSearch';

/** The words to show for each reason the API can give for refusing to add the person or the lead. */
const API_ERROR_MESSAGES: Record<string, MessageKey> = {
  CONTACT_EXISTS: 'leadForm.error.contactExists',
  LEAD_OPEN: 'leadForm.error.leadOpen',
  LEAD_RECENTLY_LOST: 'leadForm.error.leadRecentlyLost',
  NETWORK_ERROR: 'leadForm.error.network',
};

export interface CreateLeadPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** The business's time zone: the callback time is read in it. */
  timeZone: string;
  /** Called after the lead was created, with the name to show in the confirmation. */
  onCreated: (displayName: string) => void;
}

const FORM_ID = 'create-lead-form';

/** The person part of the form: search for someone, or type a new person's details. */
function PersonSection(props: {
  fields: LeadFormFields;
  problems: LeadFormProblems;
  chosenPerson: Pick<Contact, 'id' | 'name' | 'phone' | 'email'> | null;
  searchText: string;
  onSearchTextChange: (text: string) => void;
  onChoosePerson: (person: Pick<Contact, 'id' | 'name' | 'phone' | 'email'> | null) => void;
  onChangeFields: (changes: Partial<LeadFormFields>) => void;
}) {
  const { fields, problems, chosenPerson, searchText, onSearchTextChange, onChoosePerson, onChangeFields } = props;
  const search = useContactSearch(fields.personMode === 'existing' && chosenPerson === null ? searchText : '');

  if (fields.personMode === 'new') {
    return (
      <div className="flex flex-col gap-4">
        <TextField
          label={t('leadForm.person.newName')}
          value={fields.newName}
          onChange={(event) => onChangeFields({ newName: event.target.value })}
          autoComplete="off"
          {...(problems.newName ? { errorMessage: t(problems.newName) } : {})}
        />
        <TextField
          label={t('leadForm.person.newPhone')}
          type="tel"
          value={fields.newPhone}
          onChange={(event) => onChangeFields({ newPhone: event.target.value })}
          autoComplete="off"
          helperText={t('leadForm.person.newHint')}
          {...(problems.newContact ? { errorMessage: t(problems.newContact) } : {})}
        />
        <TextField
          label={t('leadForm.person.newEmail')}
          type="email"
          value={fields.newEmail}
          onChange={(event) => onChangeFields({ newEmail: event.target.value })}
          autoComplete="off"
        />
        <div>
          <Button variant="link" onClick={() => onChangeFields({ personMode: 'existing' })}>
            {t('leadForm.person.backToSearch')}
          </Button>
        </div>
      </div>
    );
  }

  if (chosenPerson !== null) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-border-default bg-surface-subtle p-3">
        <p className="text-body-md min-w-0 text-text-primary">
          <span className="text-text-secondary">{t('leadForm.person.chosen')} </span>
          <span className="text-body-md-semibold">{findLeadDisplayName(chosenPerson)}</span>
        </p>
        <Button size="compact" onClick={() => onChoosePerson(null)}>
          {t('leadForm.person.change')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label={t('leadForm.person.search')}
        type="search"
        value={searchText}
        onChange={(event) => onSearchTextChange(event.target.value)}
        autoComplete="off"
        helperText={t('leadForm.person.searchHint')}
        {...(problems.person ? { errorMessage: t(problems.person) } : {})}
      />
      {search.status === 'searching' ? (
        <p role="status" className="text-body-sm text-text-secondary">
          {t('leadForm.person.searching')}
        </p>
      ) : null}
      {search.status === 'error' ? (
        <p role="alert" className="text-body-sm text-error">
          {t('leadForm.person.searchFailed')}
        </p>
      ) : null}
      {search.status === 'found' && search.people.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t('leadForm.person.noResults')}</p>
      ) : null}
      {search.status === 'found' && search.people.length > 0 ? (
        <ul className="flex flex-col overflow-hidden rounded-md border border-border-default">
          {search.people.map((person) => (
            <li key={person.id} className="border-t border-border-subtle first:border-t-0">
              <button
                type="button"
                onClick={() => onChoosePerson(person)}
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-hover"
              >
                <span className="text-body-md text-text-primary">{findLeadDisplayName(person)}</span>
                <span className="text-body-xs text-text-secondary">
                  {[person.phone, person.email]
                    .filter((value) => value && value !== findLeadDisplayName(person))
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <Button variant="link" onClick={() => onChangeFields({ personMode: 'new' })}>
          {t('leadForm.person.addNew')}
        </Button>
      </div>
    </div>
  );
}

/**
 * The Create lead form in a side panel: who it is (search, or add a new person), then what they want, dates, party size,
 * budget and a callback. It checks on the device first, adds the new person (`POST /contacts`) if needed and then the lead
 * (`POST /leads`); the owner comes from the business's sharing rule. Everything typed stays when something goes wrong.
 */
export function CreateLeadPanel({ isOpen, onClose, timeZone, onCreated }: CreateLeadPanelProps) {
  const [fields, setFields] = useState<LeadFormFields>(EMPTY_LEAD_FORM);
  const [problems, setProblems] = useState<LeadFormProblems>({});
  const [formProblem, setFormProblem] = useState<string | undefined>();
  const [searchText, setSearchText] = useState('');
  const [chosenPerson, setChosenPerson] = useState<Pick<Contact, 'id' | 'name' | 'phone' | 'email'> | null>(null);
  // A person added by this form whose lead then failed: a second try reuses them instead of adding them again
  const [addedPerson, setAddedPerson] = useState<Pick<Contact, 'id' | 'name' | 'phone' | 'email'> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const changeFields = (changes: Partial<LeadFormFields>) => setFields((current) => ({ ...current, ...changes }));
  const choosePerson = (person: Pick<Contact, 'id' | 'name' | 'phone' | 'email'> | null) => {
    setChosenPerson(person);
    changeFields({ existingContactId: person?.id ?? null });
    setProblems((current) => ({ ...current, person: undefined }));
  };

  // Sends the form: checks it, adds the new person if there is one, adds the lead, and says what went wrong in plain words.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormProblem(undefined);
    const foundProblems = checkLeadForm(fields, timeZone);
    setProblems(foundProblems);
    if (Object.keys(foundProblems).length > 0) return;
    setIsSaving(true);
    try {
      let person = fields.personMode === 'existing' ? chosenPerson : addedPerson;
      if (person === null) {
        person = await apiRequest<Contact>('POST', '/contacts', buildContactRequest(fields));
        setAddedPerson(person);
      }
      await apiRequest('POST', '/leads', buildLeadRequest(fields, person.id, timeZone));
      onCreated(findLeadDisplayName(person));
    } catch (error) {
      const code = error instanceof ApiRequestError ? error.code : '';
      if (code === 'CONTACT_EXISTS') {
        // Switch to the search, with what was typed, so the existing person can be found and used
        setSearchText(fields.newPhone.trim() || fields.newEmail.trim());
        changeFields({ personMode: 'existing' });
      }
      const knownMessage = API_ERROR_MESSAGES[code];
      setFormProblem(
        knownMessage
          ? t(knownMessage)
          : error instanceof ApiRequestError && code === 'VALIDATION_ERROR'
            ? error.message
            : t('leadForm.error.unknown'),
      );
      setIsSaving(false);
    }
  }

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t('leadForm.title')}
      closeLabel={t('leadForm.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('leadForm.cancel')}</Button>
          <Button type="submit" form={FORM_ID} variant="primary" isLoading={isSaving}>
            {t('leadForm.submit')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-6">
        {formProblem ? <Alert tone="error">{formProblem}</Alert> : null}
        <section className="flex flex-col gap-3" aria-labelledby="lead-form-person">
          <h3 id="lead-form-person" className="text-heading-sm text-text-primary">
            {t('leadForm.person.heading')}
          </h3>
          <PersonSection
            fields={fields}
            problems={problems}
            chosenPerson={chosenPerson}
            searchText={searchText}
            onSearchTextChange={setSearchText}
            onChoosePerson={choosePerson}
            onChangeFields={changeFields}
          />
        </section>
        <section className="flex flex-col gap-4" aria-labelledby="lead-form-details">
          <h3 id="lead-form-details" className="text-heading-sm text-text-primary">
            {t('leadForm.details.heading')}
          </h3>
          <TextAreaField
            label={t('leadForm.interest')}
            requirementLabel={t('leadForm.optional')}
            maxLength={1000}
            value={fields.interest}
            onChange={(event) => changeFields({ interest: event.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label={t('leadForm.dateFrom')}
              type="date"
              value={fields.dateFrom}
              onChange={(event) => changeFields({ dateFrom: event.target.value })}
            />
            <TextField
              label={t('leadForm.dateTo')}
              type="date"
              value={fields.dateTo}
              onChange={(event) => changeFields({ dateTo: event.target.value })}
              {...(problems.dateTo ? { errorMessage: t(problems.dateTo) } : {})}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label={t('leadForm.partySize')}
              inputMode="numeric"
              value={fields.partySize}
              onChange={(event) => changeFields({ partySize: event.target.value })}
              {...(problems.partySize ? { errorMessage: t(problems.partySize) } : {})}
            />
            <TextField
              label={t('leadForm.budget')}
              inputMode="decimal"
              value={fields.budget}
              onChange={(event) => changeFields({ budget: event.target.value })}
              {...(problems.budget ? { errorMessage: t(problems.budget) } : {})}
            />
          </div>
          <TextField
            label={t('leadForm.callbackAt')}
            requirementLabel={t('leadForm.optional')}
            type="datetime-local"
            value={fields.callbackAt}
            onChange={(event) => changeFields({ callbackAt: event.target.value })}
            {...(problems.callbackAt ? { errorMessage: t(problems.callbackAt) } : {})}
          />
          <p className="text-body-xs text-text-secondary">{t('leadForm.ownerNote')}</p>
        </section>
      </form>
    </SidePanel>
  );
}
