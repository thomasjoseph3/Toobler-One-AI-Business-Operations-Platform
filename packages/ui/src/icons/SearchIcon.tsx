import { Icon, type IconProps } from './Icon';

/** Magnifying glass (Top bar: search). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function SearchIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 18 18" defaultWidth={18} defaultHeight={18} {...props}>
      <path
        d="M12.25 12.2498L14.85 14.8498"
        strokeWidth="1.41667"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M13.5501 8.35006C13.5501 5.47814 11.2219 3.15 8.35001 3.15C5.4781 3.15 3.14995 5.47814 3.14995 8.35006C3.14995 11.222 5.4781 13.5501 8.35001 13.5501C11.2219 13.5501 13.5501 11.222 13.5501 8.35006Z"
        strokeWidth="1.41667"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
