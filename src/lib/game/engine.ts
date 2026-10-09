import {
    acceptableActions,
    appendObstacle,
    generateInitialStream,
    isAcceptableAction,
    obstacleHitbox,
    obstacleLabel,
} from '@/lib/game/obstacles'
import { buildLayaRequest, randomDecision, rulesDecision } from '@/lib/game/controllers'
import { mulberry32, randomSeed } from '@/lib/game/rng'
import {
    DUCK_START_LEAD_MS,
    JUMP_DURATION_MS,
    jumpOffsetAt,
    latestJumpStartLeadMs,
    RUNNER_LEFT,
    runnerHitboxLogical,
    runnerRight,
    timeToHitboxContactMs,
} from '@/lib/game/physics'
import type {
    ControllerMode,
    DecisionLogEntry,
    DecisionResult,
    DifficultyTier,
    GameAction,
    GamePhase,
    GameSnapshot,
    LayaDecisionRequest,
    LiveDecisionCall,
    ObstacleInstance,
    PendingDecision,
    PlayerPose,
} from '@/lib/game/types'
import { DUST_EVENT_TTL_MS } from '@/lib/game/sprite-manifest'
import { INITIAL_OBSTACLE_START_X, NOSE_X, SENSOR_RANGE_BY_TIER, TIER_SPEED } from '@/lib/game/types'

const DUCK_BLEND_IN_MS = 120
const DUCK_BLEND_OUT_MS = 80

function idleLiveCall(controller: ControllerMode): LiveDecisionCall {
    return {
        status: 'idle',
        controller,
        obstacleLabel: '',
        question: '',
        chosenAction: null,
        probabilities: null,
        e2eMs: null,
        inferenceMs: null,
        deadlineMs: 0,
        remainingMs: null,
        result: null,
    }
}

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
    onFrame: (snapshot: GameSnapshot) => void
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
    duckHoldObstacleId: string | null = null
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
    /** Per-run decision counters (reset each life). */
    decisionsSent = 0
    decisionsOnTime = 0
    /** Session-wide latency samples (survive crash / restart). */
    sessionLatencies: number[] = []
    sessionInferenceLatencies: number[] = []
    sessionDecisionsSent = 0
    sessionDecisionsOnTime = 0
    private lastStatsAt = 0
    private animationId: number | null = null
    private lastFrame = 0
    liveCall: LiveDecisionCall
    duckBlend = 0

    constructor(tier: DifficultyTier, controller: ControllerMode, seed: number | null, callbacks: EngineCallbacks) {
        this.tier = tier
        this.controller = controller
        this.seed = seed ?? randomSeed()
        this.runId = `run-${Date.now()}`
        this.speed = TIER_SPEED[tier]
        this.rng = mulberry32(this.seed)
        this.callbacks = callbacks
        this.liveCall = idleLiveCall(controller)
        this.resetWorld()
    }

    resetWorld() {
        this.obstacles = generateInitialStream(this.seed, this.tier, INITIAL_OBSTACLE_START_X)
        this.lastObstacleX = this.obstacles[this.obstacles.length - 1]?.x ?? INITIAL_OBSTACLE_START_X
        this.distance = 0
        this.score = 0
        this.cleared = 0
        this.elapsedMs = 0
        this.decisionsSent = 0
        this.decisionsOnTime = 0
        this.speed = TIER_SPEED[this.tier]
        this.playerPose = 'running'
        this.jumpStartedAt = null
        this.duckStartedAt = null
        this.crashStartedAt = null
        this.duckHoldObstacleId = null
        this.pending = null
        this.currentAction = null
        this.remainingDecisionMs = null
        this.cameraShake = 0
        this.flashAlpha = 0
        this.dustEvents = []
        this.duckBlend = 0
        this.liveCall = idleLiveCall(this.controller)
    }

    resetSessionStats() {
        this.sessionLatencies = []
        this.sessionInferenceLatencies = []
        this.sessionDecisionsSent = 0
        this.sessionDecisionsOnTime = 0
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

    private sensorRange(): number {
        return SENSOR_RANGE_BY_TIER[this.currentTier()]
    }

    private playerStateLabel(): string {
        if (this.playerPose === 'airborne') return 'Airborne'
        if (this.playerPose === 'ducking') return 'Ducking'
        if (this.playerPose === 'crashed') return 'Crashed'
        return 'Running on the ground'
    }

    private effectivePose(): PlayerPose {
        if (this.shouldStayDucked(this.speed)) return 'ducking'
        return this.playerPose
    }

    private runnerHitbox(): { left: number; right: number; bottom: number; top: number } {
        const pose = this.effectivePose()
        return runnerHitboxLogical({
            pose: pose === 'crashed' ? 'running' : pose,
            jumpOffset: pose === 'airborne' ? this.getJumpOffset() : 0,
        })
    }

    getJumpOffset(): number {
        if (this.jumpStartedAt === null) return 0
        return jumpOffsetAt(this.elapsedMs - this.jumpStartedAt)
    }

    private effectiveSpeed(): number {
        return this.speed
    }

    step(dtMs: number) {
        if (this.phase === 'warming_up') return

        if (this.phase === 'crashed') {
            this.callbacks.onFrame(this.getSnapshot())
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

        this.updatePlayerAnimation()
        this.updateDuckBlend(dtMs)
        this.pruneDustEvents()
        this.checkDecisions(speed)
        this.processObstacleMoves(speed)
        this.updateDuckHold()
        this.checkCollisions()
        this.markCleared()

        this.callbacks.onFrame(this.getSnapshot())

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

    private updateDuckBlend(dtMs: number) {
        const duckTarget = this.effectivePose() === 'ducking' ? 1 : 0
        const blendMs = duckTarget === 1 ? DUCK_BLEND_IN_MS : DUCK_BLEND_OUT_MS
        const step = dtMs / blendMs
        if (duckTarget > this.duckBlend) {
            this.duckBlend = Math.min(1, this.duckBlend + step)
        } else {
            this.duckBlend = Math.max(0, this.duckBlend - step)
        }
    }

    private updatePlayerAnimation() {
        if (this.jumpStartedAt !== null) {
            const t = this.elapsedMs - this.jumpStartedAt
            if (t >= JUMP_DURATION_MS) {
                this.jumpStartedAt = null
                if (this.playerPose === 'airborne') {
                    this.playerPose = 'running'
                    this.dustEvents.push({ x: NOSE_X, frame: 0, born: this.elapsedMs })
                }
            } else {
                this.playerPose = 'airborne'
            }
        }
    }

    private pruneDustEvents() {
        this.dustEvents = this.dustEvents.filter((d) => this.elapsedMs - d.born < DUST_EVENT_TTL_MS)
    }

    private shouldStayDucked(_speed: number): boolean {
        for (const obs of this.obstacles) {
            if (obs.cleared || obs.move !== 'DUCK') continue
            if (obs.x + obs.width < RUNNER_LEFT - 4) continue
            if (obs.x > runnerRight() + 80) continue
            return true
        }
        return false
    }

    private updateDuckHold() {
        if (this.playerPose !== 'ducking') return
        if (!this.shouldStayDucked(this.speed)) {
            this.releaseDuck()
        }
    }

    private releaseDuck() {
        this.duckHoldObstacleId = null
        this.duckStartedAt = null
        if (this.playerPose === 'ducking') this.playerPose = 'running'
    }

    private startJump() {
        if (this.shouldStayDucked(this.speed)) return
        if (this.playerPose === 'airborne' || this.jumpStartedAt !== null) return
        this.jumpStartedAt = this.elapsedMs
        this.playerPose = 'airborne'
        this.dustEvents.push({ x: NOSE_X, frame: 0, born: this.elapsedMs })
    }

    private startDuckFor(obstacleId: string) {
        if (this.playerPose === 'airborne') {
            this.jumpStartedAt = null
            this.playerPose = 'running'
        }
        this.duckHoldObstacleId = obstacleId
        this.duckStartedAt = this.elapsedMs
        this.playerPose = 'ducking'
    }

    private processObstacleMoves(speed: number) {
        const contactMsFor = (obs: ObstacleInstance) => timeToHitboxContactMs(obs, speed)

        for (const obs of this.obstacles) {
            if (obs.cleared || obs.move !== 'DUCK' || obs.moveExecuted) continue
            const contactMs = contactMsFor(obs)
            const duckLead = DUCK_START_LEAD_MS + 180
            const notPassed = obs.x + obs.width >= RUNNER_LEFT - 4
            if (notPassed && contactMs <= duckLead) {
                this.currentAction = 'DUCK'
                this.startDuckFor(obs.id)
                obs.moveExecuted = true
            }
        }

        for (const obs of this.obstacles) {
            if (obs.cleared || obs.move === null || obs.moveExecuted) continue
            const contactMs = contactMsFor(obs)

            if (obs.move === 'RUN') {
                if (contactMs <= 0) {
                    obs.moveExecuted = true
                    this.currentAction = 'RUN'
                }
                continue
            }

            if (obs.move === 'JUMP') {
                if (this.shouldStayDucked(speed)) continue
                const lead = latestJumpStartLeadMs(obs, speed)
                if (contactMs <= lead) {
                    this.currentAction = 'JUMP'
                    this.startJump()
                    obs.moveExecuted = true
                }
            }
        }
    }

    private nextObstacleLabel(after: ObstacleInstance): string {
        const next = this.obstacles.filter((o) => !o.cleared && o.x > after.x + 20).sort((a, b) => a.x - b.x)[0]
        return next ? obstacleLabel(next.kind) : 'none'
    }

    private maneuverLeadMs(obs: ObstacleInstance, speed: number, action: GameAction): number {
        if (action === 'JUMP') return latestJumpStartLeadMs(obs, speed)
        if (action === 'DUCK') return DUCK_START_LEAD_MS + 80
        return 100
    }

    /** Strictest response window among acceptable actions (for UI while waiting). */
    private maneuverDeadlineMs(obs: ObstacleInstance, speed: number, distanceToContact: number): number {
        const ttcContact = (distanceToContact / speed) * 1000
        const actions = acceptableActions(obs.kind)
        let minDeadline = Number.POSITIVE_INFINITY
        for (const action of actions) {
            const deadline = Math.max(0, ttcContact - this.maneuverLeadMs(obs, speed, action))
            minDeadline = Math.min(minDeadline, deadline)
        }
        return Number.isFinite(minDeadline) ? minDeadline : Math.max(0, ttcContact - 100)
    }

    private responseDeadlineMs(obs: ObstacleInstance, ttcMs: number, speed: number, choice: GameAction): number {
        return Math.max(0, ttcMs - this.maneuverLeadMs(obs, speed, choice))
    }

    private checkDecisions(speed: number) {
        const range = this.sensorRange()
        for (const obs of this.obstacles) {
            if (obs.decisionSent || obs.cleared) continue
            const distanceToContact = obs.x - runnerRight()
            if (distanceToContact > range) continue
            if (distanceToContact <= 0) continue

            obs.decisionSent = true
            const ttcMs = (distanceToContact / speed) * 1000
            const deadlineMs = this.maneuverDeadlineMs(obs, speed, distanceToContact)
            obs.maneuverDeadlineMs = deadlineMs

            const request = buildLayaRequest({
                player: this.playerStateLabel(),
                upcomingKind: obs.kind,
                distancePx: distanceToContact,
                speed,
                ttcMs,
                nextLabel: this.nextObstacleLabel(obs),
            })

            this.pending = {
                obstacleId: obs.id,
                sentAtMs: this.elapsedMs,
                deadlineMs,
                ttcMs,
                speedPxPerSec: speed,
                requestPayload: request,
            }
            this.remainingDecisionMs = deadlineMs
            this.decisionsSent += 1
            this.sessionDecisionsSent += 1

            this.liveCall = {
                status: 'waiting',
                controller: this.controller,
                obstacleLabel: request.state.upcoming_obstacle,
                question: request.questions.move.instructions,
                chosenAction: null,
                probabilities: null,
                e2eMs: null,
                inferenceMs: null,
                deadlineMs,
                remainingMs: deadlineMs,
                result: null,
            }

            if (this.controller === 'RULES' || this.controller === 'RANDOM') {
                this.resolveDecisionSync(obs, request, deadlineMs)
            } else {
                void this.resolveDecisionAsync(obs, request, deadlineMs)
            }
        }

        if (this.pending) {
            const elapsed = this.elapsedMs - this.pending.sentAtMs
            this.remainingDecisionMs = Math.max(0, this.pending.deadlineMs - elapsed)
        } else {
            this.remainingDecisionMs = null
        }
    }

    private resolveDecisionSync(obs: ObstacleInstance, request: LayaDecisionRequest, deadlineMs: number) {
        const choice = this.controller === 'RULES' ? rulesDecision(obs.kind) : randomDecision(this.rng)
        const probabilities = this.controller === 'RULES' ? { [choice]: 1 } : { JUMP: 0.33, DUCK: 0.33, RUN: 0.34 }
        const response = this.controller === 'RULES' ? { local: 'RULES', choice } : { local: 'RANDOM', choice }
        this.applyDecisionOutcome(obs, request, deadlineMs, choice, probabilities, null, null, response)
    }

    private async resolveDecisionAsync(obs: ObstacleInstance, request: LayaDecisionRequest, deadlineMs: number) {
        const sentWall = performance.now()
        try {
            const res = await this.callbacks.onDecisionRequest({
                obstacle: obs,
                request,
                deadlineMs,
                ttcMs: request.state.time_to_collision_ms,
            })
            this.applyDecisionOutcome(
                obs,
                request,
                deadlineMs,
                res.choice,
                res.probabilities,
                res.e2eMs,
                res.inferenceMs,
                res.response,
            )
        } catch (err) {
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
                result: 'miss',
                request,
                response: String(err),
            })
            if (this.pending?.obstacleId === obs.id) this.pending = null
        }
    }

    private applyDecisionOutcome(
        obs: ObstacleInstance,
        request: LayaDecisionRequest,
        deadlineMs: number,
        choice: GameAction,
        probabilities: Partial<Record<GameAction, number>>,
        e2eMs: number | null,
        inferenceMs: number | null,
        response: unknown,
    ) {
        const sentAt = this.pending?.sentAtMs ?? this.elapsedMs
        const responseElapsed = this.elapsedMs - sentAt
        const speedAtSend = this.pending?.speedPxPerSec ?? this.effectiveSpeed()
        const ttcAtSend = this.pending?.ttcMs ?? 0
        const deadlineForChoice = this.responseDeadlineMs(obs, ttcAtSend, speedAtSend, choice)
        const onTime = responseElapsed <= deadlineForChoice

        let result: DecisionResult
        const liveObs = this.obstacles.find((o) => o.id === obs.id)

        if (!onTime) {
            result = 'late'
        } else if (!isAcceptableAction(obs.kind, choice)) {
            result = 'wrong'
            if (liveObs) liveObs.move = choice
        } else {
            result = 'on_time'
            this.decisionsOnTime += 1
            this.sessionDecisionsOnTime += 1
            if (e2eMs !== null) this.sessionLatencies.push(e2eMs)
            if (inferenceMs !== null) this.sessionInferenceLatencies.push(inferenceMs)
            if (liveObs) liveObs.move = choice
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
            deadlineMs: deadlineForChoice,
            result,
            request,
            response,
        })

        if (this.pending?.obstacleId === obs.id) this.pending = null

        const isLaya = this.controller === 'LAYA'
        this.liveCall = {
            status: 'answered',
            controller: this.controller,
            obstacleLabel: request.state.upcoming_obstacle,
            question: request.questions.move.instructions,
            chosenAction: choice,
            probabilities: isLaya ? probabilities : null,
            e2eMs: isLaya ? e2eMs : null,
            inferenceMs: isLaya ? inferenceMs : null,
            deadlineMs: deadlineForChoice,
            remainingMs: null,
            result,
        }
    }

    private checkCollisions() {
        if (this.playerPose === 'crashed') return
        const player = this.runnerHitbox()
        for (const obs of this.obstacles) {
            if (obs.cleared) continue
            const box = obstacleHitbox(obs)
            const obsRight = obs.x + obs.width
            if (obsRight < NOSE_X - 10) continue

            const overlapX = player.right > box.left && player.left < box.right
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
        this.cameraShake = 0
        this.flashAlpha = 0
        this.callbacks.onPhaseChange(this.phase)
        this.callbacks.onLog({
            id: `sep-${Date.now()}`,
            runId: this.runId,
            timestamp: Date.now(),
            obstacleKind: obs.kind,
            idealAction: obs.idealAction,
            chosenAction: this.currentAction,
            probabilities: null,
            e2eMs: null,
            inferenceMs: null,
            deadlineMs: 0,
            result: 'miss',
            request: null,
            response: null,
            separator: true,
            separatorLabel: `Run ended — survival ${this.formatTime(this.elapsedMs)} — seed ${this.seed}`,
        })
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
        const sent = this.sessionDecisionsSent
        if (sent === 0) return 100
        return Math.round((this.sessionDecisionsOnTime / sent) * 100)
    }

    getSnapshot(): GameSnapshot {
        const tier = this.currentTier()
        return {
            seed: this.seed,
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
            liveCall: {
                ...this.liveCall,
                remainingMs: this.liveCall.status === 'waiting' ? this.remainingDecisionMs : this.liveCall.remainingMs,
            },
            duckBlend: this.duckBlend,
        }
    }
}
