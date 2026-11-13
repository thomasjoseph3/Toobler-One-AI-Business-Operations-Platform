import { Icon, type IconProps } from './Icon';

/** Tick mark (Checkbox: checked). Drawn exactly as in the Figma frame; the colour comes from the surrounding text colour. */
export function CheckIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 14 14" defaultWidth={14} defaultHeight={14} {...props}>
      <path
        d="M5.67292 8.50019L9.97063 4.20248C10.0938 4.0793 10.2375 4.01771 10.4017 4.01771C10.5659 4.01771 10.7097 4.0793 10.8329 4.20248C10.9561 4.32576 11.0177 4.46892 11.0177 4.63196C11.0177 4.795 10.9561 4.93816 10.8329 5.06144L6.11144 9.79402C5.98816 9.9172 5.84442 9.97879 5.68021 9.97879C5.516 9.97879 5.37226 9.9172 5.24898 9.79402L3.17056 7.7156C3.04738 7.59233 2.98521 7.44917 2.98404 7.28612C2.98288 7.12308 3.04388 6.97992 3.16706 6.85665C3.29034 6.73347 3.4335 6.67188 3.59654 6.67188C3.75958 6.67188 3.90274 6.73347 4.02602 6.85665L5.67292 8.50019Z"
        fill="currentColor"
      />
    </Icon>
  );
}
