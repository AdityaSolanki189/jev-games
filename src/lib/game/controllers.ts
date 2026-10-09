import type { GameAction, LayaDecisionRequest, LayaDecisionResponse, ObstacleKind } from '@/lib/game/types'
import { idealActionFor, obstacleLabel } from '@/lib/game/obstacles'

export function rulesDecision(kind: ObstacleKind): GameAction {
    return idealActionFor(kind)
}

export function randomDecision(rng: () => number): GameAction {
    const actions: GameAction[] = ['JUMP', 'DUCK', 'RUN']
    const idx = Math.floor(rng() * actions.length)
    return actions[idx] ?? 'RUN'
}

export function mockLayaResponse(choice: GameAction): LayaDecisionResponse {
    const probs: Partial<Record<GameAction, number>> = { JUMP: 0.05, DUCK: 0.05, RUN: 0.05 }
    probs[choice] = 0.85
    return {
        answers: {
            move: {
                type: 'choice',
                choice,
                probabilities: probs,
            },
        },
    }
}

export function buildLayaRequest(params: {
    player: string
    upcomingKind: ObstacleKind
    distancePx: number
    speed: number
    ttcMs: number
    nextLabel: string
}): LayaDecisionRequest {
    const { player, upcomingKind, distancePx, speed, ttcMs, nextLabel } = params
    return {
        state: {
            player,
            upcoming_obstacle: obstacleLabel(upcomingKind),
            distance_pixels: Math.round(distancePx),
            speed_pixels_per_second: Math.round(speed),
            time_to_collision_ms: Math.round(ttcMs),
            next_obstacle: nextLabel,
        },
        questions: {
            move: {
                type: 'choice',
                instructions:
                    'Choose the safest action for the running dinosaur. Jump over ground obstacles, duck under low flying obstacles, and run straight when the path is clear. Choose one action.',
                criteria: {
                    JUMP: 'Leap over an obstacle on the ground',
                    DUCK: 'Crouch beneath a low flying obstacle',
                    RUN: 'Continue running without jumping or ducking',
                },
            },
        },
    }
}
