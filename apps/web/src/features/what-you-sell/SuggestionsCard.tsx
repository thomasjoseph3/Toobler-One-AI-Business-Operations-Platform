import type { SuggestedOffering } from '@toobler-one/shared';
import { Button, Card } from '@toobler-one/ui';
import { paiseToRupeesText } from '../knowledge/answer-draft';
import { formatMessage, t } from '../../app/i18n';

/** What the website reading found that looks like something the business sells. Each can be added (opens the form, filled in, for the owner to check) or dismissed. */
export function SuggestionsCard(props: {
  suggestions: readonly SuggestedOffering[];
  onAdd: (suggestion: SuggestedOffering) => void;
  onDismiss: (suggestion: SuggestedOffering) => void;
}) {
  const { suggestions, onAdd, onDismiss } = props;
  if (suggestions.length === 0) return null;
  return (
    <Card>
      <h2 className="text-heading-sm text-text-primary">{t('whatYouSell.suggestions.title')}</h2>
      <p className="text-body-md mb-2 text-text-secondary">{t('whatYouSell.suggestions.help')}</p>
      <ul>
        {suggestions.map((suggestion) => (
          <li key={suggestion.name} className="flex flex-col gap-2 border-b border-border-default py-3 last:border-b-0">
            <p className="text-label-md text-text-primary">
              {suggestion.name}
              {suggestion.fromPricePaise !== null ? (
                <span className="text-body-md ml-2 font-normal text-text-secondary">
                  {formatMessage('whatYouSell.suggestions.priceFrom', {
                    price: paiseToRupeesText(suggestion.fromPricePaise),
                  })}
                </span>
              ) : null}
            </p>
            {suggestion.description ? (
              <p className="text-body-md text-text-secondary">{suggestion.description}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="compact"
                onClick={() => onAdd(suggestion)}
                aria-label={formatMessage('whatYouSell.suggestions.add', { name: suggestion.name })}
              >
                {t('whatYouSell.suggestions.addButton')}
              </Button>
              <Button
                variant="tertiary"
                size="compact"
                onClick={() => onDismiss(suggestion)}
                aria-label={formatMessage('whatYouSell.suggestions.dismiss', { name: suggestion.name })}
              >
                {formatMessage('whatYouSell.suggestions.dismiss', { name: suggestion.name })}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
