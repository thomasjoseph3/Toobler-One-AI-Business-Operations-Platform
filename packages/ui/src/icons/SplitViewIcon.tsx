import { Icon, type IconProps } from './Icon';

/** Window with three bars (Toolbar: Split view). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function SplitViewIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 11 11" defaultWidth={11} defaultHeight={11} {...props}>
      <path
        d="M2.44444 8.55556H3.66667V2.44444H2.44444V8.55556ZM7.33333 7.33333H8.55556V2.44444H7.33333V7.33333ZM4.88889 5.5H6.11111V2.44444H4.88889V5.5ZM1.22222 11C0.886111 11 0.59838 10.8803 0.359028 10.641C0.119676 10.4016 0 10.1139 0 9.77778V1.22222C0 0.886111 0.119676 0.59838 0.359028 0.359028C0.59838 0.119676 0.886111 0 1.22222 0H9.77778C10.1139 0 10.4016 0.119676 10.641 0.359028C10.8803 0.59838 11 0.886111 11 1.22222V9.77778C11 10.1139 10.8803 10.4016 10.641 10.641C10.4016 10.8803 10.1139 11 9.77778 11H1.22222ZM1.22222 9.77778H9.77778V1.22222H1.22222V9.77778Z"
        fill="currentColor"
      />
    </Icon>
  );
}
