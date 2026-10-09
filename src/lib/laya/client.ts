import { config } from '@/lib/config/server'
import type { LayaDecisionRequest, LayaDecisionResponse, GameAction } from '@/lib/game/types'

export interface LayaCallResult {
    choice: GameAction
    probabilities: Partial<Record<GameAction, number>>
    inferenceMs: number | null
    raw: LayaDecisionResponse
}

export interface LayaCallOptions {
    kind?: 'warmup' | 'decision'
}

const SYSTEMONE_SUFFIX = '/v1/systemone'

export function resolveLayaSystemOneUrl(baseUrl: string): string {
    const trimmed = baseUrl.replace(/\/$/, '')
    if (trimmed.endsWith(SYSTEMONE_SUFFIX)) {
        return trimmed
    }
    return `${trimmed}${SYSTEMONE_SUFFIX}`
}

export async function callLayaSystemOne(
    request: LayaDecisionRequest,
    options: LayaCallOptions = {},
): Promise<LayaCallResult> {
    const url = resolveLayaSystemOneUrl(config.laya.baseUrl)
    const kind = options.kind ?? 'decision'
    const started = performance.now()

    console.log('[laya] → POST', url, {
        kind,
        upcoming_obstacle: request.state.upcoming_obstacle,
        time_to_collision_ms: request.state.time_to_collision_ms,
        distance_pixels: request.state.distance_pixels,
        questionKeys: Object.keys(request.questions),
    })

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.laya.apiKey}`,
        },
        body: JSON.stringify(request),
        cache: 'no-store',
    })

    const roundTripMs = performance.now() - started
    const inferenceHeader = res.headers.get('X-Inference-Time-Ms')
    const inferenceMs = inferenceHeader ? Number.parseFloat(inferenceHeader) : null

    if (!res.ok) {
        const text = await res.text()
        console.log('[laya] ← error', {
            kind,
            status: res.status,
            roundTripMs: Math.round(roundTripMs),
            bodyPreview: text.slice(0, 300),
        })
        throw new Error(`Laya HTTP ${res.status}: ${text.slice(0, 500)}`)
    }

    const data = (await res.json()) as LayaDecisionResponse
    const choice = data.answers?.move?.choice
    if (choice !== 'JUMP' && choice !== 'DUCK' && choice !== 'RUN') {
        console.log('[laya] ← invalid choice', { kind, roundTripMs: Math.round(roundTripMs), data })
        throw new Error('Invalid choice from Laya')
    }

    console.log('[laya] ← ok', {
        kind,
        status: res.status,
        roundTripMs: Math.round(roundTripMs),
        inferenceMs: Number.isFinite(inferenceMs) ? inferenceMs : null,
        choice,
        probabilities: data.answers.move.probabilities,
    })

    return {
        choice,
        probabilities: data.answers.move.probabilities ?? {},
        inferenceMs: Number.isFinite(inferenceMs) ? inferenceMs : null,
        raw: data,
    }
}
