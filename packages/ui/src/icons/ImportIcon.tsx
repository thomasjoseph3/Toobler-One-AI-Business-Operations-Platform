import { Icon, type IconProps } from './Icon';

/** Arrow into a tray (Toolbar: Import). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function ImportIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 15 15" defaultWidth={15} defaultHeight={15} {...props}>
      <path
        d="M7.5 9.0625V1.5625"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M5 1.60217C3.77026 1.67332 2.99146 1.87282 2.43202 2.43226C1.5625 3.30179 1.5625 4.70127 1.5625 7.50025C1.5625 10.2992 1.5625 11.6987 2.43202 12.5682C3.30156 13.4377 4.70104 13.4377 7.5 13.4377C10.2989 13.4377 11.6984 13.4377 12.568 12.5682C13.4375 11.6987 13.4375 10.2992 13.4375 7.50026V7.50025V7.50024C13.4375 4.70126 13.4375 3.30178 12.568 2.43226C12.0086 1.87282 11.2297 1.67332 10 1.60217"
        strokeWidth="1.1"
        strokeLinecap="round"
        stroke="currentColor"
      />
      <path
        d="M10 7.1875C10 7.1875 8.15875 9.6875 7.5 9.6875C6.84119 9.6875 5 7.1875 5 7.1875"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
