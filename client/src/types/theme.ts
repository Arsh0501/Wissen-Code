// Light/dark theme preference

export type ThemePreference = 'light' | 'dark' | 'system';

export type ResolvedTheme = 'light' | 'dark';

export interface ThemeContextType {
  preference: ThemePreference;
  theme: ResolvedTheme; // what is actually shown
  setPreference: (p: ThemePreference) => void;
  toggle: () => void;
}
