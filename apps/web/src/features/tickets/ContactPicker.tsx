import { useState } from 'react';
import type { Contact } from '@toobler-one/shared';
import { Button, TextField } from '@toobler-one/ui';
import { t } from '../../app/i18n';
import { findLeadDisplayName } from '../leads/lead-display';
import { useContactSearch } from '../leads/useContactSearch';

type PickedPerson = Pick<Contact, 'id' | 'name' | 'phone' | 'email'>;

/**
 * Chooses the person a ticket is about: type a name, phone or email, pick one from what is found (`GET /contacts?q=`), and the
 * chosen person shows with a Change button. It says what it is doing: searching, nothing found, or could not search.
 */
export function ContactPicker(props: {
  chosenPerson: PickedPerson | null;
  onChoose: (person: PickedPerson | null) => void;
  /** The words to show under the box when no person was chosen. */
  errorMessage?: string | undefined;
}) {
  const { chosenPerson, onChoose, errorMessage } = props;
  const [searchText, setSearchText] = useState('');
  const search = useContactSearch(chosenPerson === null ? searchText : '');

  if (chosenPerson !== null) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-border-default bg-surface-subtle p-3">
        <p className="text-body-md min-w-0 text-text-primary">
          <span className="text-text-secondary">{t('tickets.form.chosenPerson')} </span>
          <span className="text-body-md-semibold">{findLeadDisplayName(chosenPerson)}</span>
        </p>
        <Button size="compact" onClick={() => onChoose(null)}>
          {t('tickets.form.changePerson')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label={t('tickets.form.person')}
        type="search"
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        autoComplete="off"
        helperText={t('tickets.form.personHint')}
        {...(errorMessage ? { errorMessage } : {})}
      />
      {search.status === 'searching' ? <p role="status" className="text-body-sm text-text-secondary">{t('tickets.form.searching')}</p> : null}
      {search.status === 'error' ? <p role="alert" className="text-body-sm text-error">{t('tickets.form.searchFailed')}</p> : null}
      {search.status === 'found' && search.people.length === 0 ? <p className="text-body-sm text-text-secondary">{t('tickets.form.noPerson')}</p> : null}
      {search.status === 'found' && search.people.length > 0 ? (
        <ul className="flex flex-col overflow-hidden rounded-md border border-border-default">
          {search.people.map((person) => (
            <li key={person.id} className="border-t border-border-subtle first:border-t-0">
              <button type="button" onClick={() => onChoose(person)} className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-hover">
                <span className="text-body-md text-text-primary">{findLeadDisplayName(person)}</span>
                <span className="text-body-xs text-text-secondary">
                  {[person.phone, person.email].filter((value) => value && value !== findLeadDisplayName(person)).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
