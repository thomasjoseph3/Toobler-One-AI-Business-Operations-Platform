import { Icon, type IconProps } from './Icon';

/** Plus sign (Toolbar: Create Lead). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function PlusIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 16 16" defaultWidth={16} defaultHeight={16} {...props}>
      <path
        d="M8 2.66667V8M8 8V13.3333M8 8H13.3333M8 8H2.66667"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
