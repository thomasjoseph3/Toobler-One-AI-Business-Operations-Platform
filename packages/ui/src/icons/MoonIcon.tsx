import { Icon, type IconProps } from './Icon';

/** Crescent moon (Top bar: dark mode). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function MoonIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 20 20" defaultWidth={20} defaultHeight={20} {...props}>
      <path
        d="M17.5 10.8333C16.3734 10.9673 15.231 10.844 14.159 10.4726C13.0869 10.1012 12.1131 9.49139 11.3109 8.68913C10.5086 7.88687 9.89882 6.91306 9.52742 5.84101C9.15601 4.76896 9.03266 3.62662 9.16667 2.5C7.7687 2.66628 6.44576 3.22267 5.34916 4.10553C4.25257 4.98839 3.4266 6.16207 2.96574 7.49232C2.50488 8.82257 2.42774 10.2557 2.74313 11.6277C3.05852 12.9998 3.75372 14.2553 4.7492 15.2508C5.74468 16.2463 7.00024 16.9415 8.37228 17.2569C9.74432 17.5723 11.1774 17.4951 12.5077 17.0343C13.8379 16.5734 15.0116 15.7474 15.8945 14.6508C16.7773 13.5542 17.3337 12.2313 17.5 10.8333Z"
        strokeWidth="1.41667"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
