import { SegmentedControl } from '@toobler-one/ui';
import { t } from '../../app/i18n';
import type { TimelineFilter } from './notes-state';

/** The chips above a timeline: All, Notes, Stage changes. */
export function TimelineFilterChips({
  value,
  onChange,
}: {
  value: TimelineFilter;
  onChange: (filter: TimelineFilter) => void;
}) {
  return (
    <div className="mb-3">
      <SegmentedControl<TimelineFilter>
        ariaLabel={t('timeline.filterLabel')}
        value={value}
        onChange={onChange}
        options={[
          { value: 'all', label: t('timeline.filter.all') },
          { value: 'note', label: t('timeline.filter.notes') },
          { value: 'stage_changed', label: t('timeline.filter.stageChanges') },
        ]}
      />
    </div>
  );
}
