export type GameAction = 'JUMP' | 'DUCK' | 'RUN'

export type ObstacleKind = 'cactus_short' | 'cactus_tall' | 'cactus_cluster' | 'bird_low' | 'bird_high'

export type DifficultyTier = 'easy' | 'medium' | 'hard' | 'insane'

export type ControllerMode = 'LAYA' | 'RULES' | 'RANDOM'

export type GamePhase = 'warming_up' | 'playing' | 'crashed' | 'restarting'

export type PlayerPose = 'running' | 'airborne' | 'ducking' | 'crashed'

export type DecisionResult = 'on_time' | 'late' | 'wrong' | 'miss' | 'crash'

export interface Hitbox {
    x: number
    y: number
    w: number
    h: number
}

export interface ObstacleInstance {
    id: string
    kind: ObstacleKind
    x: number
    idealAction: GameAction
    width: number
    height: number
    yOffset: number
    cleared: boolean
    decisionSent: boolean
}

export interface PendingDecision {
    obstacleId: string
    sentAtMs: number
    deadlineMs: number
    ttcMs: number
    requestPayload: LayaDecisionRequest
}

export interface LayaDecisionRequest {
    state: {
        player: string
        upcoming_obstacle: string
        distance_pixels: number
        speed_pixels_per_second: number
        time_to_collision_ms: number
        next_obstacle: string
    }
    questions: {
        move: {
            type: 'choice'
            instructions: string
            criteria: Record<GameAction, string>
        }
    }
}

export interface LayaDecisionResponse {
    answers: {
        move: {
            type: 'choice'
            choice: GameAction
            probabilities: Partial<Record<GameAction, number>>
        }
    }
}

export interface DecisionLogEntry {
    id: string
    runId: string
    timestamp: number
    obstacleKind: ObstacleKind
    idealAction: GameAction
    chosenAction: GameAction | null
    probabilities: Partial<Record<GameAction, number>> | null
    e2eMs: number | null
    inferenceMs: number | null
    deadlineMs: number
    result: DecisionResult
    request: LayaDecisionRequest | null
    response: unknown | null
    separator?: boolean
    separatorLabel?: string
}

export interface GameSnapshot {
    distance: number
    score: number
    speed: number
    tier: DifficultyTier
    phase: GamePhase
    playerPose: PlayerPose
    playerY: number
    jumpProgress: number
    runFrame: number
    obstacles: ObstacleInstance[]
    currentAction: GameAction | null
    remainingDecisionMs: number | null
    cameraShake: number
    flashAlpha: number
    showSpeedLines: boolean
    dustEvents: { x: number; frame: number }[]
}

export const TIER_SPEED: Record<DifficultyTier, number> = {
    easy: 250,
    medium: 350,
    hard: 450,
    insane: 600,
}

export const NOSE_X = 96
export const SENSOR_RANGE_PX = 400
export const JUMP_LEAD_MS = 180
export const GROUND_Y = 0
export const WORLD_HEIGHT = 180
export const WORLD_WIDTH = 900
