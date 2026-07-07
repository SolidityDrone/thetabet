import { getPonderGraphqlCandidates } from '@/config/ponder-url'

type GraphQLResponse<T> = {
  data?: T
  errors?: Array<{ message: string }>
}

const PONDER_FETCH_TIMEOUT_MS = 5_000

async function postGraphql(
  ponderUrl: string,
  query: string,
  variables?: Record<string, unknown>
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PONDER_FETCH_TIMEOUT_MS)

  try {
    return await fetch(ponderUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

export async function ponderQuery<TData>(
  query: string,
  variables?: Record<string, unknown>
): Promise<TData> {
  const candidates = getPonderGraphqlCandidates()
  const failures: string[] = []

  for (const ponderUrl of candidates) {
    try {
      const response = await postGraphql(ponderUrl, query, variables)

      if (!response.ok) {
        failures.push(`${ponderUrl} → HTTP ${response.status}`)
        continue
      }

      const json = (await response.json()) as GraphQLResponse<TData>
      if (json.errors?.length) {
        throw new Error(json.errors[0]?.message ?? 'Indexer GraphQL error')
      }
      if (!json.data) {
        throw new Error('Indexer returned no data')
      }

      return json.data
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      if (reason.includes('Indexer GraphQL error') || reason.includes('Indexer returned no data')) {
        throw error
      }
      const label =
        reason === 'Aborted' || reason.includes('abort')
          ? 'timed out'
          : reason
      failures.push(`${ponderUrl} → ${label}`)
    }
  }

  throw new Error(
    `Cannot reach Ponder indexer. Tried:\n${failures.map((f) => `• ${f}`).join('\n')}\n` +
      'Run `npm run dev:stack:tunnel`, then `adb reverse tcp:42069 tcp:42069`, reload the app. ' +
      'If you changed Android networking, rebuild once: `cd apps/mobile && npx expo run:android`.'
  )
}
