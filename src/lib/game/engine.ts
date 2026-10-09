import { appendObstacle, generateInitialStream, obstacleHitbox, obstacleLabel } from '@/lib/game/obstacles'
import { randomDecision, rulesDecision } from '@/lib/game/controllers'
import { mulberry32, randomSeed } from '@/lib/game/rng'
import type {
    ControllerMode,
    DecisionLogEntry,
    DecisionResult,
    DifficultyTier,
    GameAction,
    GamePhase,
    GameSnapshot,
    LayaDecisionRequest,
    ObstacleInstance,
    PendingDecision,
    PlayerPose,
} from '@/lib/game/types'
import { GROUND_Y, JUMP_LEAD_MS, NOSE_X, SENSOR_RANGE_PX, TIER_SPEED, WORLD_WIDTH } from '@/lib/game/types'
import { buildLayaRequest } from '@/lib/game/controllers'

const RUNNER_STAND_H = 44
const RUNNER_DUCK_H = 22
const RUNNER_W = 40
const JUMP_DURATION_MS = 520
const JUMP_PEAK = 58
const DUCK_DURATION_MS = 420
const DUCK_SPEED_MULT = 0.85
const CRASH_DURATION_MS = 1200

export interface EngineCallbacks {
    onDecisionRequest: (payload: {
        obstacle: ObstacleInstance
        request: LayaDecisionRequest
        deadlineMs: number
        ttcMs: number
    }) => Promise<{
        choice: GameAction
        probabilities: Partial<Record<GameAction, number>>
        e2eMs: number
        inferenceMs: number | null
        response: unknown
        error?: string
    }>
    onLog: (entry: DecisionLogEntry) => void
    onStatsTick: (snapshot: Partial<GameSnapshot>) => void
    onPhaseChange: (phase: GamePhase) => void
}

export class DinoEngine {
    seed: number
    runId: string
    tier: DifficultyTier
    controller: ControllerMode
    phase: GamePhase = 'warming_up'
    obstacles: ObstacleInstance[] = []
    distance = 0
    score = 0
    cleared = 0
    speed: number
    elapsedMs = 0
    playerPose: PlayerPose = 'running'
    jumpStartedAt: number | null = null
    duckStartedAt: number | null = null
    crashStartedAt: number | null = null
    scheduledAction: { action: GameAction; executeAtMs: number } | null = null
    pending: PendingDecision | null = null
    currentAction: GameAction | null = null
    remainingDecisionMs: number | null = null
    cameraShake = 0
    flashAlpha = 0
    runFrame = 0
    dustEvents: { x: number; frame: number; born: number }[] = []
    spawnIndex = 6
    lastObstacleX = 0
    rng: () => number
    callbacks: EngineCallbacks
    decisionsSent = 0
    decisionsOnTime = 0
    latencies: number[] = []
    inferenceLatencies: number[] = []
    private lastStatsAt = 0
    private animationId: number | null = null
    private lastFrame = 0

    constructor(tier: DifficultyTier, controller: ControllerMode, seed: number | null, callbacks: EngineCallbacks) {
        this.tier = tier
        this.controller = controller
        this.seed = seed ?? randomSeed()
        this.runId = `run-${Date.now()}`
        this.speed = TIER_SPEED[tier]
        this.rng = mulberry32(this.seed)
        this.callbacks = callbacks
        this.resetWorld()
    }

    resetWorld() {
        this.obstacles = generateInitialStream(this.seed, this.tier, WORLD_WIDTH + 80)
        this.lastObstacleX = this.obstacles[this.obstacles.length - 1]?.x ?? WORLD_WIDTH
        this.distance = 0
        this.score = 0
        this.cleared = 0
        this.elapsedMs = 0
        this.decisionsSent = 0
        this.decisionsOnTime = 0
        this.latencies = []
        this.inferenceLatencies = []
        this.speed = TIER_SPEED[this.tier]
        this.playerPose = 'running'
        this.jumpStartedAt = null
        this.duckStartedAt = null
        this.crashStartedAt = null
        this.scheduledAction = null
        this.pending = null
        this.currentAction = null
        this.remainingDecisionMs = null
        this.cameraShake = 0
        this.flashAlpha = 0
        this.dustEvents = []
    }

    setTier(tier: DifficultyTier) {
        this.tier = tier
        this.speed = TIER_SPEED[tier]
        this.resetWorld()
    }

    setController(controller: ControllerMode) {
        this.controller = controller
    }

    setSeed(seed: number) {
        this.seed = seed
        this.rng = mulberry32(seed)
        this.spawnIndex = 6
        this.resetWorld()
    }

    async warmup() {
        this.phase = 'warming_up'
        this.callbacks.onPhaseChange(this.phase)
        try {
            const dummy = this.obstacles[0]
            if (dummy) {
                const req = buildLayaRequest({
                    player: 'Running on the ground',
                    upcomingKind: dummy.kind,
                    distancePx: SENSOR_RANGE_PX,
                    speed: this.speed,
                    ttcMs: (SENSOR_RANGE_PX / this.speed) * 1000,
                    nextLabel: 'none',
                })
                await this.callbacks.onDecisionRequest({
                    obstacle: dummy,
                    request: req,
                    deadlineMs: 9999,
                    ttcMs: 9999,
                })
            }
        } catch {
            /* warmup failure is logged by client */
        }
        this.phase = 'playing'
        this.callbacks.onPhaseChange(this.phase)
    }

    start() {
        this.lastFrame = performance.now()
        const tick = (now: number) => {
            const dt = Math.min(32, now - this.lastFrame)
            this.lastFrame = now
            this.step(dt)
            this.animationId = requestAnimationFrame(tick)
        }
        this.animationId = requestAnimationFrame(tick)
    }

    stop() {
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId)
            this.animationId = null
        }
    }

    private playerStateLabel(): string {
        if (this.playerPose === 'airborne') return 'Airborne'
        if (this.playerPose === 'ducking') return 'Ducking'
        if (this.playerPose === 'crashed') return 'Crashed'
        return 'Running on the ground'
    }

    private runnerHitbox(): { left: number; right: number; bottom: number; top: number } {
        const h = this.playerPose === 'ducking' ? RUNNER_DUCK_H : RUNNER_STAND_H
        const jumpY = this.getJumpOffset()
        const bottom = GROUND_Y + jumpY
        const top = bottom + h
        return { left: NOSE_X - 8, right: NOSE_X + RUNNER_W, bottom, top }
    }

    getJumpOffset(): number {
        if (this.jumpStartedAt === null) return 0
        const t = (this.elapsedMs - this.jumpStartedAt) / JUMP_DURATION_MS
        if (t >= 1) return 0
        return Math.sin(t * Math.PI) * JUMP_PEAK
    }

    private effectiveSpeed(): number {
        if (this.playerPose === 'ducking' && this.duckStartedAt !== null) {
            const duckT = this.elapsedMs - this.duckStartedAt
            if (duckT < DUCK_DURATION_MS) return this.speed * DUCK_SPEED_MULT
        }
        return this.speed
    }

    step(dtMs: number) {
        if (this.phase === 'warming_up') return

        if (this.phase === 'crashed') {
            if (this.crashStartedAt !== null && this.elapsedMs - this.crashStartedAt >= CRASH_DURATION_MS) {
                this.restartRun()
            }
            this.elapsedMs += dtMs
            this.cameraShake = Math.max(0, this.cameraShake - dtMs * 0.02)
            this.flashAlpha = Math.max(0, this.flashAlpha - dtMs * 0.003)
            return
        }

        if (this.phase !== 'playing') return

        const speed = this.effectiveSpeed()
        const dx = (speed * dtMs) / 1000
        this.distance += dx
        this.score = Math.floor(this.distance / 2)
        this.elapsedMs += dtMs
        this.runFrame += dx * 0.08

        for (const obs of this.obstacles) {
            obs.x -= dx
        }

        this.obstacles = this.obstacles.filter((o) => o.x > -120)
        while (this.obstacles.length < 8) {
            const next = appendObstacle(this.seed, this.currentTier(), this.lastObstacleX, this.spawnIndex)
            this.spawnIndex += 1
            this.lastObstacleX = next.x
            this.obstacles.push(next)
        }

        this.updatePlayerAnimation(dtMs)
        this.processScheduledActions()
        this.checkDecisions(speed)
        this.checkCollisions()
        this.markCleared()

        if (this.elapsedMs - this.lastStatsAt > 250) {
            this.lastStatsAt = this.elapsedMs
            this.callbacks.onStatsTick(this.getSnapshot())
        }
    }

    private currentTier(): DifficultyTier {
        const steps = Math.floor(this.cleared / 8)
        const order: DifficultyTier[] = ['easy', 'medium', 'hard', 'insane']
        const startIdx = order.indexOf(this.tier)
        const idx = Math.min(order.length - 1, startIdx + steps)
        const tier = order[idx] ?? 'insane'
        this.speed = TIER_SPEED[tier]
        return tier
    }

    private updatePlayerAnimation(_dtMs: number) {
        if (this.jumpStartedAt !== null) {
            const t = this.elapsedMs - this.jumpStartedAt
            if (t >= JUMP_DURATION_MS) {
                this.jumpStartedAt = null
                if (this.playerPose === 'airborne') this.playerPose = 'running'
            } else {
                this.playerPose = 'airborne'
            }
        }
        if (this.duckStartedAt !== null) {
            const t = this.elapsedMs - this.duckStartedAt
            if (t >= DUCK_DURATION_MS) {
                this.duckStartedAt = null
                if (this.playerPose === 'ducking') this.playerPose = 'running'
            }
        }
    }

    private processScheduledActions() {
        if (!this.scheduledAction) return
        if (this.elapsedMs >= this.scheduledAction.executeAtMs) {
            this.applyAction(this.scheduledAction.action)
            this.scheduledAction = null
        }
    }

    private applyAction(action: GameAction) {
        this.currentAction = action
        if (action === 'JUMP' && this.playerPose !== 'airborne' && this.jumpStartedAt === null) {
            this.jumpStartedAt = this.elapsedMs
            this.playerPose = 'airborne'
            this.dustEvents.push({ x: NOSE_X, frame: 0, born: this.elapsedMs })
        } else if (action === 'DUCK' && this.playerPose === 'running') {
            this.duckStartedAt = this.elapsedMs
            this.playerPose = 'ducking'
        }
    }

    private nextObstacleLabel(after: ObstacleInstance): string {
        const next = this.obstacles.filter((o) => !o.cleared && o.x > after.x + 20).sort((a, b) => a.x - b.x)[0]
        return next ? obstacleLabel(next.kind) : 'none'
    }

    private checkDecisions(speed: number) {
        for (const obs of this.obstacles) {
            if (obs.decisionSent || obs.cleared) continue
            const distanceToNose = obs.x - NOSE_X
            if (distanceToNose > SENSOR_RANGE_PX) continue
            if (distanceToNose <= 0) continue

            obs.decisionSent = true
            const ttcMs = (distanceToNose / speed) * 1000
            const deadlineMs = ttcMs - JUMP_LEAD_MS
            const request = buildLayaRequest({
                player: this.playerStateLabel(),
                upcomingKind: obs.kind,
                distancePx: distanceToNose,
                speed,
                ttcMs,
                nextLabel: this.nextObstacleLabel(obs),
            })

            this.pending = {
                obstacleId: obs.id,
                sentAtMs: this.elapsedMs,
                deadlineMs,
                ttcMs,
                requestPayload: request,
            }
            this.remainingDecisionMs = deadlineMs
            this.decisionsSent += 1

            void this.resolveDecision(obs, request, deadlineMs, ttcMs)
        }

        if (this.pending) {
            const elapsed = this.elapsedMs - this.pending.sentAtMs
            this.remainingDecisionMs = Math.max(0, this.pending.deadlineMs - elapsed)
        } else {
            this.remainingDecisionMs = null
        }
    }

    private async resolveDecision(
        obs: ObstacleInstance,
        request: LayaDecisionRequest,
        deadlineMs: number,
        ttcMs: number,
    ) {
        const sentWall = performance.now()
        let choice: GameAction | null = null
        let probabilities: Partial<Record<GameAction, number>> | null = null
        let inferenceMs: number | null = null
        let response: unknown = null
        let result: DecisionResult = 'miss'
        let e2eMs: number | null = null

        try {
            if (this.controller === 'RULES') {
                choice = rulesDecision(obs.kind)
                probabilities = { [choice]: 1 }
                response = { local: 'RULES', choice }
                e2eMs = 0
            } else if (this.controller === 'RANDOM') {
                choice = randomDecision(this.rng)
                probabilities = { JUMP: 0.33, DUCK: 0.33, RUN: 0.34 }
                response = { local: 'RANDOM', choice }
                e2eMs = 0
            } else {
                const res = await this.callbacks.onDecisionRequest({
                    obstacle: obs,
                    request,
                    deadlineMs,
                    ttcMs,
                })
                choice = res.choice
                probabilities = res.probabilities
                inferenceMs = res.inferenceMs
                response = res.response
                e2eMs = res.e2eMs
            }
        } catch (err) {
            result = 'miss'
            this.callbacks.onLog({
                id: `log-${obs.id}`,
                runId: this.runId,
                timestamp: Date.now(),
                obstacleKind: obs.kind,
                idealAction: obs.idealAction,
                chosenAction: null,
                probabilities: null,
                e2eMs: performance.now() - sentWall,
                inferenceMs: null,
                deadlineMs,
                result,
                request,
                response: String(err),
            })
            this.pending = null
            return
        }

        const responseElapsed = this.elapsedMs - (this.pending?.sentAtMs ?? this.elapsedMs)
        const onTime = responseElapsed <= deadlineMs

        if (!onTime) {
            result = 'late'
        } else if (choice !== obs.idealAction) {
            result = 'wrong'
            this.applyAction(choice)
        } else {
            result = 'on_time'
            this.decisionsOnTime += 1
            if (e2eMs !== null) this.latencies.push(e2eMs)
            if (inferenceMs !== null) this.inferenceLatencies.push(inferenceMs)

            const executeAt = this.elapsedMs + Math.max(0, ttcMs - JUMP_LEAD_MS - responseElapsed)
            if (choice === 'RUN') {
                this.currentAction = 'RUN'
            } else {
                this.scheduledAction = { action: choice, executeAtMs: executeAt }
            }
        }

        this.callbacks.onLog({
            id: `log-${obs.id}-${Date.now()}`,
            runId: this.runId,
            timestamp: Date.now(),
            obstacleKind: obs.kind,
            idealAction: obs.idealAction,
            chosenAction: choice,
            probabilities,
            e2eMs,
            inferenceMs,
            deadlineMs,
            result,
            request,
            response,
        })

        this.pending = null
    }

    private checkCollisions() {
        if (this.playerPose === 'crashed') return
        const player = this.runnerHitbox()
        for (const obs of this.obstacles) {
            if (obs.cleared) continue
            const box = obstacleHitbox(obs)
            const obsLeft = obs.x
            const obsRight = obs.x + obs.width
            if (obsRight < NOSE_X - 10) continue

            const overlapX = player.right > obsLeft && player.left < obsRight
            const overlapY = player.top > box.bottom && player.bottom < box.top
            if (overlapX && overlapY) {
                this.triggerCrash(obs)
                return
            }
        }
    }

    private triggerCrash(obs: ObstacleInstance) {
        this.phase = 'crashed'
        this.playerPose = 'crashed'
        this.crashStartedAt = this.elapsedMs
        this.cameraShake = 1
        this.flashAlpha = 0.6
        this.callbacks.onPhaseChange(this.phase)
        this.callbacks.onLog({
            id: `crash-${obs.id}`,
            runId: this.runId,
            timestamp: Date.now(),
            obstacleKind: obs.kind,
            idealAction: obs.idealAction,
            chosenAction: this.currentAction,
            probabilities: null,
            e2eMs: null,
            inferenceMs: null,
            deadlineMs: 0,
            result: 'crash',
            request: null,
            response: null,
        })
    }

    private markCleared() {
        for (const obs of this.obstacles) {
            if (!obs.cleared && obs.x + obs.width < NOSE_X - 20) {
                obs.cleared = true
                this.cleared += 1
            }
        }
    }

    private restartRun() {
        this.callbacks.onLog({
            id: `sep-${Date.now()}`,
            runId: this.runId,
            timestamp: Date.now(),
            obstacleKind: 'cactus_short',
            idealAction: 'RUN',
            chosenAction: null,
            probabilities: null,
            e2eMs: null,
            inferenceMs: null,
            deadlineMs: 0,
            result: 'miss',
            request: null,
            response: null,
            separator: true,
            separatorLabel: `Run ended — survival ${this.formatTime(this.elapsedMs)} — new seed ${this.seed + 1}`,
        })
        this.seed += 1
        this.runId = `run-${Date.now()}`
        this.spawnIndex = 6
        this.resetWorld()
        this.phase = 'playing'
        this.callbacks.onPhaseChange(this.phase)
    }

    formatTime(ms: number): string {
        const s = Math.floor(ms / 1000)
        const m = Math.floor(s / 60)
        const rs = s % 60
        return `${String(m).padStart(2, '0')}:${String(rs).padStart(2, '0')}`
    }

    median(nums: number[]): number {
        if (nums.length === 0) return 0
        const sorted = [...nums].sort((a, b) => a - b)
        const mid = Math.floor(sorted.length / 2)
        if (sorted.length % 2 === 0) {
            const lo = sorted[mid - 1]
            const hi = sorted[mid]
            if (lo === undefined || hi === undefined) return 0
            return (lo + hi) / 2
        }
        return sorted[mid] ?? 0
    }

    deadlineSuccessRate(): number {
        if (this.decisionsSent === 0) return 100
        return Math.round((this.decisionsOnTime / this.decisionsSent) * 100)
    }

    getSnapshot(): GameSnapshot {
        const tier = this.currentTier()
        return {
            distance: this.distance,
            score: this.score,
            speed: this.effectiveSpeed(),
            tier,
            phase: this.phase,
            playerPose: this.playerPose,
            playerY: this.getJumpOffset(),
            jumpProgress: this.jumpStartedAt ? (this.elapsedMs - this.jumpStartedAt) / JUMP_DURATION_MS : 0,
            runFrame: this.runFrame,
            obstacles: [...this.obstacles],
            currentAction: this.currentAction,
            remainingDecisionMs: this.remainingDecisionMs,
            cameraShake: this.cameraShake,
            flashAlpha: this.flashAlpha,
            showSpeedLines: tier === 'insane',
            dustEvents: this.dustEvents.map((d) => ({ x: d.x, frame: Math.floor((this.elapsedMs - d.born) / 80) })),
        }
    }
}
