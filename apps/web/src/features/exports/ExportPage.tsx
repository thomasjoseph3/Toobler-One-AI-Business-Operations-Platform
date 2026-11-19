import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import type { Export } from '@toobler-one/shared';
import { Alert, Button, Card, EmptyState, ErrorState, ExportIcon, LoadingState } from '@toobler-one/ui';
import { ApiRequestError, apiDownload } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { formatMoment } from '../leads/lead-display';
import { saveDownloadedFile } from './save-file';

/**
 * One export (`/exports/<id>`, where the email's link opens): what it is, how many rows, when it stops being available, and Download. Managers only.
 * It says plainly when the export is still being built, has failed, has expired (24 hours) or does not exist.
 */
export function ExportPage() {
  const { exportId = '' } = useParams();
  const { sessionState } = useSession();
  const resource = useApiResource<Export>(`/exports/${exportId}`);
  const [isDownloading, setIsDownloading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const timeZone = sessionState.status === 'signedIn' ? sessionState.profile.business.timeZone : 'UTC';

  const backLink = (
    <Link
      to="/contacts"
      className="text-body-md-semibold mb-4 inline-flex items-center gap-1 text-link hover:text-link-hover"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {t('exports.page.back')}
    </Link>
  );

  async function download(toDownload: Export) {
    if (toDownload.downloadPath === null) return;
    setProblem(null);
    setIsDownloading(true);
    try {
      saveDownloadedFile(await apiDownload(toDownload.downloadPath.replace(/^\/api\/v1/u, '')));
    } catch (error) {
      setProblem(error instanceof ApiRequestError && error.status !== 0 ? error.message : t('exports.error'));
    } finally {
      setIsDownloading(false);
    }
  }

  if (resource.state.status === 'loading') {
    return (
      <>
        {backLink}
        <Card>
          <LoadingState label={t('exports.page.loading')} rows={3} />
        </Card>
      </>
    );
  }
  if (resource.state.status === 'error') {
    const isMissing = resource.state.httpStatus === 404 || resource.state.httpStatus === 403;
    return (
      <>
        {backLink}
        <Card>
          {isMissing ? (
            <EmptyState
              icon={<ExportIcon size={24} />}
              title={t('exports.page.missing.title')}
              description={t('exports.page.missing.description')}
            />
          ) : (
            <ErrorState
              title={t('exports.page.loadError.title')}
              description={t('exports.page.loadError.description')}
              action={<Button onClick={resource.reload}>{t('session.retry')}</Button>}
            />
          )}
        </Card>
      </>
    );
  }

  const file = resource.state.data;
  const expired = file.status === 'done' && file.downloadPath === null;
  return (
    <>
      {backLink}
      <h2 className="text-heading-lg text-text-primary">{t('exports.page.heading')}</h2>
      <Card className="mt-4 flex flex-col gap-3">
        {problem ? <Alert tone="error">{problem}</Alert> : null}
        {file.status === 'queued' || file.status === 'running' ? (
          <>
            <p className="text-body-md text-text-primary">{t('exports.preparing')}</p>
            <div>
              <Button size="compact" onClick={resource.reload}>
                {t('exports.page.refresh')}
              </Button>
            </div>
          </>
        ) : null}
        {file.status === 'failed' ? <Alert tone="error">{file.error ?? t('exports.error')}</Alert> : null}
        {expired ? <Alert tone="error">{t('exports.page.expired')}</Alert> : null}
        {file.status === 'done' && file.downloadPath !== null ? (
          <>
            <dl className="flex flex-col gap-1">
              <div>
                <dt className="text-label-sm text-text-secondary">{t('exports.page.file')}</dt>
                <dd className="text-body-md text-text-primary [overflow-wrap:anywhere]">{file.fileName}</dd>
              </div>
              <div>
                <dt className="text-label-sm text-text-secondary">{t('exports.page.rows')}</dt>
                <dd className="text-body-md text-text-primary">{file.rowCount}</dd>
              </div>
              <div>
                <dt className="text-label-sm text-text-secondary">{t('exports.page.until')}</dt>
                <dd className="text-body-md text-text-primary">{formatMoment(file.expiresAt, timeZone)}</dd>
              </div>
            </dl>
            <div>
              <Button variant="primary" isLoading={isDownloading} onClick={() => void download(file)}>
                {formatMessage('exports.page.download', { name: file.fileName ?? '' })}
              </Button>
            </div>
          </>
        ) : null}
      </Card>
    </>
  );
}
