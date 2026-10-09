'use client'

import type { DifficultyTier, GamePhase } from '@/lib/game/types'
import { useGameStore } from '@/lib/game/store'

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="border border-[#c9bfb0] bg-[#faf6ee] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-[#6b6358]">{label}</p>
            <p className="font-[family-name:var(--font-display)] text-xl text-[#1c1915]">{value}</p>
        </div>
    )
}

function formatSurvival(ms: number) {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const rs = s % 60
    return `${String(m).padStart(2, '0')}:${String(rs).padStart(2, '0')}`
}

function playingLabel(controller: string): string {
    if (controller === 'LAYA') return 'LAYA PLAYING'
    if (controller === 'RULES') return 'RULES PLAYING'
    if (controller === 'RANDOM') return 'RANDOM PLAYING'
    return `${controller} PLAYING`
}

export function PerformancePanel() {
    const snapshot = useGameStore((s) => s.snapshot)
    const survivalMs = useGameStore((s) => s.survivalMs)
    const medianE2e = useGameStore((s) => s.medianE2e)
    const medianInference = useGameStore((s) => s.medianInference)
    const deadlineSuccess = useGameStore((s) => s.deadlineSuccess)
    const obstaclesCleared = useGameStore((s) => s.obstaclesCleared)
    const sessionDecisionCount = useGameStore((s) => s.sessionDecisionCount)
    const seed = useGameStore((s) => s.seed)
    const runState = useGameStore((s) => s.runState)
    const controller = useGameStore((s) => s.controller)

    const phase = snapshot?.phase ?? 'warming_up'
    const tier = (snapshot?.tier ?? 'easy') as DifficultyTier
    const phaseLabel: Record<GamePhase, string> = {
        warming_up: 'WARMING UP',
        playing: playingLabel(controller),
        crashed: 'CRASHED',
        restarting: 'RESTARTING',
    }
    const statusLabel =
        runState === 'idle' ? 'READY' : runState === 'paused' ? 'PAUSED' : (phaseLabel[phase] ?? phase.toUpperCase())
    const inferLabel = controller === 'LAYA' && medianInference > 0 ? `${Math.round(medianInference)} ms` : '—'

    return (
        <div className="flex h-full flex-col gap-3 p-4">
            <div>
                <h2 className="font-[family-name:var(--font-display)] text-lg">AI Performance Monitor</h2>
                <p className="text-xs text-[#6b6358]">Latency benchmark — not planning proof</p>
            </div>
            <div
                className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                    runState === 'paused'
                        ? 'bg-[#d4cbb8] text-[#1c1915]'
                        : runState === 'idle'
                          ? 'bg-[#ebe4d6] text-[#1c1915]'
                          : phase === 'crashed'
                            ? 'bg-[#3a3530] text-[#f3efe4]'
                            : phase === 'warming_up'
                              ? 'bg-[#d4cbb8] text-[#1c1915]'
                              : 'bg-[#3a7a48] text-[#f3efe4]'
                }`}
            >
                {statusLabel}
            </div>
            <div className="grid grid-cols-2 gap-2">
                <Stat label="Survival time" value={formatSurvival(survivalMs)} />
                <Stat label="Obstacles dodged" value={String(obstaclesCleared)} />
                <Stat label="Session median e2e" value={`${Math.round(medianE2e)} ms`} />
                <Stat label="Session deadline OK" value={`${deadlineSuccess}%`} />
                <Stat label="Session infer med." value={inferLabel} />
                <Stat label="Session decisions" value={String(sessionDecisionCount)} />
                <Stat label="Speed / tier" value={`${Math.round(snapshot?.speed ?? 0)} · ${tier}`} />
            </div>
            <div className="mt-auto border-t border-[#c9bfb0] pt-3 text-xs text-[#6b6358]">
                <p>
                    Seed: <span className="font-mono text-[#1c1915]">{seed}</span>
                </p>
            </div>
        </div>
    )
}
