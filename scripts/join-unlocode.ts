/**
 * Join UN/LOCODE (UNECE) codes onto data/ports.json so port popups can
 * show a real UN/LOCODE instead of "-".
 *
 * Usage:
 *   bun run data:unlocode            (or: tsx scripts/join-unlocode.ts)
 *   bun run data:unlocode --refresh  re-download the UN/LOCODE code list
 *
 * How it works:
 *   1. Reads data/ports.json (5,410 ports, no UN/LOCODE).
 *   2. Maps each port's country name to its ISO2 code via the shared table
 *      in src/lib/countryCodes.ts.
 *   3. Loads the UNECE UN/LOCODE code list (single CSV, ~110k rows) from
 *      the datasets/un-locode GitHub mirror of the official UNECE list.
 *      The download is cached at data/unlocode/code-list.csv; a file
 *      placed there manually is always used without downloading.
 *   4. Indexes locodes by normalized name (accents stripped, punctuation
 *      removed, "port of" / "port" prefixes dropped), preferring entries
 *      whose Function column contains "1" (position 1 = sea port).
 *   5. Writes the match into each port record as "unlocode". Manual fixes
 *      in data/unlocode-overrides.json ({"<wpi_port_id>": "INMAA"}) win
 *      over the automatic match and survive re-runs. Unmatched ports are
 *      reported to data/unmatched-unlocode.csv for review.
 *
 * Idempotent: re-running only refreshes the unlocode field; metadata and
 * every other port field stay untouched.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getCountryIso2 } from "../src/lib/countryCodes.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const CACHE_PATH = path.join(ROOT, "data", "unlocode", "code-list.csv");
const DOWNLOAD_URL =
  "https://raw.githubusercontent.com/datasets/un-locode/main/data/code-list.csv";

interface RawPort {
  [key: string]: unknown;
}

/** Symmetric name normalization for matching (map roadmap, data phase). */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^port of /, "")
    .replace(/^port /, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

/** Minimal CSV line splitter that honors double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

async function loadCodeList(refresh: boolean): Promise<string> {
  if (!refresh && fs.existsSync(CACHE_PATH)) {
    console.log("Using cached UN/LOCODE code list: " + CACHE_PATH);
    return fs.readFileSync(CACHE_PATH, "utf-8");
  }
  console.log("Downloading UN/LOCODE code list from " + DOWNLOAD_URL);
  const res = await fetch(DOWNLOAD_URL);
  if (!res.ok) {
    throw new Error("HTTP " + res.status + " for " + DOWNLOAD_URL);
  }
  const text = await res.text();
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, text);
  console.log("Cached to " + CACHE_PATH);
  return text;
}

async function main(): Promise<void> {
  const refresh = process.argv.includes("--refresh");
  const portsPath = path.join(ROOT, "data", "ports.json");
  const overridesPath = path.join(ROOT, "data", "unlocode-overrides.json");

  const raw = JSON.parse(fs.readFileSync(portsPath, "utf-8")) as {
    ports: RawPort[];
    metadata?: RawPort;
  };
  const ports = raw.ports;
  const overrides: Record<string, string> = fs.existsSync(overridesPath)
    ? (JSON.parse(fs.readFileSync(overridesPath, "utf-8")) as Record<string, string>)
    : {};

  // 1. Country names -> ISO2, only for countries that actually have ports.
  const iso2ByCountry = new Map<string, string>();
  for (const p of ports) {
    const name = String(p.country ?? "");
    if (!iso2ByCountry.has(name)) {
      const iso2 = getCountryIso2(name); // logs unknown names once
      if (iso2) iso2ByCountry.set(name, iso2);
    }
  }
  console.log(iso2ByCountry.size + " countries to match");

  // 2. Parse the code list and index by ISO2 + normalized name.
  const csv = await loadCodeList(refresh);
  const lines = csv.split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? "").map((h) =>
    h.toLowerCase().replace(/[^a-z]/g, "")
  );
  const iCountry = header.indexOf("country");
  const iLocation = header.indexOf("location");
  const iFunction = header.indexOf("function");
  const iName =
    header.indexOf("namewodiacritics") >= 0
      ? header.indexOf("namewodiacritics")
      : header.indexOf("name");
  if (iCountry < 0 || iLocation < 0 || iFunction < 0 || iName < 0) {
    throw new Error("Unexpected UN/LOCODE header: " + (lines[0] ?? ""));
  }

  const portIndex = new Map<string, Map<string, string>>(); // sea-port entries
  const anyIndex = new Map<string, Map<string, string>>(); // all entries
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = splitCsvLine(line);
    const country = (cells[iCountry] ?? "").toUpperCase();
    const location = cells[iLocation] ?? "";
    const name = cells[iName] ?? "";
    const func = cells[iFunction] ?? "";
    if (!country || !location || !name) continue;
    const key = norm(name);
    if (!key) continue;
    const code = country + location;
    if (func.includes("1")) {
      let idx = portIndex.get(country);
      if (!idx) {
        idx = new Map();
        portIndex.set(country, idx);
      }
      if (!idx.has(key)) idx.set(key, code);
    }
    let idxAny = anyIndex.get(country);
    if (!idxAny) {
      idxAny = new Map();
      anyIndex.set(country, idxAny);
    }
    if (!idxAny.has(key)) idxAny.set(key, code);
  }

  // 3. Match every port: overrides win, then sea-port entries, then any.
  let matched = 0;
  let overridden = 0;
  const unmatched: string[] = ["wpi_port_id,country,port_name"];
  for (const p of ports) {
    const id = String(p.wpi_port_id);
    const countryName = String(p.country ?? "");
    const override = overrides[id];
    if (override) {
      p.unlocode = override;
      matched++;
      overridden++;
      continue;
    }
    const iso2 = iso2ByCountry.get(countryName);
    const key = norm(String(p.wpi_port_name ?? ""));
    const code =
      (iso2 && key ? portIndex.get(iso2)?.get(key) : undefined) ??
      (iso2 && key ? anyIndex.get(iso2)?.get(key) : undefined) ??
      null;
    p.unlocode = code;
    if (code) {
      matched++;
    } else {
      unmatched.push(
        [id, countryName, String(p.wpi_port_name ?? "")]
          .map((v) => v.replace(/,/g, " "))
          .join(",")
      );
    }
  }

  // 4. Write back (unlocode is appended to each record; everything else
  //    is untouched, metadata included).
  fs.writeFileSync(portsPath, JSON.stringify(raw, null, 2) + "\n");
  fs.writeFileSync(
    path.join(ROOT, "data", "unmatched-unlocode.csv"),
    unmatched.join("\n") + "\n"
  );

  console.log("");
  console.log("UN/LOCODE join complete:");
  console.log(
    "  matched:   " + matched + "/" + ports.length + " (" + overridden + " via overrides)"
  );
  console.log("  unmatched: " + (ports.length - matched));
  console.log("Unmatched ports were written to data/unmatched-unlocode.csv.");
  console.log(
    'Add manual fixes to data/unlocode-overrides.json as { "<wpi_port_id>": "<LOCODE>" } and re-run.'
  );
}

void main();
