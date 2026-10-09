import { create } from 'zustand'
import type { ControllerMode, DecisionLogEntry, DifficultyTier, GamePhase, GameSnapshot } from '@/lib/game/types'

export type RunControlState = 'idle' | 'playing' | 'paused'
export type LayaModelChoice = 'default' | 'multilingual'

interface GameStore {
    snapshot: GameSnapshot | null
    logs: DecisionLogEntry[]
    seed: number
    controller: ControllerMode
    layaModel: LayaModelChoice
    startTier: DifficultyTier
    survivalMs: number
    medianE2e: number
    medianInference: number
    deadlineSuccess: number
    obstaclesCleared: number
    sessionDecisionCount: number
    runState: RunControlState
    setSnapshot: (s: GameSnapshot | null) => void
    patchSnapshot: (partial: Partial<GameSnapshot>) => void
    addLog: (entry: DecisionLogEntry) => void
    setPhase: (phase: GamePhase) => void
    setController: (c: ControllerMode) => void
    setLayaModel: (m: LayaModelChoice) => void
    setStartTier: (t: DifficultyTier) => void
    setSeed: (seed: number) => void
    setRunStats: (stats: {
        survivalMs: number
        medianE2e: number
        medianInference: number
        deadlineSuccess: number
        obstaclesCleared: number
        sessionDecisionCount: number
    }) => void
    clearLogs: () => void
    setRunState: (runState: RunControlState) => void
    resetRunStats: () => void
}

export const useGameStore = create<GameStore>((set) => ({
    snapshot: null,
    logs: [],
    seed: 42_001,
    controller: 'LAYA',
    layaModel: 'default',
    startTier: 'easy',
    survivalMs: 0,
    medianE2e: 0,
    medianInference: 0,
    deadlineSuccess: 100,
    obstaclesCleared: 0,
    sessionDecisionCount: 0,
    runState: 'idle',
    setSnapshot: (snapshot) => set({ snapshot }),
    patchSnapshot: (partial) =>
        set((state) => ({
            snapshot: state.snapshot ? { ...state.snapshot, ...partial } : null,
        })),
    addLog: (entry) => set((state) => ({ logs: [entry, ...state.logs].slice(0, 200) })),
    setPhase: (phase) =>
        set((state) => ({
            snapshot: state.snapshot ? { ...state.snapshot, phase } : null,
        })),
    setController: (controller) => set({ controller }),
    setLayaModel: (layaModel) => set({ layaModel }),
    setStartTier: (startTier) => set({ startTier }),
    setSeed: (seed) => set({ seed }),
    setRunStats: (stats) => set(stats),
    clearLogs: () => set({ logs: [] }),
    setRunState: (runState) => set({ runState }),
    resetRunStats: () =>
        set({
            survivalMs: 0,
            medianE2e: 0,
            medianInference: 0,
            deadlineSuccess: 100,
            obstaclesCleared: 0,
            sessionDecisionCount: 0,
        }),
}))
