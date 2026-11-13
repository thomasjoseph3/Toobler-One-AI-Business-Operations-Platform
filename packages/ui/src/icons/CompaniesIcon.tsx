import { Icon, type IconProps } from './Icon';

/** Office building (Sidebar: Companies). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function CompaniesIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 16 16" defaultWidth={16} defaultHeight={16} {...props}>
      <path
        d="M12.6667 14V3.33333C12.6667 2.59745 12.0692 2 11.3333 2H4.66667C3.93078 2 3.33333 2.59745 3.33333 3.33333V14M12.6667 14H14M12.6667 14H9.33333M3.33333 14H2M3.33333 14H6.66667M6 4.66667H6.66667M6 7.33333H6.66667M9.33333 4.66667H10M9.33333 7.33333H10M6.66667 14V10.6667C6.66667 10.2987 6.96539 10 7.33333 10H8.66667C9.03461 10 9.33333 10.2987 9.33333 10.6667V14M6.66667 14H9.33333"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
