declare module 'tz-lookup' {
  /**
   * Returns the IANA timezone name for the given latitude/longitude.
   * Returns 'Etc/GMT' for points without a defined zone (e.g., open ocean).
   * Throws if lat/lon are out of range.
   */
  export default function tzLookup(lat: number, lon: number): string;
}
