import tzlookup from "@photostructure/tz-lookup";

/**
 * Synchronous local-time label for a port, e.g. "12:15 LT (UTC+3)".
 * The IANA zone comes from the bundled @photostructure/tz-lookup
 * dataset (no API call, no async); the clock and UTC offset come from
 * the browser Intl.DateTimeFormat. Returns null when the lookup fails
 * so callers hide the field instead of showing a placeholder.
 */
export function localTimeLabel(lat: number, lng: number): string | null {
  try {
    const zone = tzlookup(lat, lng);
    const now = new Date();
    const clock = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hourCycle: "h23",
      hour: "numeric",
      minute: "numeric",
    }).format(now);
    const offset =
      new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        timeZoneName: "shortOffset",
      })
        .formatToParts(now)
        .find((part) => part.type === "timeZoneName")?.value ?? "UTC";
    return clock + " LT (" + offset.replace("GMT", "UTC") + ")";
  } catch {
    return null;
  }
}
