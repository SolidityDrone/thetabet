/** Encode avatar URLs — Azuro paths often contain spaces in team names. */
export function encodeAzuroImageUri(uri?: string | null): string | undefined {
  if (!uri?.trim()) return undefined
  try {
    return encodeURI(uri.trim())
  } catch {
    return uri.trim()
  }
}

/** Azuro has no league logos; use country flags where we can map slug → ISO code. */
const COUNTRY_FLAG_CODES: Record<string, string> = {
  argentina: 'ar',
  australia: 'au',
  austria: 'at',
  belgium: 'be',
  brazil: 'br',
  bulgaria: 'bg',
  chile: 'cl',
  china: 'cn',
  colombia: 'co',
  croatia: 'hr',
  czechia: 'cz',
  'czech-republic': 'cz',
  denmark: 'dk',
  ecuador: 'ec',
  egypt: 'eg',
  england: 'gb-eng',
  finland: 'fi',
  france: 'fr',
  germany: 'de',
  greece: 'gr',
  hungary: 'hu',
  iceland: 'is',
  india: 'in',
  indonesia: 'id',
  international: '',
  ireland: 'ie',
  israel: 'il',
  italy: 'it',
  japan: 'jp',
  mexico: 'mx',
  netherlands: 'nl',
  'northern-ireland': 'gb-nir',
  norway: 'no',
  paraguay: 'py',
  peru: 'pe',
  poland: 'pl',
  portugal: 'pt',
  romania: 'ro',
  russia: 'ru',
  scotland: 'gb-sct',
  serbia: 'rs',
  slovakia: 'sk',
  slovenia: 'si',
  'south-africa': 'za',
  'south-korea': 'kr',
  spain: 'es',
  sweden: 'se',
  switzerland: 'ch',
  turkey: 'tr',
  ukraine: 'ua',
  uruguay: 'uy',
  usa: 'us',
  wales: 'gb-wls',
}

export function getCountryFlagUri(countrySlug?: string | null): string | undefined {
  if (!countrySlug) return undefined
  const code = COUNTRY_FLAG_CODES[countrySlug.toLowerCase()]
  if (!code) return undefined
  return `https://flagcdn.com/w80/${code}.png`
}
