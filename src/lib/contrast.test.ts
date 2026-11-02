import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Moss palette contrast tests (restyle plan, PR2).
 *
 * The palette lives in src/index.css; the same hex values are asserted here
 * so the file cannot drift. Every text pair used by the UI must pass WCAG:
 * text >= 4.5:1; status dots / focus rings / control boundaries >= 3:1.
 */

const css = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.css"),
  "utf-8"
);

function lum(hex: string): number {
  const s = hex.replace("#", "");
  const f = (i: number) => {
    const v = parseInt(s.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(0) + 0.7152 * f(2) + 0.0722 * f(4);
}

function ratio(fg: string, bg: string): number {
  const a = lum(fg);
  const b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function atLeast(fg: string, bg: string, min: number, label: string) {
  const r = ratio(fg, bg);
  assert.ok(
    r >= min,
    label + ": " + fg + " on " + bg + " = " + r.toFixed(2) + ":1, need " + min
  );
}

test("light theme text pairs pass WCAG AA (4.5:1)", () => {
  atLeast("#1D211E", "#FAFAF7", 4.5, "ink on page");
  atLeast("#1D211E", "#FFFFFF", 4.5, "ink on surface");
  atLeast("#5D665F", "#FAFAF7", 4.5, "muted on page");
  atLeast("#5D665F", "#FFFFFF", 4.5, "muted on surface");
  atLeast("#2F6B4F", "#FAFAF7", 4.5, "mint ink on page");
  atLeast("#2F6B4F", "#DDEFE0", 4.5, "mint ink on mint fill");
  atLeast("#1D211E", "#DDEFE0", 4.5, "primary pill pair");
});

test("light theme status and control pairs pass 3:1", () => {
  atLeast("#B42318", "#FAFAF7", 3, "restricted");
  atLeast("#A16207", "#FAFAF7", 3, "warning");
  atLeast("#6F7770", "#FFFFFF", 3, "input boundary on surface");
  atLeast("#6F7770", "#FAFAF7", 3, "input boundary on page");
  atLeast("#2F6B4F", "#FAFAF7", 3, "focus ring");
});

test("dark theme text pairs pass WCAG AA (4.5:1)", () => {
  atLeast("#E9EDE9", "#0E1210", 4.5, "dark ink on page");
  atLeast("#E9EDE9", "#151A17", 4.5, "dark ink on surface");
  atLeast("#9FA69F", "#0E1210", 4.5, "dark muted on page");
  atLeast("#9FA69F", "#151A17", 4.5, "dark muted on surface");
  atLeast("#B7E2C9", "#1C2A22", 4.5, "mint ink on dark mint fill");
});

test("dark theme status and control pairs pass 3:1", () => {
  atLeast("#F08484", "#0E1210", 3, "dark restricted");
  atLeast("#D9A24A", "#0E1210", 3, "dark warning");
  atLeast("#6B756C", "#0E1210", 3, "dark input boundary");
  atLeast("#6B756C", "#151A17", 3, "dark input boundary on surface");
  atLeast("#8FCBA8", "#0E1210", 3, "dark focus ring");
});

test("port-size ramp passes WCAG AA in both themes (4.5:1)", () => {
  atLeast("#FFFFFF", "#2F6B4F", 4.5, "Major light");
  atLeast("#0E1210", "#8FCBA8", 4.5, "Major dark");
  atLeast("#16301F", "#A9D3BB", 4.5, "Small light");
  atLeast("#E9EDE9", "#2F5A44", 4.5, "Small dark");
  atLeast("#2F6B4F", "#DDEFE0", 4.5, "Minor light");
  atLeast("#B7E2C9", "#1C2A22", 4.5, "Minor dark");
  atLeast("#5D665F", "#FFFFFF", 4.5, "Very Small light");
  atLeast("#9FA69F", "#151A17", 4.5, "Very Small dark");
});

test("checkbox, slider and chip controls pass 3:1", () => {
  atLeast("#2F6B4F", "#FFFFFF", 3, "checked checkbox / slider range on card");
  atLeast("#2F6B4F", "#F0F2EE", 3, "slider range on muted track");
  atLeast("#8FCBA8", "#151A17", 3, "dark control fill on card");
  atLeast("#8FCBA8", "#1B211E", 3, "dark slider range on muted track");
});

test("src/index.css defines the Moss palette verbatim", () => {
  const tokens: Array<[string, string]> = [
    ["--background", "#FAFAF7"],
    ["--foreground", "#1D211E"],
    ["--card", "#FFFFFF"],
    ["--primary", "#DDEFE0"],
    ["--primary-foreground", "#1D211E"],
    ["--accent", "#DDEFE0"],
    ["--accent-foreground", "#2F6B4F"],
    ["--muted-foreground", "#5D665F"],
    ["--destructive", "#B42318"],
    ["--warning", "#A16207"],
    ["--ring", "#2F6B4F"],
    ["--sidebar-primary", "#2F6B4F"],
    ["--input", "#6F7770"],
  ];
  for (const [name, value] of tokens) {
    assert.ok(
      css.includes(name + ": " + value + ";"),
      "src/index.css is missing " + name + ": " + value
    );
  }
  assert.ok(css.includes("--background: #0E1210;"), "dark background missing");
  assert.ok(css.includes("--primary-foreground: #B7E2C9;"), "dark primary pair missing");
  assert.ok(css.includes("--input: #6B756C;"), "dark input missing");
  assert.ok(css.includes("--sidebar-primary: #8FCBA8;"), "dark moss control fill missing");
});
