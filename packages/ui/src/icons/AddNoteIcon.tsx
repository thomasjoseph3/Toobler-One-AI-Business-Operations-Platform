import { Icon, type IconProps } from './Icon';

/** Calendar with a plus (Table: row action, add a note). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function AddNoteIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 18 18" defaultWidth={18} defaultHeight={18} {...props}>
      <path
        d="M11.625 1.5V3.75M4.875 1.5V3.75M8.25 1.5V3.75"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M14.25 9.75V7.875C14.25 5.40013 14.25 4.16269 13.4812 3.39384C12.7123 2.625 11.4748 2.625 9 2.625H7.5C5.02513 2.625 3.78769 2.625 3.01885 3.39385C2.25 4.16269 2.25 5.40013 2.25 7.875V11.25C2.25 13.7249 2.25 14.9623 3.01885 15.7312C3.78769 16.5 5.02513 16.5 7.5 16.5H9.75"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M5.25 11.25H8.25M5.25 8.25H11.25"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M15.75 14.25H13.5M13.5 14.25H11.25M13.5 14.25V16.5M13.5 14.25V12"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
