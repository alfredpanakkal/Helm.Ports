import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useTheme } from "@/components/theme-provider";
import { Sun, Moon, Monitor, Ship } from "lucide-react";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Color theme">
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => setTheme(value)}
          className={[
            "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors cursor-pointer",
            theme === value
              ? "border-teal-500/60 bg-teal-600/10 font-medium text-teal-700 dark:text-teal-400"
              : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-teal-500/30",
          ].join(" ")}
        >
          <Icon className="h-4 w-4" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function CreditRow({ children }: { children: ReactNode }) {
  return (
    <li className="rounded-lg border border-border bg-card p-3 text-sm leading-relaxed text-muted-foreground">
      {children}
    </li>
  );
}

export function InfoSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>About Helm.Ports</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-8">
          <Section title="Theme">
            <ThemeSwitcher />
            <p className="text-xs text-muted-foreground/70">
              Light, dark or follow your device setting.
            </p>
          </Section>

          <Section title="About">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Helm.Ports is an explorer for the world&rsquo;s maritime ports and
              anchorages — over 5,400 entries across 209 countries and
              territories — with channel depths, tidal ranges, entrance
              restrictions and vessel size capacities, plus live weather, sea
              state, tides, sun &amp; moon transit times and local time details
              on an OpenStreetMap-based chart view.
            </p>
          </Section>

          <Section title="Authors">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-teal-600/10 text-teal-700 dark:text-teal-400">
                <Ship className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Alfred Jose</p>
                <p className="text-xs text-muted-foreground">
                  Developer &amp; maintainer ·{" "}
                  <a
                    href="https://github.com/alfredpanakkal"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-600 dark:text-teal-400 dark:hover:text-teal-300"
                  >
                    @alfredpanakkal
                  </a>
                </p>
              </div>
            </div>
          </Section>

          <Section title="Credits">
            <ul className="space-y-2">
              <CreditRow>
                Port data — NGA Publication 150, World Port Index (2019
                edition), via the tayljordan/ports dataset (MIT).
              </CreditRow>
              <CreditRow>
                Map tiles — &copy; OpenStreetMap contributors; seamarks —
                OpenSeaMap.
              </CreditRow>
              <CreditRow>
                Weather, marine &amp; tide forecasts — Open-Meteo; time zone
                data — TimeZoneDB.
              </CreditRow>
              <CreditRow>
                Map engine — MapLibre GL JS. Built with React, Vite, Tailwind
                CSS and shadcn/ui.
              </CreditRow>
            </ul>
          </Section>

          <p className="border-t border-border pt-4 text-xs text-muted-foreground/70">
            Not for navigation — always consult current nautical charts.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
