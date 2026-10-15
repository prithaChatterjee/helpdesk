import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { THEME_STORAGE_KEY } from '@/lib/theme';

/**
 * Light, dark or the system's choice (the default), remembered per browser. Sets the `dark` class
 * on <html> that the `.dark` tokens in index.css and Tailwind's `dark:` variant key off.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      storageKey={THEME_STORAGE_KEY}
      defaultTheme="system"
      enableSystem
      // Switching repaints every surface at once instead of animating each border and background
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
