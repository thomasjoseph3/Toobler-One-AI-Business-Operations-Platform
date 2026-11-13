import { Icon, type IconProps } from './Icon';

/** Arrow out of a box (Toolbar: Export). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function ExportIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 15 15" defaultWidth={15} defaultHeight={15} {...props}>
      <path
        d="M6.25106 1.875C4.40959 1.89505 3.38185 2.01206 2.69899 2.69493C1.87493 3.51898 1.87493 4.8453 1.87493 7.49788C1.87493 10.1506 1.87493 11.4769 2.69899 12.3009C3.52305 13.125 4.84937 13.125 7.502 13.125C10.1546 13.125 11.4809 13.125 12.305 12.3009C12.988 11.6179 13.1049 10.5899 13.1249 8.74769"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M8.75 1.875H11.25C12.1339 1.875 12.5758 1.875 12.8504 2.14959C13.125 2.42418 13.125 2.86612 13.125 3.75V6.25M12.5 2.5L6.875 8.125"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
