import { Icon, type IconProps } from './Icon';

/** Inbox tray (Sidebar: Shared Inbox). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function SharedInboxIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 16 16" defaultWidth={16} defaultHeight={16} {...props}>
      <path
        d="M13.3333 8.66667V4C13.3333 3.26411 12.7359 2.66667 12 2.66667H4C3.26411 2.66667 2.66667 3.26411 2.66667 4V8.66667M13.3333 8.66667V12C13.3333 12.7359 12.7359 13.3333 12 13.3333H4C3.26411 13.3333 2.66667 12.7359 2.66667 12V8.66667M13.3333 8.66667H11.6093C11.4325 8.6667 11.263 8.73697 11.138 8.862L9.52867 10.4713C9.40367 10.5964 9.23413 10.6666 9.05733 10.6667H6.94267C6.76587 10.6666 6.59633 10.5964 6.47133 10.4713L4.862 8.862C4.73701 8.73697 4.56746 8.6667 4.39067 8.66667H2.66667"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
