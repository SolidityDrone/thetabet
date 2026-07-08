type SearchResult = { title: string; url: string }

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchText(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'ThetaBet/1.0' },
      signal: controller.signal,
    })
    if (!res.ok) return ''
    const html = await res.text()
    return stripHtml(html)
  } catch {
    return ''
  } finally {
    clearTimeout(timeout)
  }
}

// DuckDuckGo HTML endpoint (no API key). Works from React Native (no CORS).
async function ddgSearch(query: string): Promise<SearchResult[]> {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const html = await fetchText(url, 8000)
  if (!html) return []

  // Very lightweight extraction: <a class="result__a" href="...">Title</a>
  const results: SearchResult[] = []
  const re = /<a[^>]+class=\"result__a\"[^>]+href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && results.length < 6) {
    const link = m[1]
    const title = stripHtml(m[2])
    if (!link || !title) continue
    results.push({ title, url: link })
  }
  return results
}

export type MatchResearchSource = { title: string; url: string; text: string }

export async function researchMatchWeb(matchTitle: string): Promise<MatchResearchSource[]> {
  const query = `${matchTitle} injuries lineup news head to head form`
  const hits = await ddgSearch(query)
  if (hits.length === 0) return []

  const pages = await Promise.all(
    hits.slice(0, 3).map(async (hit) => {
      const text = await fetchText(hit.url, 6000)
      return { title: hit.title, url: hit.url, text: text.slice(0, 1500) }
    })
  )

  return pages.filter((p) => p.text.length > 120)
}

