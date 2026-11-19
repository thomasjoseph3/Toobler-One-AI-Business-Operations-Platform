import { Icon, type IconProps } from './Icon';

/** Funnel (Toolbar: Filter). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function FilterIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 15 15" defaultWidth={15} defaultHeight={15} {...props}>
      <path
        d="M5.53591 7.81631C3.98063 6.6535 2.87228 5.37447 2.26709 4.65542C2.07975 4.43283 2.01836 4.26994 1.98146 3.983C1.85507 3.0005 1.79188 2.50925 2.07997 2.19213C2.36806 1.875 2.87753 1.875 3.89646 1.875H11.1036C12.1225 1.875 12.6319 1.875 12.92 2.19213C13.2081 2.50925 13.1449 3.0005 13.0186 3.98301C12.9816 4.26994 12.9203 4.43284 12.7329 4.65542C12.1269 5.37539 11.0163 6.65669 9.45788 7.82094C9.31688 7.92631 9.22394 8.09794 9.20669 8.28838C9.05231 9.995 8.90994 10.9297 8.82131 11.4026C8.67831 12.1661 7.59575 12.6254 7.01625 13.0352C6.67131 13.2791 6.25269 12.9887 6.20799 12.6111C6.12277 11.8913 5.96226 10.429 5.78704 8.28838C5.77131 8.09619 5.67804 7.92256 5.53591 7.81631Z"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
