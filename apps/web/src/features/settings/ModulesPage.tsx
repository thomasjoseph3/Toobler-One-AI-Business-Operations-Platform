import { useState } from 'react';
import type { ModuleView, ModulesResponse } from '@toobler-one/shared';
import { Alert, Badge, Button, Card, ConfirmDialog, ErrorState, LoadingState } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t, type MessageKey } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { useKeptData } from '../knowledge/use-kept-resource';
import { describeModuleAction, describeModuleState, groupModulesByKind, namesOfRequirements } from './modules-state';
import { describeSettingsProblem } from './problem-message';
import { SettingsTabs } from './SettingsTabs';

/**
 * Settings → Modules: every part of Toobler One with its state for this business (on, switched off, needs connecting, not in your plan). A
 * manager switches a part on or off (switching off asks first and says the data is kept). The API refuses a switch that would break another part
 * (a module another needs); its words are shown as they are. Staff read. Loading and error states; keeps what is on screen while it reloads.
 */
export function ModulesPage() {
  const { sessionState } = useSession();
  const resource = useApiResource<ModulesResponse>('/modules');
  const data = useKeptData(resource.state);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toSwitchOff, setToSwitchOff] = useState<ModuleView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // The guard around the app only shows this page to someone who is signed in; this keeps the types honest
  if (sessionState.status !== 'signedIn') return null;
  const canEdit = sessionState.profile.user.role === 'manager';

  const change = async (module: ModuleView, enabled: boolean) => {
    setBusyId(module.id);
    setProblem(null);
    try {
      await apiRequest('PATCH', `/modules/${module.id}`, { enabled });
      resource.reload();
    } catch (error) {
      setProblem(describeSettingsProblem(error));
    } finally {
      setBusyId(null);
      setToSwitchOff(null);
    }
  };

  if (data.isFirstLoad) return <LoadingState label={t('settings.loading')} />;
  if (data.hasFailed || data.data === null) {
    return (
      <Card>
        <ErrorState title={t('settings.error.title')} description={t('knowledge.error.description')} action={<Button variant="secondary" onClick={resource.reload}>{t('knowledge.retry')}</Button>} />
      </Card>
    );
  }
  const modules = data.data.items;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <SettingsTabs />
      <p className="text-body-md text-text-secondary">{t('settings.modules.intro')}</p>
      {canEdit ? null : <p className="text-body-md text-text-secondary">{t('settings.managersOnly')}</p>}
      {problem ? <Alert tone="error">{problem}</Alert> : null}
      {modules.length === 0 ? <p className="text-body-md text-text-secondary">{t('settings.modules.empty')}</p> : null}
      {groupModulesByKind(modules).map((group) => (
        <Card key={group.kind} aria-labelledby={`modules-${group.kind}`}>
          <h2 id={`modules-${group.kind}`} className="text-heading-sm mb-1 text-text-primary">{t(`settings.modules.kind.${group.kind}` as MessageKey)}</h2>
          <ul>
            {group.modules.map((module) => {
              const state = describeModuleState(module.state);
              const action = describeModuleAction(module.state);
              const needs = namesOfRequirements(module, modules);
              return (
                <li key={module.id} className="flex flex-col gap-2 border-b border-border-default py-4 last:border-b-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-label-md text-text-primary">{module.name}</h3>
                    <Badge tone={state.tone}>{t(state.words)}</Badge>
                  </div>
                  <p className="text-body-md text-text-secondary">{module.description}</p>
                  {needs.length > 0 ? <p className="text-label-sm text-text-secondary">{formatMessage('settings.modules.needs', { names: needs.join(', ') })}</p> : null}
                  {module.state === 'not_in_plan' ? <p className="text-label-sm text-text-secondary">{t('settings.modules.notInPlanHelp')}</p> : null}
                  {canEdit && action ? (
                    <div>
                      <Button
                        variant={action === 'switch_on' ? 'primary' : 'secondary'}
                        size="compact"
                        isLoading={busyId === module.id}
                        onClick={() => (action === 'switch_on' ? void change(module, true) : setToSwitchOff(module))}
                        aria-label={formatMessage(action === 'switch_on' ? 'settings.modules.switchOnLabel' : 'settings.modules.switchOffLabel', { name: module.name })}
                      >
                        {t(action === 'switch_on' ? 'settings.modules.switchOn' : 'settings.modules.switchOff')}
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
      <ConfirmDialog
        isOpen={toSwitchOff !== null}
        title={toSwitchOff ? formatMessage('settings.modules.offTitle', { name: toSwitchOff.name }) : ''}
        description={t('settings.modules.offDescription')}
        confirmLabel={t('settings.modules.offConfirm')}
        cancelLabel={t('settings.modules.cancel')}
        closeLabel={t('settings.modules.close')}
        tone="danger"
        isConfirming={toSwitchOff !== null && busyId === toSwitchOff.id}
        onConfirm={() => (toSwitchOff ? void change(toSwitchOff, false) : undefined)}
        onCancel={() => setToSwitchOff(null)}
      />
    </div>
  );
}
