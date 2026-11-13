import { Icon, type IconProps } from './Icon';

/** Bell (Top bar: notifications). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function BellIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 20 20" defaultWidth={20} defaultHeight={20} {...props}>
      <path
        d="M8.33333 17.5H11.6667M4.16667 7.5C4.16667 5.9529 4.78125 4.46917 5.87521 3.37521C6.96917 2.28125 8.4529 1.66667 10 1.66667C11.5471 1.66667 13.0308 2.28125 14.1248 3.37521C15.2188 4.46917 15.8333 5.9529 15.8333 7.5V12.5L17.5 15H2.5L4.16667 12.5V7.5Z"
        strokeWidth="1.41667"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
