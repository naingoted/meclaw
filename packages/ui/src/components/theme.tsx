"use client";
import { Moon, Sun } from "lucide-react";
import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
  useTheme,
} from "next-themes";
import * as React from "react";
import { cn } from "../utils";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // next-themes@0.4.6 declares `ThemeProviderProps extends React.PropsWithChildren`
  // (no type arg); under @types/react@19 that collapses to `unknown` and drops
  // `children`, so JSX children fail to typecheck. Pass children inside a cast
  // props object instead — identical at runtime (next-themes renders props.children).
  return (
    <NextThemesProvider
      {...({
        attribute: "class",
        defaultTheme: "dark",
        enableSystem: false,
        disableTransitionOnChange: true,
        children,
      } as ThemeProviderProps)}
    />
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // Hydration-safe "mounted" flag without setState-in-effect: the server snapshot
  // is false (renders a placeholder matching SSR), then flips to true after hydration.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const dark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={cn(
        "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent/15 hover:text-accent",
        className,
      )}
    >
      {mounted ? (
        dark ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )
      ) : (
        <span className="h-4 w-4" />
      )}
    </button>
  );
}
