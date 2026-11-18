// How a lead's temperature is shown: the word and the colour family for each. Pure (no screen, no network), so each rule can be tested alone.
import type { LeadTemperature } from '@toobler-one/shared';
import { t, type MessageKey } from '../../app/i18n';

/** The word for each temperature (the colour and the icon never stand alone: the word is always shown too). */
const TEMPERATURE_WORD_KEYS: Record<LeadTemperature, MessageKey> = {
  unscored: 'temperature.unscored',
  hot: 'temperature.hot',
  warm: 'temperature.warm',
  cold: 'temperature.cold',
};

/** The colour family of each temperature, from the design system's status colours (Hot = error family, Warm = warning, Cold = information). */
const TEMPERATURE_COLOUR_CLASSES: Record<LeadTemperature, string> = {
  unscored: 'bg-hover text-text-secondary',
  hot: 'bg-error-bg text-error',
  warm: 'bg-warning-bg text-warning',
  cold: 'bg-info-bg text-info',
};

/** The word for a temperature: "Hot", "Warm", "Cold" or "Not scored". */
export function findTemperatureWord(temperature: LeadTemperature): string {
  return t(TEMPERATURE_WORD_KEYS[temperature]);
}

/** The classes that colour a temperature's tag. */
export function findTemperatureColourClasses(temperature: LeadTemperature): string {
  return TEMPERATURE_COLOUR_CLASSES[temperature];
}

/** The sentence that says why a lead has its temperature, or the line that says it has not been scored yet. */
export function describeTemperatureReason(reason: string | null): string {
  return reason ?? t('temperature.noReason');
}

/** The choices a person can set by hand: hot, warm or cold (never "not scored"). */
export const SETTABLE_TEMPERATURES = ['hot', 'warm', 'cold'] as const;
