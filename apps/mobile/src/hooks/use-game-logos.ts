import { resolveLeagueLogo, resolveTeamLogo } from '@/services/sports-media/logo-resolver'
import type { GameData } from '@azuro-org/toolkit'
import { useEffect, useState } from 'react'

export type GameLogos = {
  home?: string
  away?: string
  league?: string
  isLoading: boolean
}

export function useGameLogos(game?: GameData | null): GameLogos {
  const [logos, setLogos] = useState<GameLogos>({ isLoading: !!game })

  useEffect(() => {
    if (!game) {
      setLogos({ isLoading: false })
      return
    }

    let cancelled = false
    setLogos((current) => ({ ...current, isLoading: true }))

    const [homeParticipant, awayParticipant] = game.participants ?? []

    Promise.all([
      resolveTeamLogo(homeParticipant?.name),
      resolveTeamLogo(awayParticipant?.name),
      resolveLeagueLogo(game.league?.name, game.country?.name, game.country?.slug),
    ])
      .then(([home, away, league]) => {
        if (cancelled) return
        setLogos({ home, away, league, isLoading: false })
      })
      .catch(() => {
        if (cancelled) return
        setLogos({ isLoading: false })
      })

    return () => {
      cancelled = true
    }
  }, [
    game?.id,
    game?.participants,
    game?.league?.name,
    game?.country?.name,
    game?.country?.slug,
  ])

  return logos
}

export function useLeagueLogo(
  leagueName?: string,
  countryName?: string,
  countrySlug?: string
) {
  const [logoUri, setLogoUri] = useState<string | undefined>()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    resolveLeagueLogo(leagueName, countryName, countrySlug)
      .then((uri) => {
        if (!cancelled) {
          setLogoUri(uri)
          setIsLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [leagueName, countryName, countrySlug])

  return { logoUri, isLoading }
}
