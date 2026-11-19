import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import type { FieldsListResponse, Import } from '@toobler-one/shared';
import { Alert, Button, Card, SelectField } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import {
  describeImportCounts,
  describeReportRow,
  findProgressPercent,
  IMPORT_FILE_ACCEPT,
  IMPORT_POLL_MILLISECONDS,
  listTargetChoices,
  sameTargets,
} from './import-state';

/** One plain sentence for a refused or failed step. Never a code or a status number. */
function describeImportProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('leads.error.network');
    if (error.status === 403) return t('leads.error.forbidden');
    if (error.status === 404) return t('import.error.gone');
    if (error.status === 400 || error.status === 409 || error.status === 413) return error.message;
  }
  return t('import.error.unknown');
}

/**
 * Import contacts from a spreadsheet (`/contacts/import`, managers only). Step 1: choose a CSV or Excel file. Step 2: check which column is which (guessed from
 * the column names) and see how many contacts would be new, would match people already there (updated, never duplicated) or would be skipped. Step 3: Import, watch
 * the progress, and read the report of skipped rows. Nothing is imported until the person presses Import.
 */
export function ImportPage() {
  const { sessionState } = useSession();
  const isManager = sessionState.status === 'signedIn' && sessionState.profile.user.role === 'manager';
  const [file, setFile] = useState<File | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [imported, setImported] = useState<Import | null>(null);
  // What the person has chosen for each column, and what was last checked against the API
  const [targets, setTargets] = useState<Array<string | null>>([]);
  const [checkedTargets, setCheckedTargets] = useState<Array<string | null> | null>(null);
  const [choices, setChoices] = useState(() => listTargetChoices([]));
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // The business's own contact fields are choices for a column
  useEffect(() => {
    if (!isManager) return;
    apiRequest<FieldsListResponse>('GET', '/fields?object=contact')
      .then((response) => {
        if (isMounted.current) setChoices(listTargetChoices(response.items));
      })
      .catch(() => undefined);
  }, [isManager]);

  // Asks how a running import is going, until it is done or failed
  useEffect(() => {
    if (imported?.status !== 'running') return;
    const timer = setTimeout(() => {
      apiRequest<Import>('GET', `/imports/${imported.id}`)
        .then((latest) => {
          if (isMounted.current) setImported(latest);
        })
        .catch((error: unknown) => {
          if (isMounted.current) setProblem(describeImportProblem(error));
        });
    }, IMPORT_POLL_MILLISECONDS);
    return () => clearTimeout(timer);
  }, [imported]);

  const backLink = (
    <Link
      to="/contacts"
      className="text-body-md-semibold mb-4 inline-flex items-center gap-1 text-link hover:text-link-hover"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {t('import.back')}
    </Link>
  );

  if (!isManager) {
    return (
      <>
        {backLink}
        <Alert tone="error">{t('import.managersOnly')}</Alert>
      </>
    );
  }

  // Sends the file; the answer has the preview and the guessed columns
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (file === null) {
      setProblem(t('import.chooseFile'));
      return;
    }
    setProblem(null);
    setIsBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const created = await apiRequest<Import>('POST', '/imports', form);
      setImported(created);
      setTargets(created.targets);
      setCheckedTargets(null);
    } catch (error) {
      setProblem(describeImportProblem(error));
    } finally {
      setIsBusy(false);
    }
  }

  // Sends the chosen columns; the answer has the counts
  async function checkColumns() {
    if (imported === null) return;
    setProblem(null);
    setIsBusy(true);
    try {
      const checked = await apiRequest<Import>('PATCH', `/imports/${imported.id}`, { targets });
      setImported(checked);
      setCheckedTargets(checked.targets);
    } catch (error) {
      setProblem(describeImportProblem(error));
    } finally {
      setIsBusy(false);
    }
  }

  // Starts the import after the columns were checked
  async function runImport() {
    if (imported === null) return;
    setProblem(null);
    setIsBusy(true);
    try {
      setImported(await apiRequest<Import>('POST', `/imports/${imported.id}/run`));
    } catch (error) {
      setProblem(describeImportProblem(error));
    } finally {
      setIsBusy(false);
    }
  }

  const canRun =
    imported !== null && imported.status === 'ready' && checkedTargets !== null && sameTargets(targets, checkedTargets);
  const isFinished = imported?.status === 'done';

  return (
    <>
      {backLink}
      <h2 className="text-heading-lg text-text-primary">{t('import.heading')}</h2>
      <p className="text-body-md mb-4 text-text-secondary">{t('import.description')}</p>
      {problem ? (
        <Alert tone="error" className="mb-4">
          {problem}
        </Alert>
      ) : null}

      {imported === null ? (
        <Card>
          <form onSubmit={(event) => void upload(event)} className="flex flex-col gap-3">
            <h3 className="text-heading-md text-text-primary">{t('import.step1')}</h3>
            <label className="flex flex-col gap-1">
              <span className="text-label-sm text-text-primary">{t('import.file.label')}</span>
              <input
                type="file"
                accept={IMPORT_FILE_ACCEPT}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="text-body-md text-text-primary"
              />
              <span className="text-body-xs text-text-secondary">{t('import.file.hint')}</span>
            </label>
            <div>
              <Button type="submit" variant="primary" isLoading={isBusy}>
                {t('import.upload')}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {imported !== null && !isFinished && imported.status !== 'running' && imported.status !== 'failed' ? (
        <Card className="flex flex-col gap-4">
          <h3 className="text-heading-md text-text-primary">{t('import.step2')}</h3>
          <p className="text-body-md text-text-secondary">
            {formatMessage('import.fileSummary', {
              name: imported.fileName,
              rows: imported.rowCount.toLocaleString('en'),
            })}
          </p>
          <div className="flex flex-col gap-3">
            {imported.headers.map((header, column) => (
              <div
                key={column}
                className="flex flex-col gap-2 rounded-md border border-border-subtle p-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-body-md-semibold text-text-primary [overflow-wrap:anywhere]">{header}</p>
                  <p className="text-body-sm text-text-secondary [overflow-wrap:anywhere]">
                    {imported.sample
                      .slice(0, 3)
                      .map((row) => row[column])
                      .filter((cell) => cell !== undefined && cell !== '')
                      .join(' · ') || t('import.noExamples')}
                  </p>
                </div>
                <SelectField
                  className="md:w-64"
                  label={formatMessage('import.column.label', { name: header })}
                  value={targets[column] ?? ''}
                  options={choices}
                  onChange={(event) =>
                    setTargets((current) =>
                      current.map((target, position) => (position === column ? event.target.value || null : target)),
                    )
                  }
                />
              </div>
            ))}
          </div>
          <div>
            <Button isLoading={isBusy} onClick={() => void checkColumns()}>
              {t('import.check')}
            </Button>
          </div>
          {imported.status === 'ready' &&
          imported.counts !== null &&
          checkedTargets !== null &&
          sameTargets(targets, checkedTargets) ? (
            <Alert tone="success">{describeImportCounts(imported.counts, false)}</Alert>
          ) : null}
          {imported.status === 'ready' && imported.report.length > 0 && canRun ? (
            <details className="text-body-sm text-text-secondary">
              <summary className="cursor-pointer text-text-primary">{t('import.report.preview')}</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {imported.report.slice(0, 20).map((entry) => (
                  <li key={entry.row}>{describeReportRow(entry.row, entry.message)}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <div>
            <Button variant="primary" disabled={!canRun} isLoading={isBusy} onClick={() => void runImport()}>
              {t('import.run')}
            </Button>
            {!canRun ? <p className="text-body-xs mt-1 text-text-secondary">{t('import.run.hint')}</p> : null}
          </div>
        </Card>
      ) : null}

      {imported?.status === 'running' ? (
        <Card className="flex flex-col gap-3">
          <h3 className="text-heading-md text-text-primary">{t('import.running')}</h3>
          <div
            role="progressbar"
            aria-label={t('import.running')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={findProgressPercent(imported.processed, imported.rowCount)}
            className="h-3 w-full overflow-hidden rounded-full bg-surface-subtle"
          >
            <div
              className="h-full bg-action"
              style={{ width: `${findProgressPercent(imported.processed, imported.rowCount)}%` }}
            />
          </div>
          <p className="text-body-md text-text-secondary">
            {formatMessage('import.progress', {
              done: imported.processed.toLocaleString('en'),
              total: imported.rowCount.toLocaleString('en'),
            })}
          </p>
        </Card>
      ) : null}

      {imported?.status === 'failed' ? <Alert tone="error">{imported.error ?? t('import.error.unknown')}</Alert> : null}

      {isFinished && imported.counts !== null ? (
        <Card className="flex flex-col gap-3">
          <h3 className="text-heading-md text-text-primary">{t('import.done')}</h3>
          <Alert tone="success">{describeImportCounts(imported.counts, true)}</Alert>
          {imported.report.length > 0 ? (
            <>
              <h4 className="text-body-md-semibold text-text-primary">{t('import.report.heading')}</h4>
              <ul className="text-body-sm flex flex-col gap-1 text-text-secondary">
                {imported.report.map((entry) => (
                  <li key={entry.row}>{describeReportRow(entry.row, entry.message)}</li>
                ))}
              </ul>
              {imported.counts.skipped > imported.report.length ? (
                <p className="text-body-sm text-text-secondary">
                  {formatMessage('import.report.more', {
                    count: (imported.counts.skipped - imported.report.length).toLocaleString('en'),
                  })}
                </p>
              ) : null}
            </>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Link to="/contacts" className="text-body-md-semibold text-link hover:text-link-hover hover:underline">
              {t('import.goToContacts')}
            </Link>
          </div>
        </Card>
      ) : null}
    </>
  );
}
