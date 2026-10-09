import { NextResponse } from 'next/server'
import { z } from 'zod'
import { callLayaSystemOne } from '@/lib/laya/client'
import { mockLayaResponse, randomDecision, rulesDecision } from '@/lib/game/controllers'
import type { GameAction, ObstacleKind } from '@/lib/game/types'

const bodySchema = z.object({
    warmup: z.boolean().optional(),
    controller: z.enum(['LAYA', 'RULES', 'RANDOM']).optional(),
    obstacleKind: z.enum(['cactus_short', 'cactus_tall', 'cactus_cluster', 'bird_low', 'bird_high']).optional(),
    request: z
        .object({
            state: z.object({
                player: z.string(),
                upcoming_obstacle: z.string(),
                distance_pixels: z.number(),
                speed_pixels_per_second: z.number(),
                time_to_collision_ms: z.number(),
                next_obstacle: z.string(),
            }),
            questions: z.object({
                move: z.object({
                    type: z.literal('choice'),
                    instructions: z.string(),
                    criteria: z.record(z.string(), z.string()),
                }),
            }),
        })
        .optional(),
})

export async function POST(req: Request) {
    const started = performance.now()
    let json: unknown
    try {
        json = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { warmup, controller, obstacleKind, request } = parsed.data

    if (warmup) {
        if (request && controller !== 'RULES' && controller !== 'RANDOM') {
            try {
                await callLayaSystemOne(request, { kind: 'warmup' })
            } catch (err) {
                return NextResponse.json(
                    {
                        warmed: false,
                        error: err instanceof Error ? err.message : 'Warmup failed',
                    },
                    { status: 502 },
                )
            }
        }
        return NextResponse.json({ warmed: true, roundTripMs: performance.now() - started })
    }

    if (!request) {
        return NextResponse.json({ error: 'request body required' }, { status: 400 })
    }

    if (controller === 'RULES') {
        const kind = (obstacleKind ?? 'cactus_short') as ObstacleKind
        const choice = rulesDecision(kind)
        const mock = mockLayaResponse(choice)
        return NextResponse.json({
            choice,
            probabilities: mock.answers.move.probabilities,
            inferenceMs: null,
            roundTripMs: performance.now() - started,
            response: mock,
        })
    }

    if (controller === 'RANDOM') {
        const choice = randomDecision(Math.random)
        const mock = mockLayaResponse(choice)
        return NextResponse.json({
            choice,
            probabilities: mock.answers.move.probabilities,
            inferenceMs: null,
            roundTripMs: performance.now() - started,
            response: mock,
        })
    }

    try {
        const result = await callLayaSystemOne(request, { kind: 'decision' })
        return NextResponse.json({
            choice: result.choice as GameAction,
            probabilities: result.probabilities,
            inferenceMs: result.inferenceMs,
            roundTripMs: performance.now() - started,
            response: result.raw,
        })
    } catch (err) {
        return NextResponse.json(
            {
                error: err instanceof Error ? err.message : 'Laya request failed',
            },
            { status: 502 },
        )
    }
}
