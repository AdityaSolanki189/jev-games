'use client'

import { useCallback, useEffect, useRef } from 'react'
import { DinoEngine } from '@/lib/game/engine'
import type { ControllerMode, DifficultyTier, GameAction, LayaDecisionRequest } from '@/lib/game/types'
import { useGameStore } from '@/lib/game/store'
import { DinoGame } from '@/components/dino/dino-game'
import { PerformancePanel } from '@/components/dino/performance-panel'
import { DecisionLog } from '@/components/dino/decision-log'

const WARMUP_REQUEST: LayaDecisionRequest = {
    state: {
        player: 'Running on the ground',
        upcoming_obstacle: 'A tall cactus on the ground',
        distance_pixels: 400,
        speed_pixels_per_second: 250,
        time_to_collision_ms: 1600,
        next_obstacle: 'none',
    },
    questions: {
        move: {
            type: 'choice',
            instructions: 'Warmup',
            criteria: { JUMP: '', DUCK: '', RUN: '' },
        },
    },
}

async function fetchDecision(
    controller: ControllerMode,
    request: LayaDecisionRequest,
    obstacleKind: string,
    warmup = false,
) {
    const started = performance.now()
    console.log('[decide/client] → POST /api/decide', {
        controller,
        warmup,
        obstacleKind,
        upcoming: request.state.upcoming_obstacle,
        time_to_collision_ms: request.state.time_to_collision_ms,
    })

    const res = await fetch('/api/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ controller, request, obstacleKind, warmup }),
    })
    const data = await res.json()
    const e2eMs = performance.now() - started

    console.log('[decide/client] ←', {
        controller,
        warmup,
        status: res.status,
        e2eMs: Math.round(e2eMs),
        choice: data.choice ?? null,
        error: data.error ?? null,
    })

    if (!res.ok) {
        throw new Error(data.error ?? 'Decision failed')
    }
    if (warmup) return { choice: 'RUN' as GameAction, probabilities: {}, e2eMs, inferenceMs: null, response: data }
    return {
        choice: data.choice as GameAction,
        probabilities: data.probabilities as Partial<Record<GameAction, number>>,
        e2eMs,
        inferenceMs: data.inferenceMs as number | null,
        response: data.response,
    }
}

function StageButton({
    children,
    variant = 'primary',
    onClick,
}: {
    children: React.ReactNode
    variant?: 'primary' | 'ghost' | 'outline'
    onClick: () => void
}) {
    const base =
        'dino-stage-btn min-h-11 min-w-[120px] px-5 font-[family-name:var(--font-display)] text-sm tracking-wide'
    const styles =
        variant === 'primary'
            ? 'border border-[#1c1915] bg-[#1c1915] text-[#f3efe4]'
            : variant === 'outline'
              ? 'border border-[#1c1915] bg-[#f3efe4]/90 text-[#1c1915]'
              : 'border border-[#f3efe4] bg-transparent text-[#f3efe4]'
    return (
        <button type="button" className={`${base} ${styles}`} onClick={onClick}>
            {children}
        </button>
    )
}

export function DinoApp() {
    const engineRef = useRef<DinoEngine | null>(null)
    const snapshot = useGameStore((s) => s.snapshot)
    const controller = useGameStore((s) => s.controller)
    const startTier = useGameStore((s) => s.startTier)
    const seed = useGameStore((s) => s.seed)
    const runState = useGameStore((s) => s.runState)
    const setSnapshot = useGameStore((s) => s.setSnapshot)
    const addLog = useGameStore((s) => s.addLog)
    const setPhase = useGameStore((s) => s.setPhase)
    const setController = useGameStore((s) => s.setController)
    const setStartTier = useGameStore((s) => s.setStartTier)
    const setSeed = useGameStore((s) => s.setSeed)
    const setRunState = useGameStore((s) => s.setRunState)
    const clearLogs = useGameStore((s) => s.clearLogs)
    const resetRunStats = useGameStore((s) => s.resetRunStats)

    const controllerRef = useRef(controller)
    controllerRef.current = controller

    useEffect(() => {
        const initial = useGameStore.getState()
        const engine = new DinoEngine(initial.startTier, initial.controller, initial.seed, {
            onDecisionRequest: async ({ obstacle, request }) => {
                return fetchDecision(controllerRef.current, request, obstacle.kind)
            },
            onLog: (entry) => useGameStore.getState().addLog(entry),
            onStatsTick: () => {
                const eng = engineRef.current
                if (!eng) return
                const store = useGameStore.getState()
                store.setSnapshot(eng.getSnapshot())
                store.setRunStats({
                    survivalMs: eng.elapsedMs,
                    medianE2e: eng.median(eng.latencies),
                    medianInference: eng.median(eng.inferenceLatencies),
                    deadlineSuccess: eng.deadlineSuccessRate(),
                    obstaclesCleared: eng.cleared,
                })
            },
            onPhaseChange: (phase) => {
                const store = useGameStore.getState()
                store.setPhase(phase)
                store.setSnapshot(engineRef.current?.getSnapshot() ?? null)
            },
        })
        engine.phase = 'warming_up'
        engineRef.current = engine
        useGameStore.getState().setSnapshot(engine.getSnapshot())

        return () => engine.stop()
    }, [])

    useEffect(() => {
        engineRef.current?.setController(controller)
    }, [controller])

    const runWarmup = useCallback(async () => {
        if (controller !== 'LAYA') return
        try {
            await fetchDecision(controller, WARMUP_REQUEST, 'cactus_tall', true)
        } catch (err) {
            const eng = engineRef.current
            addLog({
                id: `warmup-err-${Date.now()}`,
                runId: eng?.runId ?? 'warmup',
                timestamp: Date.now(),
                obstacleKind: 'cactus_tall',
                idealAction: 'JUMP',
                chosenAction: null,
                probabilities: null,
                e2eMs: null,
                inferenceMs: null,
                deadlineMs: 0,
                result: 'miss',
                request: WARMUP_REQUEST,
                response: err instanceof Error ? err.message : 'Warmup failed',
            })
        }
    }, [addLog, controller])

    const beginPlaying = useCallback(() => {
        const engine = engineRef.current
        if (!engine) return
        engine.phase = 'playing'
        setPhase('playing')
        engine.start()
        setRunState('playing')
        setSnapshot(engine.getSnapshot())
    }, [setPhase, setRunState, setSnapshot])

    const handleStartOrResume = useCallback(async () => {
        if (runState === 'idle') {
            await runWarmup()
            beginPlaying()
            return
        }
        if (runState === 'paused') {
            beginPlaying()
        }
    }, [beginPlaying, runState, runWarmup])

    const handlePause = useCallback(() => {
        const engine = engineRef.current
        if (!engine) return
        engine.stop()
        setRunState('paused')
    }, [setRunState])

    const handleReset = useCallback(() => {
        const engine = engineRef.current
        if (!engine) return
        engine.stop()
        engine.resetWorld()
        engine.phase = 'warming_up'
        clearLogs()
        resetRunStats()
        setRunState('idle')
        setPhase('warming_up')
        setSnapshot(engine.getSnapshot())
    }, [clearLogs, resetRunStats, setPhase, setRunState, setSnapshot])

    const applySeed = () => {
        engineRef.current?.setSeed(seed)
        if (runState === 'idle') {
            engineRef.current?.resetWorld()
            setSnapshot(engineRef.current?.getSnapshot() ?? null)
        }
    }

    const showVeil = runState === 'idle' || runState === 'paused'

    return (
        <div className="flex h-dvh flex-col overflow-hidden">
            <header className="flex flex-wrap items-center gap-3 border-b border-[#c9bfb0] bg-[#f3efe4] px-4 py-3">
                <h1 className="font-[family-name:var(--font-display)] text-xl tracking-wide">DINO.AI</h1>
                <span className="text-xs text-[#6b6358]">Autonomous Runner</span>
                <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
                    <label className="flex items-center gap-1">
                        Controller
                        <select
                            className="rounded border border-[#c9bfb0] bg-white px-2 py-1"
                            value={controller}
                            onChange={(e) => setController(e.target.value as ControllerMode)}
                            disabled={runState === 'playing'}
                        >
                            <option value="LAYA">LAYA</option>
                            <option value="RULES">RULES</option>
                            <option value="RANDOM">RANDOM</option>
                        </select>
                    </label>
                    <label className="flex items-center gap-1">
                        Start tier
                        <select
                            className="rounded border border-[#c9bfb0] bg-white px-2 py-1"
                            value={startTier}
                            onChange={(e) => {
                                setStartTier(e.target.value as DifficultyTier)
                                engineRef.current?.setTier(e.target.value as DifficultyTier)
                            }}
                            disabled={runState === 'playing'}
                        >
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                            <option value="insane">Insane</option>
                        </select>
                    </label>
                    <label className="flex items-center gap-1">
                        Seed
                        <input
                            type="number"
                            className="w-24 rounded border border-[#c9bfb0] bg-white px-2 py-1 font-mono"
                            value={seed}
                            onChange={(e) => setSeed(Number(e.target.value))}
                            disabled={runState === 'playing'}
                        />
                    </label>
                    <button
                        type="button"
                        className="dino-stage-btn rounded border border-[#1c1915] bg-[#1c1915] px-3 py-1 text-[#f3efe4] disabled:opacity-40"
                        onClick={applySeed}
                        disabled={runState === 'playing'}
                    >
                        Apply seed
                    </button>
                </div>
            </header>
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_320px]">
                <div className="relative min-h-[200px] border-b border-[#c9bfb0] lg:border-b-0 lg:border-r">
                    <DinoGame snapshot={snapshot} />
                    {runState === 'playing' && (
                        <div className="absolute top-3 right-3 z-20 flex gap-2">
                            <StageButton variant="primary" onClick={handlePause}>
                                Pause
                            </StageButton>
                            <StageButton variant="outline" onClick={handleReset}>
                                Reset
                            </StageButton>
                        </div>
                    )}
                    {showVeil && (
                        <div
                            className="absolute inset-0 z-10 flex items-center justify-center bg-[#1c1915]/45"
                            aria-hidden={false}
                        >
                            <div className="dino-veil-panel flex flex-wrap items-center justify-center gap-3 p-4">
                                {runState === 'idle' ? (
                                    <StageButton variant="primary" onClick={() => void handleStartOrResume()}>
                                        Start
                                    </StageButton>
                                ) : (
                                    <>
                                        <StageButton variant="primary" onClick={() => void handleStartOrResume()}>
                                            Resume
                                        </StageButton>
                                        <StageButton variant="ghost" onClick={handleReset}>
                                            Reset
                                        </StageButton>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <div className="hidden min-h-0 lg:block">
                    <PerformancePanel />
                </div>
            </div>
            <div className="h-[220px] min-h-[160px] shrink-0 lg:hidden">
                <PerformancePanel />
            </div>
            <div className="h-[240px] min-h-[180px] shrink-0">
                <DecisionLog />
            </div>
        </div>
    )
}
