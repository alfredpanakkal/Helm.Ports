export interface LatLon {
  latitude: number;
  longitude: number;
}

export interface CountryGeometry {
  /** Mean port position [lon, lat] - the world-view dot. */
  center: [number, number];
  /** Bounding box [[west, south], [east, north]] for fitBounds. */
  bounds: [[number, number], [number, number]];
}

/**
 * Mean position and bounding box of a country's ports.
 *
 * When the longitude span exceeds 180 degrees the country crosses the
 * antimeridian (Russia, Fiji, USA with the Aleutians): negative longitudes
 * are shifted by +360 so the box stays contiguous on the far side of the
 * world instead of wrapping the whole globe. MapLibre accepts longitudes
 * up to 540.
 */
export function countryGeometry(ports: LatLon[]): CountryGeometry | null {
  if (ports.length === 0) return null;

  let w = Infinity;
  let e = -Infinity;
  let s = Infinity;
  let n = -Infinity;
  for (const p of ports) {
    if (p.longitude < w) w = p.longitude;
    if (p.longitude > e) e = p.longitude;
    if (p.latitude < s) s = p.latitude;
    if (p.latitude > n) n = p.latitude;
  }

  const crossesAntimeridian = e - w > 180;
  const lon = (x: number) => (crossesAntimeridian && x < 0 ? x + 360 : x);
  if (crossesAntimeridian) {
    w = Infinity;
    e = -Infinity;
    for (const p of ports) {
      const x = lon(p.longitude);
      if (x < w) w = x;
      if (x > e) e = x;
    }
  }

  let sumLon = 0;
  let sumLat = 0;
  for (const p of ports) {
    sumLon += lon(p.longitude);
    sumLat += p.latitude;
  }

  return {
    center: [sumLon / ports.length, sumLat / ports.length],
    bounds: [[w, s], [e, n]],
  };
}
