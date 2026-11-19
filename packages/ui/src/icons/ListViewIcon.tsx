import { Icon, type IconProps } from './Icon';

/** Bulleted list (Toolbar: List view). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function ListViewIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 12 12" defaultWidth={12} defaultHeight={12} {...props}>
      <path d="M4.99804 2.5H10.498" strokeWidth="1.5" strokeLinecap="round" stroke="currentColor" />
      <path d="M1.49804 2.5H2.74804" strokeWidth="1.5" strokeLinecap="round" stroke="currentColor" />
      <path d="M4.99804 6H10.498" strokeWidth="1.5" strokeLinecap="round" stroke="currentColor" />
      <path d="M1.49804 6H2.74804" strokeWidth="1.5" strokeLinecap="round" stroke="currentColor" />
      <path d="M4.99804 9.5H10.498" strokeWidth="1.5" strokeLinecap="round" stroke="currentColor" />
      <path d="M1.49804 9.5H2.74804" strokeWidth="1.5" strokeLinecap="round" stroke="currentColor" />
    </Icon>
  );
}
