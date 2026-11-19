import { Icon, type IconProps } from './Icon';

/** Up and down arrows (Toolbar: Sort). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function SortIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 15 15" defaultWidth={15} defaultHeight={15} {...props}>
      <path d="M4.375 2.5V12.5" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" />
      <path
        d="M10.625 11.875V2.5"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M6.25 4.37499C6.25 4.37499 4.86908 2.50001 4.37499 2.5C3.88089 2.49999 2.5 4.375 2.5 4.375"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M12.5 10.625C12.5 10.625 11.1191 12.5 10.625 12.5C10.1309 12.5 8.75 10.625 8.75 10.625"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
