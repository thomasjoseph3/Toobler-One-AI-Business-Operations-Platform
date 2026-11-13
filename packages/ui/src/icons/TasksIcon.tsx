import { Icon, type IconProps } from './Icon';

/** Clipboard (Sidebar: Tasks). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function TasksIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 16 16" defaultWidth={16} defaultHeight={16} {...props}>
      <path
        d="M6 3.33333H4.66667C3.93078 3.33333 3.33333 3.93078 3.33333 4.66667V12.6667C3.33333 13.4026 3.93078 14 4.66667 14H11.3333C12.0692 14 12.6667 13.4026 12.6667 12.6667V4.66667C12.6667 3.93078 12.0692 3.33333 11.3333 3.33333H10M6 3.33333C6 4.06922 6.59745 4.66667 7.33333 4.66667H8.66667C9.40255 4.66667 10 4.06922 10 3.33333M6 3.33333C6 2.59745 6.59745 2 7.33333 2H8.66667C9.40255 2 10 2.59745 10 3.33333"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
