import type { ModuleState, ModuleView } from '@toobler-one/shared';
import type { MessageKey } from '../../app/i18n';

// What the Modules page needs to decide about each module. Pure: no screen, no network.

const KIND_ORDER: ReadonlyArray<ModuleView['kind']> = ['engine', 'channel', 'feature'];

/** The modules grouped by kind in a fixed order (engines, channels, features), leaving out empty groups. */
export function groupModulesByKind(modules: readonly ModuleView[]): Array<{ kind: ModuleView['kind']; modules: ModuleView[] }> {
  return KIND_ORDER.map((kind) => ({ kind, modules: modules.filter((module) => module.kind === kind) })).filter((group) => group.modules.length > 0);
}

/** What a module's state is called and how it is drawn. */
export function describeModuleState(state: ModuleState): { words: MessageKey; tone: 'success' | 'neutral' | 'warning' | 'info' } {
  switch (state) {
    case 'active':
      return { words: 'settings.modules.state.active', tone: 'success' };
    case 'off':
      return { words: 'settings.modules.state.off', tone: 'neutral' };
    case 'needs_connecting':
      return { words: 'settings.modules.state.needsConnecting', tone: 'warning' };
    default:
      return { words: 'settings.modules.state.notInPlan', tone: 'info' };
  }
}

/** The button a module offers: switch off when it is on (or waiting to be connected), switch on when it is off, nothing when it is not in the plan. */
export function describeModuleAction(state: ModuleState): 'switch_on' | 'switch_off' | null {
  if (state === 'active' || state === 'needs_connecting') return 'switch_off';
  if (state === 'off') return 'switch_on';
  return null;
}

/** The names of the modules a module needs, as written for the person, in the order given. An id with no module is shown as it is. */
export function namesOfRequirements(module: ModuleView, all: readonly ModuleView[]): string[] {
  return module.requires.map((id) => all.find((candidate) => candidate.id === id)?.name ?? id);
}
