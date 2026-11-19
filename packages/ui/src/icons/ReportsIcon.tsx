import { Icon, type IconProps } from './Icon';

/** Bar chart (Sidebar: Reports). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function ReportsIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 16 16" defaultWidth={16} defaultHeight={16} {...props}>
      <path
        d="M6 12.6667V8.66667C6 7.93078 5.40255 7.33333 4.66667 7.33333H3.33333C2.59745 7.33333 2 7.93078 2 8.66667V12.6667C2 13.4026 2.59745 14 3.33333 14H4.66667C5.40255 14 6 13.4026 6 12.6667ZM6 12.6667V6C6 5.26411 6.59745 4.66667 7.33333 4.66667H8.66667C9.40255 4.66667 10 5.26411 10 6V12.6667M6 12.6667C6 13.4026 6.59745 14 7.33333 14H8.66667C9.40255 14 10 13.4026 10 12.6667M10 12.6667V3.33333C10 2.59745 10.5974 2 11.3333 2H12.6667C13.4026 2 14 2.59745 14 3.33333V12.6667C14 13.4026 13.4026 14 12.6667 14H11.3333C10.5974 14 10 13.4026 10 12.6667Z"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
