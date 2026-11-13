import { Icon, type IconProps } from './Icon';

/** Rounded square with three bars (Toolbar: Pipeline view; updated Figma, 13 Nov 2026) (Toolbar: Pipeline view). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function PipelineViewIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 12 12" defaultWidth={12} defaultHeight={12} {...props}>
      <path
        d="M1.5 6C1.5 7.87485 1.5 8.8123 1.97746 9.46945C2.13166 9.6817 2.3183 9.86835 2.53053 10.0225C3.1877 10.5 4.12513 10.5 6 10.5C7.87485 10.5 8.8123 10.5 9.46945 10.0225C9.6817 9.86835 9.86835 9.6817 10.0225 9.46945C10.5 8.8123 10.5 7.87485 10.5 6C10.5 4.12513 10.5 3.1877 10.0225 2.53053C9.86835 2.3183 9.6817 2.13166 9.46945 1.97746C8.8123 1.5 7.87485 1.5 6 1.5C4.12513 1.5 3.1877 1.5 2.53053 1.97746C2.3183 2.13166 2.13166 2.3183 1.97746 2.53053C1.5 3.1877 1.5 4.12513 1.5 6Z"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M6 3.5V5.5M8.5 3.5V8.5M3.5 3.5V7"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
