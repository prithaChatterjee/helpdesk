import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { THEME_OPTIONS, type ThemeOption } from '@/lib/theme';
import { cn } from '@/lib/utils';

const OPTION_LABELS: Record<ThemeOption, string> = {
  light: 'Light theme',
  dark: 'Dark theme',
  system: 'Match system theme',
};

const OPTION_ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

/** Light / dark / system toggle buttons, styled for the dark masthead. */
export function ThemeSwitcher() {
  const { theme = 'system', setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex rounded-md bg-masthead-foreground/10 p-0.5"
    >
      {THEME_OPTIONS.map((option) => {
        const Icon = OPTION_ICONS[option];
        const active = theme === option;
        return (
          <button
            key={option}
            type="button"
            aria-label={OPTION_LABELS[option]}
            aria-pressed={active}
            title={OPTION_LABELS[option]}
            onClick={() => setTheme(option)}
            className={cn(
              'grid size-7 place-items-center rounded-sm text-masthead-muted transition-colors',
              'hover:text-masthead-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-masthead-foreground',
              active && 'bg-masthead-foreground text-masthead hover:text-masthead',
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
