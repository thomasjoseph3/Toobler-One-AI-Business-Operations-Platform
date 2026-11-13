import { Icon, type IconProps } from './Icon';

/** Panel with a left column (Sidebar: collapse button). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function SidebarToggleIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 20 20" defaultWidth={20} defaultHeight={20} {...props}>
      <path
        d="M10.8333 2.5H9.16667C6.02397 2.5 4.45262 2.5 3.47631 3.47631C2.5 4.45262 2.5 6.02397 2.5 9.16667V10.8333C2.5 13.976 2.5 15.5474 3.47631 16.5237C4.45262 17.5 6.02397 17.5 9.16667 17.5H10.8333C13.976 17.5 15.5474 17.5 16.5237 16.5237C17.5 15.5474 17.5 13.976 17.5 10.8333V9.16667C17.5 6.02397 17.5 4.45262 16.5237 3.47631C15.5474 2.5 13.976 2.5 10.8333 2.5Z"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path d="M7.5 2.5V17.5" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" />
    </Icon>
  );
}
