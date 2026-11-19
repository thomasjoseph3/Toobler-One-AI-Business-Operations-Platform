import { useEffect, useState, type FormEvent } from 'react';
import type { PrefillRun } from '@toobler-one/shared';
import { Alert, Button, Card, TextField } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import { Link } from 'react-router';
import { paiseToRupeesText } from './answer-draft';
import { rememberReading } from './last-reading';
import { describeSaveProblem } from './problem-message';
import { describeReading, nextReadingCheckDelayMilliseconds } from './profile-state';

/**
 * Asks the API how a reading is going (`GET /knowledge/prefill/{id}`) until it is finished, quickly at first and then more slowly. Calls
 * `onFinished` once when it has finished, and stops if the screen goes away.
 */
function useReadingRun(runId: string | null, onFinished: () => void) {
  const [run, setRun] = useState<PrefillRun | null>(null);
  useEffect(() => {
    if (runId === null) return undefined;
    let isCancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async (checksMade: number) => {
      try {
        const latest = await apiRequest<PrefillRun>('GET', `/knowledge/prefill/${runId}`);
        if (isCancelled) return;
        setRun(latest);
        if (latest.status === 'done' || latest.status === 'failed') {
          onFinished();
          return;
        }
      } catch {
        // A single missed check is not worth showing: try again at the next one
      }
      const delay = nextReadingCheckDelayMilliseconds(checksMade);
      if (delay !== null && !isCancelled) timer = setTimeout(() => void check(checksMade + 1), delay);
    };
    void check(0);
    return () => {
      isCancelled = true;
      if (timer) clearTimeout(timer);
    };
    // onFinished is the page's reload; it is meant to run once per reading, so it is not a reason to start again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);
  return run;
}

/** "Fill this in from your website": the address box, the progress while it reads, what it found, and the things the site seems to sell. */
export function ReadWebsiteCard({ businessId, onFinished }: { businessId: string; onFinished: () => void }) {
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const run = useReadingRun(runId, onFinished);
  const reading = run ? describeReading(run) : runId ? ({ kind: 'working' } as const) : null;

  const start = async (event: FormEvent) => {
    event.preventDefault();
    if (websiteUrl.trim().length < 3) {
      setProblem(t('knowledge.reading.enterWebsite'));
      return;
    }
    setIsStarting(true);
    setProblem(null);
    try {
      const started = await apiRequest<PrefillRun>('POST', '/knowledge/prefill', { websiteUrl: websiteUrl.trim() });
      setRunId(started.id);
      rememberReading(businessId, started.id); // so What you sell can offer what this reading finds
    } catch (error) {
      setProblem(describeSaveProblem(error));
    } finally {
      setIsStarting(false);
    }
  };

  const isWorking = reading?.kind === 'working';
  return (
    <Card>
      <h2 className="text-heading-sm text-text-primary">{t('knowledge.reading.title')}</h2>
      <p className="text-body-md mb-4 text-text-secondary">{t('knowledge.reading.description')}</p>
      <form onSubmit={start} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <TextField
          label={t('knowledge.reading.websiteLabel')}
          helperText={t('knowledge.reading.websiteHelper')}
          value={websiteUrl}
          onChange={(event) => setWebsiteUrl(event.target.value)}
          inputMode="url"
          autoComplete="url"
          disabled={isWorking}
          className="sm:flex-1"
        />
        <Button type="submit" variant="primary" isLoading={isStarting || isWorking} disabled={isWorking}>
          {t('knowledge.reading.start')}
        </Button>
      </form>

      <div aria-live="polite" className="mt-4 flex flex-col gap-3">
        {problem ? <Alert tone="error">{problem}</Alert> : null}
        {reading?.kind === 'working' ? (
          <p className="text-body-md text-text-secondary">{t('knowledge.reading.working')}</p>
        ) : null}
        {reading?.kind === 'failed' ? (
          <Alert tone="error">{formatMessage('knowledge.reading.failed', { message: reading.message })}</Alert>
        ) : null}
        {reading?.kind === 'done' ? (
          <div className="flex flex-col gap-2">
            <Alert tone="success">
              {reading.answersFound === 0
                ? t('knowledge.reading.doneNone')
                : reading.pagesRead === 1
                  ? formatMessage('knowledge.reading.doneOne', { found: reading.answersFound })
                  : formatMessage('knowledge.reading.done', { pages: reading.pagesRead, found: reading.answersFound })}
            </Alert>
            {reading.answersSkipped > 0 ? (
              <p className="text-body-md text-text-secondary">
                {formatMessage('knowledge.reading.skipped', { count: reading.answersSkipped })}
              </p>
            ) : null}
            {reading.warning ? (
              <Alert tone="error">{formatMessage('knowledge.reading.warning', { message: reading.warning })}</Alert>
            ) : null}
          </div>
        ) : null}
        {run && run.suggestedOfferings.length > 0 ? (
          <div>
            <h3 className="text-label-md text-text-primary">{t('knowledge.reading.suggestionsTitle')}</h3>
            <ul className="text-body-md mt-1 flex flex-col gap-1 text-text-secondary">
              {run.suggestedOfferings.map((offering) => (
                <li key={offering.name}>
                  {offering.name}
                  {offering.fromPricePaise !== null
                    ? ` · ${formatMessage('knowledge.reading.priceFrom', { price: paiseToRupeesText(offering.fromPricePaise) })}`
                    : ''}
                </li>
              ))}
            </ul>
            <p className="text-label-sm mt-1 text-text-secondary">
              {t('knowledge.reading.suggestionsHelp')}{' '}
              <Link
                to="/knowledge/what-you-sell"
                className="text-link underline underline-offset-2 hover:text-link-hover"
              >
                {t('knowledge.reading.suggestionsLink')}
              </Link>
            </p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
