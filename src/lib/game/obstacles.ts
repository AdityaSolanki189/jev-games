import type { DifficultyTier, GameAction, ObstacleInstance, ObstacleKind } from '@/lib/game/types'
import { mulberry32 } from '@/lib/game/rng'

const OBSTACLE_DEFS: Record<
    ObstacleKind,
    { width: number; height: number; yOffset: number; idealAction: GameAction; label: string }
> = {
    cactus_short: { width: 18, height: 32, yOffset: 0, idealAction: 'JUMP', label: 'A short cactus on the ground' },
    cactus_tall: { width: 22, height: 48, yOffset: 0, idealAction: 'JUMP', label: 'A tall cactus on the ground' },
    cactus_cluster: {
        width: 38,
        height: 36,
        yOffset: 0,
        idealAction: 'JUMP',
        label: 'A cluster of cacti on the ground',
    },
    bird_low: { width: 28, height: 14, yOffset: 26, idealAction: 'DUCK', label: 'A low-flying bird' },
    bird_high: { width: 28, height: 14, yOffset: 50, idealAction: 'RUN', label: 'A high-flying bird' },
}

export function obstacleLabel(kind: ObstacleKind): string {
    return OBSTACLE_DEFS[kind].label
}

export function idealActionFor(kind: ObstacleKind): GameAction {
    return OBSTACLE_DEFS[kind].idealAction
}

export function gapForTier(tier: DifficultyTier, rng: () => number): number {
    const base = tier === 'easy' ? 420 : tier === 'medium' ? 340 : tier === 'hard' ? 280 : 220
    const jitter = (rng() - 0.5) * 80
    return Math.max(200, base + jitter)
}

function pickKind(tier: DifficultyTier, rng: () => number): ObstacleKind {
    const roll = rng()
    if (tier === 'easy') {
        if (roll < 0.5) return 'cactus_short'
        if (roll < 0.85) return 'cactus_tall'
        return 'cactus_cluster'
    }
    if (roll < 0.35) return 'cactus_short'
    if (roll < 0.55) return 'cactus_tall'
    if (roll < 0.7) return 'cactus_cluster'
    if (roll < 0.85) return 'bird_low'
    return 'bird_high'
}

let obstacleCounter = 0

export function spawnObstacle(kind: ObstacleKind, x: number): ObstacleInstance {
    const def = OBSTACLE_DEFS[kind]
    obstacleCounter += 1
    return {
        id: `obs-${obstacleCounter}`,
        kind,
        x,
        idealAction: def.idealAction,
        width: def.width,
        height: def.height,
        yOffset: def.yOffset,
        cleared: false,
        decisionSent: false,
    }
}

export function generateInitialStream(seed: number, tier: DifficultyTier, startX: number): ObstacleInstance[] {
    const rng = mulberry32(seed)
    const out: ObstacleInstance[] = []
    let x = startX
    for (let i = 0; i < 6; i++) {
        const kind = pickKind(tier, rng)
        out.push(spawnObstacle(kind, x))
        x += gapForTier(tier, rng)
    }
    return out
}

export function appendObstacle(seed: number, tier: DifficultyTier, lastX: number, index: number): ObstacleInstance {
    const rng = mulberry32(seed + index * 9973)
    const kind = pickKind(tier, rng)
    const gap = gapForTier(tier, rng)
    return spawnObstacle(kind, lastX + gap)
}

export function obstacleHitbox(obs: ObstacleInstance): { left: number; right: number; bottom: number; top: number } {
    const bottom = obs.yOffset
    const top = obs.yOffset + obs.height
    return { left: obs.x, right: obs.x + obs.width, bottom, top }
}
