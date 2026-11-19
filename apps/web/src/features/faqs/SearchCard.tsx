import { useState, type FormEvent } from 'react';
import type { SearchResponse } from '@toobler-one/shared';
import { Alert, Button, Card, TextField } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { t } from '../../app/i18n';
import { describeFaqProblem } from './problem-message';

/** "See what the AI would find": type a customer question and see which FAQs the AI's search would use for it, best first. */
export function SearchCard() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (text.trim() === '') return;
    setIsSearching(true);
    setProblem(null);
    try {
      setResult(await apiRequest<SearchResponse>('GET', `/knowledge/search?q=${encodeURIComponent(text.trim())}`));
    } catch (error) {
      setProblem(describeFaqProblem(error));
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <Card>
      <h2 className="text-heading-sm text-text-primary">{t('faqs.search.title')}</h2>
      <p className="text-body-md mb-3 text-text-secondary">{t('faqs.search.description')}</p>
      <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <TextField
          label={t('faqs.search.label')}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="sm:flex-1"
        />
        <Button type="submit" variant="secondary" isLoading={isSearching} disabled={text.trim() === ''}>
          {t('faqs.search.button')}
        </Button>
      </form>
      <div aria-live="polite" className="mt-3 flex flex-col gap-2">
        {problem ? <Alert tone="error">{problem}</Alert> : null}
        {result && result.items.length === 0 ? (
          <p className="text-body-md text-text-secondary">{t('faqs.search.none')}</p>
        ) : null}
        {result && result.items.length > 0 ? (
          <>
            <p className="text-label-md text-text-primary">{t('faqs.search.found')}</p>
            <ul className="flex flex-col gap-2">
              {result.items.map((item) => (
                <li key={item.sourceId} className="rounded-md bg-surface-subtle p-3">
                  <p className="text-label-md text-text-primary">{item.question}</p>
                  <p className="text-body-md whitespace-pre-line text-text-secondary">{item.answer}</p>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </Card>
  );
}
