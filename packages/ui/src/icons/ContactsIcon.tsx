import { Icon, type IconProps } from './Icon';

/** Two people (Sidebar: Contacts). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function ContactsIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 16 16" defaultWidth={16} defaultHeight={16} {...props}>
      <path
        d="M11 13.3333V11.3235C11 10.9093 10.8123 10.5105 10.4559 10.2996C9.43827 9.69733 8.11427 9.33333 6.66667 9.33333C5.21909 9.33333 3.89507 9.69733 2.87745 10.2996C2.52108 10.5105 2.33333 10.9093 2.33333 11.3235V13.3333"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M9 5C9 6.28866 7.95533 7.33333 6.66667 7.33333C5.378 7.33333 4.33333 6.28866 4.33333 5C4.33333 3.71134 5.378 2.66667 6.66667 2.66667C7.95533 2.66667 9 3.71134 9 5Z"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M13.6667 13.334V11.3241C13.6667 10.91 13.4789 10.5111 13.1225 10.3003C12.7807 10.0979 12.4041 9.92247 12 9.77867"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M10 2.76302C10.9638 3.04987 11.6667 3.94272 11.6667 4.99973C11.6667 6.05673 10.9638 6.9496 10 7.23647"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
