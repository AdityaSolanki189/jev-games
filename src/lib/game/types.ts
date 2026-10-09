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
    /** Set when AI responds in time; executed in the game loop at the physical window. */
    move: GameAction | null
    moveExecuted: boolean
    /** Latest ms after detection to receive a decision that can still be executed. */
    maneuverDeadlineMs: number
}

export interface PendingDecision {
    obstacleId: string
    sentAtMs: number
    deadlineMs: number
    ttcMs: number
    speedPxPerSec: number
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

export type LiveCallStatus = 'idle' | 'waiting' | 'answered'

export interface LiveDecisionCall {
    status: LiveCallStatus
    controller: ControllerMode
    obstacleLabel: string
    question: string
    chosenAction: GameAction | null
    probabilities: Partial<Record<GameAction, number>> | null
    e2eMs: number | null
    inferenceMs: number | null
    deadlineMs: number
    remainingMs: number | null
    result: DecisionResult | null
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
    seed: number
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
    liveCall: LiveDecisionCall
    duckBlend: number
}

export const TIER_SPEED: Record<DifficultyTier, number> = {
    easy: 160,
    medium: 240,
    hard: 340,
    insane: 480,
}

export const NOSE_X = 96
export const SENSOR_RANGE_BY_TIER: Record<DifficultyTier, number> = {
    easy: 600,
    medium: 520,
    hard: 440,
    insane: 360,
}
export const GROUND_Y = 48
export const WORLD_HEIGHT = 300
export const WORLD_WIDTH = 960
/** First obstacle spawns beyond sensor + margin so warmup can finish first. */
export const INITIAL_OBSTACLE_START_X = NOSE_X + SENSOR_RANGE_BY_TIER.easy + 320
