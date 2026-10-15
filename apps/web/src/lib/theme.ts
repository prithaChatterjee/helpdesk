/** localStorage key of the chosen theme; index.html reads it too, to apply it before first paint */
export const THEME_STORAGE_KEY = 'helpdesk-theme';

export const THEME_OPTIONS = ['light', 'dark', 'system'] as const;
export type ThemeOption = (typeof THEME_OPTIONS)[number];
