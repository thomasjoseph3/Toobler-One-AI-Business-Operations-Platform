import { Icon, type IconProps } from './Icon';

/** Three dots in a row (Row actions and the user card). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function MoreIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 20 20" defaultWidth={20} defaultHeight={20} {...props}>
      <path
        d="M5.00376 10.4167V10M15.0038 10.4167V10M10.0038 10.4167V10M5.8371 10.4167C5.8371 9.95642 5.464 9.58333 5.00376 9.58333C4.54352 9.58333 4.17043 9.95642 4.17043 10.4167C4.17043 10.8769 4.54352 11.25 5.00376 11.25C5.464 11.25 5.8371 10.8769 5.8371 10.4167ZM15.8371 10.4167C15.8371 9.95642 15.464 9.58333 15.0038 9.58333C14.5435 9.58333 14.1704 9.95642 14.1704 10.4167C14.1704 10.8769 14.5435 11.25 15.0038 11.25C15.464 11.25 15.8371 10.8769 15.8371 10.4167ZM10.8371 10.4167C10.8371 9.95642 10.464 9.58333 10.0038 9.58333C9.54352 9.58333 9.17044 9.95642 9.17044 10.4167C9.17044 10.8769 9.54352 11.25 10.0038 11.25C10.464 11.25 10.8371 10.8769 10.8371 10.4167Z"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
