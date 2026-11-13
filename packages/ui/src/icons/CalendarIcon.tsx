import { Icon, type IconProps } from './Icon';

/** Calendar with a dot (Table: next activity date). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function CalendarIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 14 14" defaultWidth={14} defaultHeight={14} {...props}>
      <path
        d="M9.33333 1.16667V3.5M4.66667 1.16667V3.5"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M7.58333 2.33333H6.41667C4.21678 2.33333 3.11684 2.33333 2.43342 3.01675C1.75 3.70017 1.75 4.80011 1.75 7V8.16667C1.75 10.3665 1.75 11.4665 2.43342 12.1499C3.11684 12.8333 4.21678 12.8333 6.41667 12.8333H7.58333C9.7832 12.8333 10.8832 12.8333 11.5666 12.1499C12.25 11.4665 12.25 10.3665 12.25 8.16667V7C12.25 4.80011 12.25 3.70017 11.5666 3.01675C10.8832 2.33333 9.7832 2.33333 7.58333 2.33333Z"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M1.75 5.83333H12.25"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M9.04167 9.04167V10.2083M9.91667 9.625C9.91667 10.1082 9.5249 10.5 9.04167 10.5C8.55843 10.5 8.16667 10.1082 8.16667 9.625C8.16667 9.14177 8.55843 8.75 9.04167 8.75C9.5249 8.75 9.91667 9.14177 9.91667 9.625Z"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
