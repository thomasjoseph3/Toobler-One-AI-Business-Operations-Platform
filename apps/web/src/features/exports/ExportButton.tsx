import { useEffect, useRef, useState } from 'react';
import type { Export, ExportObject } from '@toobler-one/shared';
import { Button, ExportIcon } from '@toobler-one/ui';
import { ApiRequestError, apiDownload, apiRequest } from '../../api/client';
import { t } from '../../app/i18n';
import { EXPORT_POLL_LIMIT, EXPORT_POLL_MILLISECONDS } from './exports-state';
import { saveDownloadedFile } from './save-file';

/** One plain sentence for a refused or failed export. Never a code or a status number. */
function describeExportProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('leads.error.network');
    if (error.status === 403) return t('leads.error.forbidden');
    if (error.status === 400 || error.status === 409 || error.status === 410) return error.message;
  }
  return t('exports.error');
}

export interface ExportButtonProps {
  /** What to export: the kind of list and the list's own address query (what the list shows). */
  request: { object: ExportObject; query: string };
}

/**
 * The Export button of a list (managers only). Pressing it asks for a CSV of exactly what the list shows; the file is built in the background, so the button says
 * "Preparing your export" and asks again every moment, then offers Download (and an email with a link has been sent). A refusal or a failed build is said in words.
 */
export function ExportButton({ request }: ExportButtonProps) {
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'preparing' }
    | { status: 'ready'; file: Export }
    | { status: 'problem'; message: string }
  >({ status: 'idle' });
  const [isDownloading, setIsDownloading] = useState(false);
  // Stops asking when the person leaves the page
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Asks for the export, then asks how it is going until it is done or failed
  async function startExport() {
    setState({ status: 'preparing' });
    try {
      let file = await apiRequest<Export>('POST', '/exports', request);
      for (
        let attempt = 0;
        attempt < EXPORT_POLL_LIMIT && file.status !== 'done' && file.status !== 'failed';
        attempt += 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, EXPORT_POLL_MILLISECONDS));
        if (!isMounted.current) return;
        file = await apiRequest<Export>('GET', `/exports/${file.id}`);
      }
      if (!isMounted.current) return;
      if (file.status === 'done') setState({ status: 'ready', file });
      else setState({ status: 'problem', message: file.error ?? t('exports.stillPreparing') });
    } catch (error) {
      if (isMounted.current) setState({ status: 'problem', message: describeExportProblem(error) });
    }
  }

  // Downloads the finished file with the person's session
  async function download(file: Export) {
    if (file.downloadPath === null) return;
    setIsDownloading(true);
    try {
      saveDownloadedFile(await apiDownload(file.downloadPath.replace(/^\/api\/v1/u, '')));
    } catch (error) {
      setState({ status: 'problem', message: describeExportProblem(error) });
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="compact"
        leadingIcon={<ExportIcon size={15} />}
        isLoading={state.status === 'preparing'}
        onClick={() => void startExport()}
      >
        {t('exports.button')}
      </Button>
      <span role="status" className="text-body-sm text-text-secondary">
        {state.status === 'preparing' ? t('exports.preparing') : null}
        {state.status === 'ready' ? t('exports.ready') : null}
      </span>
      {state.status === 'ready' && state.file.downloadPath !== null ? (
        <Button size="compact" variant="primary" isLoading={isDownloading} onClick={() => void download(state.file)}>
          {t('exports.download')}
        </Button>
      ) : null}
      {state.status === 'problem' ? (
        <span role="alert" className="text-body-sm text-error">
          {state.message}
        </span>
      ) : null}
    </div>
  );
}
