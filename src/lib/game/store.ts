import { create } from 'zustand'
import type { ControllerMode, DecisionLogEntry, DifficultyTier, GamePhase, GameSnapshot } from '@/lib/game/types'

export type RunControlState = 'idle' | 'playing' | 'paused'

interface GameStore {
    snapshot: GameSnapshot | null
    logs: DecisionLogEntry[]
    seed: number
    controller: ControllerMode
    startTier: DifficultyTier
    survivalMs: number
    medianE2e: number
    medianInference: number
    deadlineSuccess: number
    obstaclesCleared: number
    runState: RunControlState
    setSnapshot: (s: GameSnapshot | null) => void
    patchSnapshot: (partial: Partial<GameSnapshot>) => void
    addLog: (entry: DecisionLogEntry) => void
    setPhase: (phase: GamePhase) => void
    setController: (c: ControllerMode) => void
    setStartTier: (t: DifficultyTier) => void
    setSeed: (seed: number) => void
    setRunStats: (stats: {
        survivalMs: number
        medianE2e: number
        medianInference: number
        deadlineSuccess: number
        obstaclesCleared: number
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
    startTier: 'easy',
    survivalMs: 0,
    medianE2e: 0,
    medianInference: 0,
    deadlineSuccess: 100,
    obstaclesCleared: 0,
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
        }),
}))
