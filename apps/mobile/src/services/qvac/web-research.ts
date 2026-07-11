export type SearchHit = { title: string; url: string; site: string }

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Google favicon service — same approach as Perplexity / search UIs. */
export function faviconUrl(site: string, size = 32): string {
  const host = site.replace(/^www\./, '').split('/')[0]
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`
}

// DuckDuckGo wraps result links behind /l/?uddg=<real-url> redirects.
function normalizeDdgUrl(href: string): string {
  try {
    let u = href
    if (u.startsWith('//')) u = `https:${u}`
    const parsed = new URL(u)
    if (parsed.hostname.endsWith('duckduckgo.com') && parsed.pathname.startsWith('/l/')) {
      const uddg = parsed.searchParams.get('uddg')
      if (uddg) return decodeURIComponent(uddg)
    }
    return u
  } catch {
    return href
  }
}

async function fetchRaw(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'ThetaBet/1.0' },
      signal: controller.signal,
    })
    if (!res.ok) return ''
    return await res.text()
  } catch {
    return ''
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchPageText(url: string, timeoutMs = 6000): Promise<string> {
  const html = await fetchRaw(url, timeoutMs)
  return html ? stripHtml(html) : ''
}

// DuckDuckGo HTML endpoint (no API key). Works from React Native (no CORS).
export async function ddgSearch(query: string, maxResults = 5): Promise<SearchHit[]> {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const html = await fetchRaw(url, 8000)
  if (!html) return []

  const results: SearchHit[] = []
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && results.length < maxResults) {
    const link = normalizeDdgUrl(m[1])
    const title = stripHtml(m[2])
    if (!link || !title) continue
    results.push({ title, url: link, site: siteOf(link) })
  }
  return results
}
