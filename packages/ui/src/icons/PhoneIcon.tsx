import { Icon, type IconProps } from './Icon';

/** Phone handset with signal (Sidebar: Phone). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function PhoneIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 16 16" defaultWidth={16} defaultHeight={16} {...props}>
      <path
        d="M3.26936 7.02753L5.02965 5.26725C5.38873 4.90818 5.51298 4.37761 5.36775 3.89101C5.25419 3.51051 5.12625 3.05309 5.0412 2.66195C4.96254 2.30018 4.64509 2 4.27487 2H3.26936C2.52893 2 1.92087 2.60256 2.00209 3.33853C2.61952 8.93307 7.06173 13.3753 12.6563 13.9927C13.3922 14.0739 13.9948 13.4659 13.9948 12.7254V11.7199C13.9948 11.3497 13.6934 11.046 13.3291 10.9797C12.9273 10.9067 12.5022 10.7869 12.1465 10.6735C11.6355 10.5106 11.0675 10.6251 10.6883 11.0043L8.96727 12.7254"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M8.66147 2.66667C11.2388 2.66667 13.3281 4.75601 13.3281 7.33333M8.66147 5.33333C9.766 5.33333 10.6615 6.22877 10.6615 7.33333"
        strokeWidth="1.33333"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
