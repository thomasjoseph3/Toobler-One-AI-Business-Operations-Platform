import { Icon, type IconProps } from './Icon';

/** Target with an arrow (Sidebar: Leads). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function LeadsIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 16 16" defaultWidth={16} defaultHeight={16} {...props}>
      <path
        d="M11.3333 8C11.3333 9.84093 9.84093 11.3333 8 11.3333C6.15905 11.3333 4.66667 9.84093 4.66667 8C4.66667 6.15905 6.15905 4.66667 8 4.66667"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M9.33333 1.46669C8.90253 1.37924 8.4566 1.33333 8 1.33333C4.3181 1.33333 1.33333 4.3181 1.33333 8C1.33333 11.6819 4.3181 14.6667 8 14.6667C11.6819 14.6667 14.6667 11.6819 14.6667 8C14.6667 7.5434 14.6207 7.09747 14.5333 6.66667"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M8.0202 7.975L11.0555 4.93973M13.1603 2.89641L12.7915 1.57165C12.7235 1.35341 12.4609 1.26643 12.2839 1.41108C11.3265 2.19345 10.2836 3.24727 11.1353 4.90946C12.8514 5.7097 13.8311 4.63056 14.5822 3.72353C14.7317 3.54307 14.6415 3.27178 14.4165 3.2067L13.1603 2.89641Z"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
