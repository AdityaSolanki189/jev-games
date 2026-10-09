import { GROUND_Y } from '@/lib/game/types'
import type { ObstacleInstance } from '@/lib/game/types'
import { RUNNER_DUCK_H, RUNNER_STAND_H } from '@/lib/game/physics'

/** Visual-only bird size and feet Y (hitboxes unchanged). */
export function birdVisual(obs: ObstacleInstance): { displayW: number; displayH: number; feetY: number } {
    if (obs.kind === 'bird_low') {
        return {
            displayW: 36,
            displayH: 28,
            feetY: GROUND_Y + RUNNER_DUCK_H + 4,
        }
    }
    if (obs.kind === 'bird_high') {
        return {
            displayW: 40,
            displayH: 22,
            feetY: GROUND_Y + RUNNER_STAND_H + 10,
        }
    }
    return {
        displayW: 36,
        displayH: 28,
        feetY: GROUND_Y + obs.yOffset + obs.height,
    }
}
