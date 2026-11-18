import { Link } from 'react-router';
import { Button, buttonClasses, PlusIcon, SelectField, TextField } from '@toobler-one/ui';
import { t } from '../../app/i18n';
import { useFieldDefinitions } from '../fields/use-field-definitions';
import { ConditionsEditor } from '../shared/ConditionsEditor';
import { listFilterableCustomFields } from '../shared/filter-conditions-ui';
import { ExportButton } from '../exports/ExportButton';
import { buildContactsExportRequest } from '../exports/exports-state';
import { ListFilterPopover } from '../shared/ListFilterPopover';
import { countActiveContactFilters, LIFECYCLE_CHOICES, readContactsView, type ContactsView } from './contacts-view';

export interface ContactsToolbarProps {
  view: ContactsView;
  /** What is typed in the search box right now (it reaches the view a moment after the typing stops). */
  typedSearch: string;
  onTypedSearchChange: (text: string) => void;
  /** Changes part of the view. Any change other than the page starts again at page 1. */
  onChangeView: (changes: Partial<ContactsView>) => void;
  onClearFilters: () => void;
  /** Opens the Add contact form. */
  onAddContact: () => void;
  /** Opens the box that saves the contacts matching the list on screen as a fixed list. */
  onSaveAsList: () => void;
  /** True for a manager: only managers import and export. */
  isManager: boolean;
}

/**
 * The row of controls above the contacts, laid out like the Leads toolbar: the search box and Filter on the left, Add contact on
 * the right, all the same compact size. The Filter panel holds the stage filter and a Clear filters button.
 */
export function ContactsToolbar({
  view,
  typedSearch,
  onTypedSearchChange,
  onChangeView,
  onClearFilters,
  onAddContact,
  onSaveAsList,
  isManager,
}: ContactsToolbarProps) {
  const activeFilterCount = countActiveContactFilters(view);
  const filterableFields = listFilterableCustomFields(useFieldDefinitions('contact'));
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full min-w-0 md:w-72">
          <TextField
            label={t('contacts.search')}
            type="search"
            size="compact"
            isLabelHidden
            value={typedSearch}
            onChange={(event) => onTypedSearchChange(event.target.value)}
            autoComplete="off"
            placeholder={t('contacts.search')}
          />
        </div>
        <ListFilterPopover panelLabel={t('contacts.filter.title')} activeFilterCount={activeFilterCount}>
          <SelectField
            label={t('contacts.filter.stage')}
            value={view.lifecycleStage}
            onChange={(event) =>
              onChangeView({
                lifecycleStage: readContactsView(new URLSearchParams({ stage: event.target.value })).lifecycleStage,
              })
            }
            options={[
              { value: 'all', label: t('contacts.filter.allStages') },
              ...LIFECYCLE_CHOICES.map((choice) => ({ value: choice.stage, label: t(choice.labelKey) })),
            ]}
          />
          {/* Only when the business has fields of its own to filter on; keyed so the rows start again from what is applied */}
          {filterableFields.length > 0 ? (
            <ConditionsEditor
              key={JSON.stringify(view.conditions)}
              fields={filterableFields}
              applied={view.conditions}
              onApply={(conditions) => onChangeView({ conditions })}
            />
          ) : null}
          <Button variant="tertiary" size="compact" disabled={activeFilterCount === 0} onClick={onClearFilters}>
            {t('leads.filter.clear')}
          </Button>
        </ListFilterPopover>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isManager ? (
          <>
            <Link to="/contacts/import" className={buttonClasses('secondary', 'compact')}>
              {t('import.link')}
            </Link>
            <ExportButton request={buildContactsExportRequest(view)} />
          </>
        ) : null}
        <Link to="/contacts/lists" className={buttonClasses('secondary', 'compact')}>
          {t('lists.link')}
        </Link>
        <Button size="compact" onClick={onSaveAsList}>
          {t('lists.saveAsList')}
        </Button>
        <Button variant="primary" size="compact" leadingIcon={<PlusIcon size={16} />} onClick={onAddContact}>
          {t('contacts.add')}
        </Button>
      </div>
    </div>
  );
}
