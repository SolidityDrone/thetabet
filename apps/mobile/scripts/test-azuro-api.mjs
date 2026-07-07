#!/usr/bin/env node
/**
 * Live smoke test against Azuro Polygon mainnet REST API.
 * Usage: node scripts/test-azuro-api.mjs
 */

const BASE = 'https://api.onchainfeed.org/api/v1/public'
const ENV = 'PolygonUSDT'

async function get(path, params) {
  const qs = new URLSearchParams({ environment: ENV, ...params })
  const url = `${BASE}${path}?${qs}`
  console.log('\nGET', url)
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  const text = await res.text()
  console.log('→', res.status, text.slice(0, 120).replace(/\n/g, ' '))
  if (!res.ok) throw new Error(`GET failed: ${text}`)
  return JSON.parse(text)
}

async function post(path, body) {
  const url = `${BASE}${path}`
  console.log('\nPOST', url)
  console.log('→ body', JSON.stringify(body))
  const res = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  console.log('→', res.status, text.slice(0, 120).replace(/\n/g, ' '))
  if (!res.ok) throw new Error(`POST failed: ${text}`)
  return JSON.parse(text)
}

async function main() {
  const prematch = await get('/market-manager/sports', {
    gameState: 'Prematch',
    sportSlug: 'football',
    numberOfGames: '10',
    orderBy: 'startsAt',
    orderDirection: 'asc',
  })

  const gameId =
    prematch.sports?.[0]?.countries?.[0]?.leagues?.[0]?.games?.[0]?.id ??
    '1006000000000077351978'

  console.log('\nUsing gameId', gameId)

  await get('/market-manager/navigation', { sportHub: 'sports' })

  await post('/market-manager/games-by-ids', { gameIds: [gameId] })

  await post('/market-manager/conditions-by-game-ids', {
    environment: ENV,
    gameIds: [gameId],
    extended: true,
  })

  console.log('\n✓ All Azuro API smoke tests passed')

  const condRes = await post('/market-manager/conditions-by-game-ids', {
    environment: ENV,
    gameIds: [gameId],
    extended: true,
  })
  const odd = condRes.conditions?.[0]?.outcomes?.[0]?.odds
  console.log('\nSample raw odds from API:', odd, '(expect decimal like "2.74")')
}

main().catch((error) => {
  console.error('\n✗', error.message)
  process.exit(1)
})
