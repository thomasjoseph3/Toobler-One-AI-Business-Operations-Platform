import { clsx, type ClassValue } from 'clsx';

/** Joins CSS class names, skipping empty ones: joinClassNames('a', false, 'b') gives "a b". */
export const joinClassNames = (...classValues: ClassValue[]): string => clsx(classValues);
