import type { DifficultyTier, ObstacleKind } from '@/lib/game/types'
import { WORLD_HEIGHT, WORLD_WIDTH } from '@/lib/game/types'
import meta from '../../../public/sprites/cactus/meta.json'
import birdMeta from '../../../public/sprites/birds/meta.json'
import sceneryMeta from '../../../public/sprites/scenery-meta.json'

export type SpriteAnchor = 'feet' | 'center'

export type SpriteSheetDef = {
    id: string
    url: string
    width: number
    height: number
    /** Use linear filtering for soft illustration assets (not pixel art). */
    smooth?: boolean
}

export type ManifestFrame = {
    sheet: string
    x: number
    y: number
    w: number
    h: number
    displayW: number
    displayH: number
    anchor: SpriteAnchor
}

export type ScenerySlotId = 'ground' | 'duneFar' | 'duneNear' | 'cloud' | 'tree' | 'bush' | 'pebble' | 'sun'

const baseSheets = [
    { id: 'atlas', url: '/sprites/atlas.png', width: 512, height: 512 },
    {
        id: 'cactusShort',
        url: '/sprites/cactus/short.png',
        width: meta.short.width,
        height: meta.short.height,
        smooth: true,
    },
    {
        id: 'cactusTall',
        url: '/sprites/cactus/tall.png',
        width: meta.tall.width,
        height: meta.tall.height,
        smooth: true,
    },
    {
        id: 'cactusCluster',
        url: '/sprites/cactus/cluster.png',
        width: meta.cluster.width,
        height: meta.cluster.height,
        smooth: true,
    },
    {
        id: 'cactusBush',
        url: '/sprites/cactus/bush.png',
        width: meta.bush.width,
        height: meta.bush.height,
        smooth: true,
    },
    {
        id: 'cactusTree',
        url: '/sprites/cactus/tree.png',
        width: meta.tree.width,
        height: meta.tree.height,
        smooth: true,
    },
    {
        id: 'bird0',
        url: '/sprites/birds/frame-1.png',
        width: birdMeta['frame-1'].width,
        height: birdMeta['frame-1'].height,
        smooth: true,
    },
    {
        id: 'bird1',
        url: '/sprites/birds/frame-2.png',
        width: birdMeta['frame-2'].width,
        height: birdMeta['frame-2'].height,
        smooth: true,
    },
    {
        id: 'bird2',
        url: '/sprites/birds/frame-3.png',
        width: birdMeta['frame-3'].width,
        height: birdMeta['frame-3'].height,
        smooth: true,
    },
    {
        id: 'bird3',
        url: '/sprites/birds/frame-4.png',
        width: birdMeta['frame-4'].width,
        height: birdMeta['frame-4'].height,
        smooth: true,
    },
] as const

const scenerySheets: SpriteSheetDef[] = [
    {
        id: 'sky',
        url: '/sprites/sky/sky.jpg',
        width: sceneryMeta.sky.width,
        height: sceneryMeta.sky.height,
        smooth: true,
    },
    {
        id: 'groundTile',
        url: '/sprites/ground/tile.png',
        width: sceneryMeta.ground.width,
        height: sceneryMeta.ground.height,
    },
    ...sceneryMeta.clouds.map((cloud) => ({
        id: cloud.id,
        url: `/sprites/clouds/${cloud.id}.png`,
        width: cloud.width,
        height: cloud.height,
        smooth: true,
    })),
    ...sceneryMeta.plants.map((plant) => ({
        id: plant.id,
        url: `/sprites/plants/${plant.id}.png`,
        width: plant.width,
        height: plant.height,
    })),
]

export const SHEETS: readonly SpriteSheetDef[] = [...baseSheets, ...scenerySheets]

export const SKY_BY_TIER: Record<DifficultyTier, string> = {
    easy: '#f7f3ea',
    medium: '#f5ebe0',
    hard: '#e8dcc8',
    insane: '#3d3832',
}

/** Parallax scroll factor (1 = moves with ground). */
export const SCENERY_PARALLAX: Record<ScenerySlotId, number> = {
    sun: 0.02,
    duneFar: 0.12,
    duneNear: 0.28,
    cloud: 0.22,
    tree: 0.45,
    bush: 0.7,
    pebble: 1,
    ground: 1,
}

const atlas = 'atlas'

function feet(x: number, y: number, w: number, h: number, displayW: number, displayH: number): ManifestFrame {
    return { sheet: atlas, x, y, w, h, displayW, displayH, anchor: 'feet' }
}

function center(x: number, y: number, w: number, h: number, displayW: number, displayH: number): ManifestFrame {
    return { sheet: atlas, x, y, w, h, displayW, displayH, anchor: 'center' }
}

function fullSheet(
    sheet: string,
    w: number,
    h: number,
    displayW: number,
    displayH: number,
    anchor: SpriteAnchor = 'feet',
): ManifestFrame {
    return { sheet, x: 0, y: 0, w, h, displayW, displayH, anchor }
}

export const SKY_FRAME = fullSheet(
    'sky',
    sceneryMeta.sky.width,
    sceneryMeta.sky.height,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    'center',
)

export const GROUND_TILE_FRAME = fullSheet(
    'groundTile',
    sceneryMeta.ground.width,
    sceneryMeta.ground.height,
    sceneryMeta.ground.displayW,
    sceneryMeta.ground.displayH,
)

export const CLOUD_FRAMES: ManifestFrame[] = sceneryMeta.clouds.map((cloud) =>
    fullSheet(cloud.id, cloud.width, cloud.height, cloud.displayW, cloud.displayH, 'center'),
)

export const TREE_FRAMES: ManifestFrame[] = sceneryMeta.plants
    .filter((plant) => plant.role === 'tree')
    .map((plant) => fullSheet(plant.id, plant.width, plant.height, plant.displayW, plant.displayH))

export const BUSH_FRAMES: ManifestFrame[] = sceneryMeta.plants
    .filter((plant) => plant.role === 'bush')
    .map((plant) => fullSheet(plant.id, plant.width, plant.height, plant.displayW, plant.displayH))

/** Frame keys referenced by clips and scenery. */
export const FRAMES = {
    dinoRun0: feet(8, 8, 44, 47, 44, 47),
    dinoRun1: feet(56, 8, 44, 47, 44, 47),
    dinoRun2: feet(104, 8, 44, 47, 44, 47),
    dinoRun3: feet(152, 8, 44, 47, 44, 47),
    dinoIdle: feet(8, 8, 44, 47, 44, 47),
    dinoJump: feet(296, 8, 44, 47, 44, 47),
    dinoFall: feet(296, 8, 44, 47, 44, 47),
    dinoDuck0: feet(8, 64, 52, 30, 52, 30),
    dinoDuck1: feet(68, 64, 52, 30, 52, 30),
    dinoDead: feet(128, 64, 52, 36, 52, 36),
    cactusShort: fullSheet('cactusShort', meta.short.width, meta.short.height, 32, 48),
    cactusTall: fullSheet('cactusTall', meta.tall.width, meta.tall.height, 40, 70),
    cactusCluster: fullSheet('cactusCluster', meta.cluster.width, meta.cluster.height, 72, 52),
    bird0: fullSheet('bird0', birdMeta['frame-1'].width, birdMeta['frame-1'].height, 64, 51, 'center'),
    bird1: fullSheet('bird1', birdMeta['frame-2'].width, birdMeta['frame-2'].height, 64, 51, 'center'),
    bird2: fullSheet('bird2', birdMeta['frame-3'].width, birdMeta['frame-3'].height, 64, 51, 'center'),
    bird3: fullSheet('bird3', birdMeta['frame-4'].width, birdMeta['frame-4'].height, 64, 51, 'center'),
    ground: feet(8, 184, 64, 12, 64, 12),
    duneFar: feet(8, 204, 256, 20, 256, 20),
    duneNear: feet(8, 232, 128, 28, 128, 28),
    cloud: center(280, 184, 46, 14, 46, 14),
    sun: center(340, 184, 28, 28, 28, 28),
    dust0: center(200, 64, 8, 8, 16, 16),
    dust1: center(210, 64, 8, 8, 16, 16),
    dust2: center(220, 64, 8, 8, 16, 16),
    dust3: center(230, 64, 8, 8, 16, 16),
    tree: fullSheet('cactusTree', meta.tree.width, meta.tree.height, 44, 64),
    bush: fullSheet('cactusBush', meta.bush.width, meta.bush.height, 36, 28),
    pebble: center(200, 64, 6, 4, 8, 6),
} as const satisfies Record<string, ManifestFrame>

export type FrameKey = keyof typeof FRAMES

export const CLIPS = {
    dino: {
        idle: ['dinoIdle'] as const,
        run: ['dinoRun0', 'dinoRun1', 'dinoRun2', 'dinoRun3'] as const,
        jump: ['dinoJump'] as const,
        fall: ['dinoFall'] as const,
        duck: ['dinoDuck0', 'dinoDuck1'] as const,
        dead: ['dinoDead'] as const,
    },
    bird: {
        flap: ['bird0', 'bird1', 'bird2', 'bird3'] as const,
    },
    fx: {
        dust: ['dust0', 'dust1', 'dust2', 'dust3'] as const,
        crash: ['dinoDead'] as const,
    },
} as const

export const SCENERY_FRAME: Record<ScenerySlotId, FrameKey> = {
    ground: 'ground',
    duneFar: 'duneFar',
    duneNear: 'duneNear',
    cloud: 'cloud',
    tree: 'tree',
    bush: 'bush',
    pebble: 'pebble',
    sun: 'sun',
}

export const OBSTACLE_FRAME: Record<ObstacleKind, FrameKey> = {
    cactus_short: 'cactusShort',
    cactus_tall: 'cactusTall',
    cactus_cluster: 'cactusCluster',
    bird_low: 'bird0',
    bird_high: 'bird0',
}

export function getFrame(key: FrameKey): ManifestFrame {
    return FRAMES[key]
}

export function getSheet(sheetId: string): SpriteSheetDef {
    const sheet = SHEETS.find((s) => s.id === sheetId)
    const fallback = SHEETS[0]
    if (!sheet) {
        if (!fallback) {
            return { id: 'atlas', url: '/sprites/atlas.png', width: 512, height: 512 }
        }
        return fallback
    }
    return sheet
}

export function pickClipFrame(clip: readonly FrameKey[], index: number): ManifestFrame {
    const key = clip[((index % clip.length) + clip.length) % clip.length] ?? clip[0]
    if (!key) {
        return FRAMES.dinoIdle
    }
    return FRAMES[key]
}

/** Dust clip length in animation steps (80ms per step in engine). */
export const DUST_CLIP_FRAMES = CLIPS.fx.dust.length
export const DUST_EVENT_TTL_MS = DUST_CLIP_FRAMES * 80
