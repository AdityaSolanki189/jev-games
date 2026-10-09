import type { ObstacleInstance } from '@/lib/game/types'
import { GROUND_Y, NOSE_X } from '@/lib/game/types'

/** Logical runner hitbox (inset inside sprite). */
export const RUNNER_STAND_H = 38
export const RUNNER_DUCK_H = 20
export const RUNNER_W = 34
export const RUNNER_LEFT = NOSE_X - 6

/** Jump tuned so feet stay above a 48px cactus through full overlap at easy speed (160 px/s). */
export const JUMP_DURATION_MS = 880
export const JUMP_PEAK = 72

const HITBOX_INSET_X = 3
const HITBOX_INSET_Y = 4

export function runnerRight(): number {
    return RUNNER_LEFT + RUNNER_W
}

export function timeToHitboxContactMs(obs: ObstacleInstance, speedPxPerSec: number): number {
    if (speedPxPerSec <= 0) return Number.POSITIVE_INFINITY
    const gap = obs.x - runnerRight()
    if (gap <= 0) return 0
    return (gap / speedPxPerSec) * 1000
}

/** Time from jump start until feet are above `obstacleTop` on the rise phase. */
export function jumpRiseTimeMs(obstacleTop: number): number {
    const ratio = Math.min(1, Math.max(0, obstacleTop / JUMP_PEAK))
    return (Math.asin(ratio) / Math.PI) * JUMP_DURATION_MS
}

/** Latest game-time ms (before contact) at which a jump can still clear this obstacle at `speed`. */
export function latestJumpStartLeadMs(obs: ObstacleInstance, speedPxPerSec: number): number {
    const rise = jumpRiseTimeMs(obs.height - HITBOX_INSET_Y)
    const passageMs = ((RUNNER_W + obs.width - HITBOX_INSET_X * 2) / speedPxPerSec) * 1000
    const clearWindow = clearDurationAboveMs(obs.height - HITBOX_INSET_Y)
    const extra = Math.max(0, passageMs - clearWindow) * 0.5
    return rise + 40 + extra
}

export function clearDurationAboveMs(obstacleTop: number): number {
    const ratio = Math.min(1, Math.max(0, obstacleTop / JUMP_PEAK))
    const t1 = Math.asin(ratio) / Math.PI
    const t2 = 1 - t1
    return (t2 - t1) * JUMP_DURATION_MS
}

export function jumpOffsetAt(elapsedSinceJumpMs: number): number {
    if (elapsedSinceJumpMs <= 0 || elapsedSinceJumpMs >= JUMP_DURATION_MS) return 0
    const t = elapsedSinceJumpMs / JUMP_DURATION_MS
    return Math.sin(t * Math.PI) * JUMP_PEAK
}

export function obstacleHitboxLogical(obs: ObstacleInstance): {
    left: number
    right: number
    bottom: number
    top: number
} {
    const base = GROUND_Y + obs.yOffset
    return {
        left: obs.x + HITBOX_INSET_X,
        right: obs.x + obs.width - HITBOX_INSET_X,
        bottom: base + HITBOX_INSET_Y,
        top: base + obs.height - HITBOX_INSET_Y,
    }
}

export function runnerHitboxLogical(params: {
    pose: 'running' | 'airborne' | 'ducking' | 'crashed'
    jumpOffset: number
}): { left: number; right: number; bottom: number; top: number } {
    const h = params.pose === 'ducking' ? RUNNER_DUCK_H : RUNNER_STAND_H
    const bottom = GROUND_Y + params.jumpOffset
    const top = bottom + h
    return {
        left: RUNNER_LEFT,
        right: RUNNER_LEFT + RUNNER_W,
        bottom,
        top,
    }
}

export const DUCK_START_LEAD_MS = 220
