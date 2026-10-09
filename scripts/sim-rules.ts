/**
 * Headless RULES controller — bird duck tests + 40-obstacle survival.
 * Run: pnpm exec tsx scripts/sim-rules.ts
 */
import { DinoEngine } from '../src/lib/game/engine'
import type { ObstacleKind } from '../src/lib/game/types'
import { spawnObstacle } from '../src/lib/game/obstacles'
import { INITIAL_OBSTACLE_START_X } from '../src/lib/game/types'
import { runnerRight } from '../src/lib/game/physics'

const DT_MS = 16
const TARGET_CLEARED = 40
const BIRD_GAP_PX = 640

const KINDS: ObstacleKind[] = ['cactus_short', 'cactus_tall', 'cactus_cluster', 'bird_low', 'bird_high']

function noopCallbacks() {
    return {
        onDecisionRequest: async () => {
            throw new Error('LAYA should not be called')
        },
        onLog: () => {},
        onStatsTick: () => {},
        onPhaseChange: () => {},
    }
}

function runUntil(maxSteps: number, engine: DinoEngine, onStep?: () => void) {
    for (let i = 0; i < maxSteps; i++) {
        if ((engine.phase as string) === 'crashed') return 'crashed'
        engine.step(DT_MS)
        onStep?.()
        const bird = engine.obstacles.find((o) => o.kind === 'bird_low')
        if (bird?.cleared) return 'cleared'
    }
    return 'timeout'
}

function testBirdDuckWithRules() {
    const engine = new DinoEngine('easy', 'RULES', 99_001, noopCallbacks())
    engine.phase = 'playing'
    engine.obstacles = [spawnObstacle('bird_low', INITIAL_OBSTACLE_START_X)]
    engine.lastObstacleX = INITIAL_OBSTACLE_START_X

    let sawDucking = false
    const result = runUntil(8000, engine, () => {
        if (engine.playerPose === 'ducking') sawDucking = true
    })

    if (result === 'crashed') {
        console.error('FAIL bird duck test: RULES crashed on bird_low')
        process.exit(1)
    }
    if (result !== 'cleared') {
        console.error(`FAIL bird duck test: expected clear, got ${result}`)
        process.exit(1)
    }
    if (!sawDucking) {
        console.error('FAIL bird duck test: bird cleared without ducking')
        process.exit(1)
    }
    console.log('OK — RULES ducked under bird_low')
}

function testBirdRunCrashes() {
    const engine = new DinoEngine('easy', 'RULES', 99_002, noopCallbacks())
    engine.phase = 'playing'
    const bird = spawnObstacle('bird_low', runnerRight() + 280)
    bird.decisionSent = true
    bird.move = 'RUN'
    bird.moveExecuted = true
    engine.obstacles = [bird]

    const result = runUntil(4000, engine)
    if (result !== 'crashed') {
        console.error(`FAIL bird RUN test: expected crash, got ${result}`)
        process.exit(1)
    }
    console.log('OK — RUN into bird_low crashes as expected')
}

function testFullRun() {
    let lastCrashKind: ObstacleKind | null = null

    const engine = new DinoEngine('easy', 'RULES', 42_001, {
        ...noopCallbacks(),
        onLog: (entry) => {
            if (entry.result === 'crash') lastCrashKind = entry.obstacleKind
        },
    })

    engine.phase = 'playing'
    engine.obstacles = []

    let x = INITIAL_OBSTACLE_START_X
    for (const kind of KINDS) {
        engine.obstacles.push(spawnObstacle(kind, x))
        x += BIRD_GAP_PX
    }
    engine.lastObstacleX = x
    engine.spawnIndex = 0

    let steps = 0
    const maxSteps = 120_000

    while (engine.cleared < TARGET_CLEARED && steps < maxSteps) {
        if ((engine.phase as string) === 'crashed') {
            console.error(`CRASH at step ${steps}, cleared ${engine.cleared}, kind ${lastCrashKind}`)
            process.exit(1)
        }
        engine.step(DT_MS)
        steps++
    }

    if (engine.cleared < TARGET_CLEARED) {
        console.error(`Timeout: only cleared ${engine.cleared}/${TARGET_CLEARED}`)
        process.exit(1)
    }

    console.log(`OK — RULES cleared ${engine.cleared} obstacles in ${steps} steps (${engine.elapsedMs}ms sim time)`)
}

testBirdDuckWithRules()
testBirdRunCrashes()
testFullRun()
