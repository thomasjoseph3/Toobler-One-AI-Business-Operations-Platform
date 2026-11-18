import { Flame, Snowflake, Sun, CircleDashed } from 'lucide-react';
import type { LeadTemperature } from '@toobler-one/shared';
import type { ReactNode } from 'react';
import { findTemperatureColourClasses, findTemperatureWord } from './temperature';

const TEMPERATURE_ICONS: Record<LeadTemperature, ReactNode> = {
  unscored: <CircleDashed aria-hidden className="size-3.5" />,
  hot: <Flame aria-hidden className="size-3.5" />,
  warm: <Sun aria-hidden className="size-3.5" />,
  cold: <Snowflake aria-hidden className="size-3.5" />,
};

/** A lead's temperature as an icon and a word on a tinted background (never colour alone). `title` carries the reason for a hover or long-press. */
export function TemperatureTag({ temperature, reason }: { temperature: LeadTemperature; reason?: string | null }) {
  return (
    <span
      title={reason ?? undefined}
      className={`text-label-xs inline-flex items-center gap-1 rounded-sm px-2 py-1 whitespace-nowrap ${findTemperatureColourClasses(temperature)}`}
    >
      {TEMPERATURE_ICONS[temperature]}
      {findTemperatureWord(temperature)}
    </span>
  );
}
