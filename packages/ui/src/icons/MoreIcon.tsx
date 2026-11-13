import { Icon, type IconProps } from './Icon';

/**
 * Three dots in a row (row actions, the user card). This is the one icon NOT drawn exactly as in the Figma frame: the designer's file
 * draws each dot as a tiny outlined ring at fractional positions, which smears into a faint blur on a normal screen. These are
 * three filled dots on whole pixels, the same size and place, so they stay sharp. The colour comes from the surrounding text colour.
 */
export function MoreIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 20 20" defaultWidth={20} defaultHeight={20} {...props}>
      <circle cx="5.5" cy="10.5" r="1.5" fill="currentColor" />
      <circle cx="10.5" cy="10.5" r="1.5" fill="currentColor" />
      <circle cx="15.5" cy="10.5" r="1.5" fill="currentColor" />
    </Icon>
  );
}
