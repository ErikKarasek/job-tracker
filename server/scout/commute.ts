// Where Erik can get to without a car: Hradec Králové, where he lives, and Pardubice, 25 minutes
// by train. Anything else only when it is remote. Kept apart with no imports so the unit tests
// can load it with plain Node.
//
// City names, not regions: "Pardubický kraj" or "Královéhradecký kraj" alone says nothing about
// the commute (Trutnov and Ústí nad Orlicí are in them too), so a region-only posting does not pass.
const REACHABLE = /Hradec Králové|\bPardubice\b/i

/** Whether a posting is worth suggesting given where it is. Unknown places are kept. */
export function reachable(location: string | null, remote: boolean): boolean {
  if (remote) return true
  if (!location) return true
  return REACHABLE.test(location)
}

/** The Labour Office gives a postcode; its first three digits say the town. */
export function cityFromPsc(psc: string | number | null | undefined): string | null {
  const n = Number(String(psc ?? '').replace(/\s/g, '').slice(0, 3))
  if (n >= 500 && n <= 503) return 'Hradec Králové'
  if (n >= 530 && n <= 533) return 'Pardubice'
  return null
}
