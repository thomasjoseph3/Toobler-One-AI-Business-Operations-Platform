import { Checkbox, TextField } from '@toobler-one/ui';
import { t, type MessageKey } from '../../app/i18n';
import { DAYS_OF_THE_WEEK, type AnswerDraft } from './answer-draft';

type HoursDraft = Extract<AnswerDraft, { kind: 'weekly_hours' }>;

/** The opening hours of the week: "open all day", or for each day a tick and the opening and closing times. */
export function HoursEditor({ draft, onChange }: { draft: HoursDraft; onChange: (draft: HoursDraft) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Checkbox
        label={t('knowledge.editor.allDay')}
        checked={draft.isOpenAllDay}
        onChange={(event) => onChange({ ...draft, isOpenAllDay: event.target.checked })}
      />
      {draft.isOpenAllDay ? null : (
        <ul className="flex flex-col gap-3">
          {DAYS_OF_THE_WEEK.map((day) => {
            const hours = draft.days[day];
            const dayName = t(`knowledge.editor.day.${day}` as MessageKey);
            const changeDay = (changes: Partial<typeof hours>) =>
              onChange({ ...draft, days: { ...draft.days, [day]: { ...hours, ...changes } } });
            return (
              <li key={day} className="flex flex-col gap-2">
                <div>
                  <Checkbox
                    label={dayName}
                    checked={hours.isOpen}
                    onChange={(event) => changeDay({ isOpen: event.target.checked })}
                  />
                </div>
                {hours.isOpen ? (
                  <div className="grid max-w-sm grid-cols-2 gap-3 pl-8">
                    <TextField
                      label={`${dayName}: ${t('knowledge.editor.from')}`}
                      type="time"
                      value={hours.from}
                      onChange={(event) => changeDay({ from: event.target.value })}
                    />
                    <TextField
                      label={`${dayName}: ${t('knowledge.editor.to')}`}
                      type="time"
                      value={hours.to}
                      onChange={(event) => changeDay({ to: event.target.value })}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
