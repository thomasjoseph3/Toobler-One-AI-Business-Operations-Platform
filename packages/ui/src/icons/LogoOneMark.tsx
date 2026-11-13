import { Icon, type IconProps } from './Icon';

/** The numeral "1" of the logo on its own (Collapsed sidebar: brand mark). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function LogoOneMark(props: IconProps) {
  return (
    <Icon viewBox="0 0 12.8918 22" defaultWidth={12.8918} defaultHeight={22} {...props}>
      <path
        d="M12.8918 21.7228C11.7654 21.934 10.6592 22.0245 9.57303 21.9943C8.49695 21.9742 7.53149 21.7882 6.67666 21.4362C5.83188 21.0741 5.18824 20.4959 4.74574 19.7014C4.34347 18.9572 4.13227 18.2029 4.11216 17.4386C4.09204 16.6642 4.08199 15.7893 4.08199 14.8137V0H8.18518V14.5724C8.18518 15.206 8.19021 15.7792 8.20027 16.2921C8.22038 16.7949 8.32598 17.1972 8.51706 17.4989C8.87911 18.0722 9.45737 18.3839 10.2519 18.4342C11.0464 18.4845 11.9263 18.4443 12.8918 18.3135V21.7228Z"
        fill="currentColor"
      />
      <path d="M4.07303 4.46524L0 6.9694V2.44382L4.07303 0V4.46524Z" fill="currentColor" />
    </Icon>
  );
}
