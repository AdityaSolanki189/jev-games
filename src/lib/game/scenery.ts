import { BUSH_FRAMES, CLOUD_FRAMES, TREE_FRAMES, type ScenerySlotId } from '@/lib/game/sprite-manifest'
import { mulberry32 } from '@/lib/game/rng'
import { GROUND_Y, WORLD_WIDTH } from '@/lib/game/types'

export type SceneryKind = 'cloud' | 'tree' | 'bush'

export type SceneryProp = {
    id: string
    slot: SceneryKind
    variant: number
    /** Base world X before parallax (repeats on period). */
    baseX: number
    y: number
    z: number
    scale: number
}

const SCENERY_PERIOD = 2400
const VIEW_MARGIN = 120

type SlotRule = {
    slot: SceneryKind
    every: number
    y: number
    z: number
    scale: number
}

const RULES: SlotRule[] = [
    { slot: 'tree', every: 520, y: GROUND_Y, z: -0.35, scale: 1 },
    { slot: 'bush', every: 160, y: GROUND_Y, z: -0.2, scale: 1 },
    { slot: 'cloud', every: 280, y: GROUND_Y + 150, z: -0.8, scale: 1 },
    { slot: 'cloud', every: 420, y: GROUND_Y + 200, z: -0.85, scale: 1 },
]

function variantCount(slot: SceneryKind): number {
    if (slot === 'cloud') return CLOUD_FRAMES.length
    if (slot === 'tree') return TREE_FRAMES.length
    return BUSH_FRAMES.length
}

/**
 * Deterministic decorative props for the current scroll window.
 * `scrollX` is typically snapshot.distance (ground scroll).
 */
export function sceneryForWindow(seed: number, scrollX: number): SceneryProp[] {
    const rng = mulberry32(seed ^ 0x9e3779b9)
    const jitter = () => (rng() - 0.5) * 40

    const parallaxScroll = scrollX
    const windowStart = parallaxScroll - VIEW_MARGIN
    const windowEnd = parallaxScroll + WORLD_WIDTH + VIEW_MARGIN

    const out: SceneryProp[] = []
    const startPeriod = Math.floor(windowStart / SCENERY_PERIOD) - 1
    const endPeriod = Math.floor(windowEnd / SCENERY_PERIOD) + 1

    for (const rule of RULES) {
        for (let period = startPeriod; period <= endPeriod; period++) {
            const periodBase = period * SCENERY_PERIOD
            for (let x = periodBase; x < periodBase + SCENERY_PERIOD; x += rule.every) {
                const slotRng = mulberry32(seed + period * 10007 + x * 31 + rule.slot.charCodeAt(0))
                const count = Math.max(1, variantCount(rule.slot))
                const variant = Math.floor(slotRng() * count) % count
                const baseX = x + slotRng() * (rule.every * 0.35)
                const screenX = baseX - parallaxScroll * getSlotParallax(rule.slot)
                if (screenX < -VIEW_MARGIN || screenX > WORLD_WIDTH + VIEW_MARGIN) continue

                out.push({
                    id: `${rule.slot}-${period}-${Math.floor(baseX)}`,
                    slot: rule.slot,
                    variant,
                    baseX: baseX + jitter(),
                    y: rule.y + (slotRng() - 0.5) * 12,
                    z: rule.z,
                    scale: rule.scale * (0.85 + slotRng() * 0.3),
                })
            }
        }
    }

    return out
}

function getSlotParallax(slot: ScenerySlotId): number {
    const factors: Record<ScenerySlotId, number> = {
        sun: 0.02,
        duneFar: 0.12,
        duneNear: 0.28,
        cloud: 0.22,
        tree: 0.45,
        bush: 0.7,
        pebble: 1,
        ground: 1,
    }
    return factors[slot]
}

/** Screen X for a prop given ground scroll distance. */
export function sceneryScreenX(prop: SceneryProp, scrollX: number): number {
    const factor = getSlotParallax(prop.slot)
    let x = prop.baseX - scrollX * factor
    while (x < -VIEW_MARGIN) x += SCENERY_PERIOD
    while (x > WORLD_WIDTH + VIEW_MARGIN) x -= SCENERY_PERIOD
    return x
}
