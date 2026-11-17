import type { KnowledgeQuestion } from '@toobler-one/shared';
import { Card } from '@toobler-one/ui';
import { t, type MessageKey } from '../../app/i18n';
import { QuestionRow } from './QuestionRow';
import type { QuestionGroup } from './profile-state';

/** One section of the business questions (About your business, What you sell...). Only one question is edited at a time on the whole page. */
export function ProfileSection(props: {
  group: QuestionGroup;
  canEdit: boolean;
  editingKey: string | null;
  onEdit: (questionKey: string | null) => void;
  onChanged: () => void;
}) {
  const { group, canEdit, editingKey, onEdit, onChanged } = props;
  const headingId = `section-${group.section}`;
  return (
    <Card aria-labelledby={headingId}>
      <h2 id={headingId} className="text-heading-sm mb-1 text-text-primary">
        {t(`knowledge.section.${group.section}` as MessageKey)}
      </h2>
      <ul>
        {group.questions.map((question: KnowledgeQuestion) => (
          <QuestionRow
            key={question.key}
            question={question}
            canEdit={canEdit}
            isEditing={editingKey === question.key}
            onStartEditing={() => onEdit(question.key)}
            onStopEditing={() => onEdit(null)}
            onChanged={onChanged}
          />
        ))}
      </ul>
    </Card>
  );
}
