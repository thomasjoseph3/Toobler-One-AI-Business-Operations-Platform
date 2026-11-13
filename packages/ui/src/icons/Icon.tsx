import type { ReactNode, SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'viewBox'> {
  /** Width and height in pixels. Defaults to the size drawn in the Figma frame (usually 16). */
  size?: number;
  /** Set only for an icon that stands alone; it becomes the accessible name. Otherwise the icon is hidden from screen readers. */
  title?: string;
}

interface IconBaseProps extends IconProps {
  viewBox: string;
  defaultWidth: number;
  defaultHeight: number;
  children: ReactNode;
}

/**
 * The shared frame every icon is drawn in: an <svg> with the Figma viewBox that takes its colour from the text colour
 * (`currentColor`), so `text-icon-secondary` or `text-sidebar-item` on the icon or its parent recolours it in both themes.
 */
export function Icon({ viewBox, defaultWidth, defaultHeight, size, title, children, ...rest }: IconBaseProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      width={size ?? defaultWidth}
      height={size ?? defaultHeight}
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}
