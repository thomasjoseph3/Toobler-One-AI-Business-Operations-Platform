import { Icon, type IconProps } from './Icon';

/** Pulse in a rounded square (Table: row action, log activity). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function ActivityIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 20 20" defaultWidth={20} defaultHeight={20} {...props}>
      <path
        d="M10 17.5C6.46447 17.5 4.6967 17.5 3.59835 16.4017C2.5 15.3033 2.5 13.5355 2.5 10C2.5 6.46447 2.5 4.6967 3.59835 3.59835C4.6967 2.5 6.46447 2.5 10 2.5C13.5355 2.5 15.3033 2.5 16.4017 3.59835C17.5 4.6967 17.5 6.46447 17.5 10C17.5 13.5355 17.5 15.3033 16.4017 16.4017C15.3033 17.5 13.5355 17.5 10 17.5Z"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
      <path
        d="M5.83333 10H5.92833H5.92834C6.48702 10 6.76636 10 6.98049 9.85158C7.19463 9.70325 7.29272 9.44167 7.48888 8.9185L8.19574 7.03357C8.27851 6.81287 8.4895 6.66667 8.72517 6.66667C8.98467 6.66667 9.21083 6.84325 9.27375 7.09497L10.7263 12.905C10.7892 13.1567 11.0153 13.3333 11.2748 13.3333C11.5105 13.3333 11.7215 13.1872 11.8043 12.9664L12.5111 11.0815L12.5111 11.0815C12.7073 10.5583 12.8053 10.2967 13.0195 10.1484C13.2337 10 13.513 10 14.0717 10H14.1667"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke="currentColor"
      />
    </Icon>
  );
}
