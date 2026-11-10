import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'toobler-theme';

interface ThemeContextValue {
  themeChoice: ThemeChoice;
  chooseTheme: (themeChoice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Reads the theme saved last time. Storage can be blocked (private windows), so this never throws. */
function readSavedThemeChoice(): ThemeChoice {
  try {
    const savedValue = window.localStorage.getItem(STORAGE_KEY);
    return savedValue === 'light' || savedValue === 'dark' ? savedValue : 'system';
  } catch {
    return 'system';
  }
}

/** Saves the theme for next time; silently does nothing when storage is blocked. */
function saveThemeChoice(themeChoice: ThemeChoice): void {
  try {
    if (themeChoice === 'system') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, themeChoice);
  } catch {
    /* the choice still applies for this visit */
  }
}

/** Keeps the person's theme choice and applies it: light or dark is set on <html>; "system" removes it so CSS follows the device. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(readSavedThemeChoice);

  useEffect(() => {
    const rootElement = document.documentElement;
    if (themeChoice === 'system') rootElement.removeAttribute('data-theme');
    else rootElement.setAttribute('data-theme', themeChoice);
  }, [themeChoice]);

  const chooseTheme = useCallback((newChoice: ThemeChoice) => {
    setThemeChoice(newChoice);
    saveThemeChoice(newChoice);
  }, []);

  const value = useMemo(() => ({ themeChoice, chooseTheme }), [themeChoice, chooseTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Gives a component the current theme choice and a way to change it. */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>.');
  return value;
}
