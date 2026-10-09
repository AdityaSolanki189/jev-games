'use client'

import { useState } from 'react'
import type { DecisionLogEntry } from '@/lib/game/types'
import { useGameStore } from '@/lib/game/store'

function resultClass(result: DecisionLogEntry['result']) {
    switch (result) {
        case 'on_time':
            return 'text-[#2d6a3e]'
        case 'late':
            return 'text-[#b85c00]'
        case 'wrong':
            return 'text-[#a03030]'
        case 'crash':
            return 'text-[#1c1915] font-semibold'
        default:
            return 'text-[#6b6358]'
    }
}

function Row({ entry }: { entry: DecisionLogEntry }) {
    const [open, setOpen] = useState(false)

    if (entry.separator) {
        return (
            <div className="border-y border-dashed border-[#c9bfb0] bg-[#ebe4d6] px-3 py-2 text-xs text-[#6b6358]">
                {entry.separatorLabel ?? '— run separator —'}
            </div>
        )
    }

    return (
        <div className="border-b border-[#e0d8ca]">
            <button
                type="button"
                className="grid w-full grid-cols-[auto_1fr_auto] gap-2 px-3 py-2 text-left text-xs hover:bg-[#f7f2e8]"
                onClick={() => setOpen(!open)}
            >
                <span className="font-mono text-[#8a8175]">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                <span className="truncate font-mono">
                    {entry.obstacleKind} · ideal {entry.idealAction} → {entry.chosenAction ?? '—'}
                    {entry.deadlineMs > 0 && ` · deadline ${Math.round(entry.deadlineMs)}ms`}
                    {entry.e2eMs != null && ` · e2e ${Math.round(entry.e2eMs)}ms`}
                    {entry.inferenceMs != null && ` · infer ${Math.round(entry.inferenceMs)}ms`}
                    {entry.probabilities && entry.chosenAction
                        ? ` · p(${
                              entry.probabilities[entry.chosenAction] != null
                                  ? Math.round((entry.probabilities[entry.chosenAction] ?? 0) * 100)
                                  : '—'
                          }%)`
                        : ''}
                </span>
                <span className={resultClass(entry.result)}>{entry.result.replace('_', ' ')}</span>
            </button>
            {open && (
                <div className="grid gap-2 bg-[#1c1915] px-3 py-2 font-mono text-[10px] text-[#d8d0c4] md:grid-cols-2">
                    <div>
                        <p className="mb-1 text-[#8a8175]">REQUEST</p>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap">
                            {entry.request ? JSON.stringify(entry.request, null, 2) : '—'}
                        </pre>
                    </div>
                    <div>
                        <p className="mb-1 text-[#8a8175]">RESPONSE</p>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap">
                            {entry.response ? JSON.stringify(entry.response, null, 2) : '—'}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    )
}

export function DecisionLog() {
    const logs = useGameStore((s) => s.logs)

    return (
        <div className="flex h-full min-h-0 flex-col border-t border-[#c9bfb0] bg-[#faf6ee]">
            <div className="flex items-center justify-between border-b border-[#c9bfb0] px-3 py-2">
                <h3 className="font-[family-name:var(--font-display)] text-sm">Decision terminal</h3>
                <span className="text-xs text-[#6b6358]">{logs.length} events</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
                {logs.length === 0 ? (
                    <p className="p-4 text-xs text-[#6b6358]">Waiting for obstacles in sensor range…</p>
                ) : (
                    logs.map((entry) => <Row key={entry.id} entry={entry} />)
                )}
            </div>
        </div>
    )
}
