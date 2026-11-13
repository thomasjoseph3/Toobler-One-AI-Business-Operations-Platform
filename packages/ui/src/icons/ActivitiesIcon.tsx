import { Icon, type IconProps } from './Icon';

/** Lightning bolt (Sidebar: Activities). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function ActivitiesIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 16 16" defaultWidth={16} defaultHeight={16} {...props}>
      <path
        d="M8.66667 6.66667V2L2.66667 9.33333H7.33333V14L13.3333 6.66667H8.66667V6.66667"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
