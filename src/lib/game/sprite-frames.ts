/** UV rects on 256×256 atlas (pixel coords). */
export const ATLAS_SIZE = 256

export const FRAMES = {
    run: Array.from({ length: 6 }, (_, i) => ({ x: i * 32, y: 8, w: 32, h: 36 })),
    jump: { x: 192, y: 8, w: 24, h: 36 },
    duck: [
        { x: 0, y: 48, w: 36, h: 24 },
        { x: 40, y: 48, w: 36, h: 24 },
    ],
    crash: { x: 80, y: 48, w: 36, h: 28 },
    cactusShort: { x: 192, y: 48, w: 20, h: 32 },
    cactusTall: { x: 216, y: 48, w: 22, h: 40 },
    cactusCluster: { x: 236, y: 48, w: 20, h: 32 },
    bird: Array.from({ length: 4 }, (_, i) => ({ x: i * 16, y: 56, w: 16, h: 12 })),
    ground: { x: 0, y: 72, w: 64, h: 8 },
    duneNear: { x: 0, y: 88, w: 128, h: 24 },
    duneFar: { x: 0, y: 112, w: 64, h: 16 },
    cloud: { x: 140, y: 96, w: 32, h: 8 },
    sun: { x: 200, y: 88, w: 24, h: 24 },
    dust: Array.from({ length: 4 }, (_, i) => ({ x: 140 + i * 8, y: 96, w: 6, h: 6 })),
} as const

export type SpriteFrame = { x: number; y: number; w: number; h: number }

export function pickFrame(frames: readonly SpriteFrame[], index: number): SpriteFrame {
    const frame = frames[index] ?? frames[0]
    if (!frame) {
        return { x: 0, y: 0, w: 1, h: 1 }
    }
    return frame
}
