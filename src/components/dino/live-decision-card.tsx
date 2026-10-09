'use client'

import { useEffect, useState } from 'react'
import type { LiveDecisionCall } from '@/lib/game/types'

const ENTER_MS = 200
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)'

function controllerNote(controller: LiveDecisionCall['controller']): string {
    if (controller === 'LAYA') return 'Laya inference'
    if (controller === 'RULES') return 'Local rules engine'
    return 'Local random'
}

interface LiveDecisionCardProps {
    liveCall: LiveDecisionCall | undefined
}

export function LiveDecisionCard({ liveCall }: LiveDecisionCardProps) {
    const [reducedMotion, setReducedMotion] = useState(false)
    const [visible, setVisible] = useState(false)
    const [displayed, setDisplayed] = useState<LiveDecisionCall | null>(null)
    const [answerFade, setAnswerFade] = useState(1)

    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
        setReducedMotion(mq.matches)
        const onChange = () => setReducedMotion(mq.matches)
        mq.addEventListener('change', onChange)
        return () => mq.removeEventListener('change', onChange)
    }, [])

    useEffect(() => {
        if (!liveCall || liveCall.status === 'idle') {
            setVisible(false)
            return
        }
        setDisplayed(liveCall)
        setVisible(true)
    }, [liveCall])

    useEffect(() => {
        if (!liveCall || liveCall.status !== 'answered') return
        setAnswerFade(0)
        const t = window.setTimeout(() => setAnswerFade(1), reducedMotion ? 0 : 80)
        return () => clearTimeout(t)
    }, [liveCall?.chosenAction, liveCall?.status, reducedMotion])

    if (!displayed || displayed.status === 'idle') return null

    const deadlinePct =
        displayed.status === 'waiting' && displayed.remainingMs != null && displayed.deadlineMs > 0
            ? Math.min(100, (displayed.remainingMs / displayed.deadlineMs) * 100)
            : displayed.status === 'answered'
              ? 0
              : 0

    const motionStyle = reducedMotion
        ? { opacity: visible ? 1 : 0 }
        : {
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(8px)',
              transition: `opacity ${ENTER_MS}ms ${EASE}, transform ${ENTER_MS}ms ${EASE}`,
          }

    const probs =
        displayed.controller === 'LAYA' && displayed.probabilities
            ? (['JUMP', 'DUCK', 'RUN'] as const)
                  .map((a) => {
                      const p = displayed.probabilities?.[a]
                      if (p == null || p <= 0) return null
                      return `${a} ${Math.round(p * 100)}%`
                  })
                  .filter(Boolean)
                  .join(' · ')
            : null

    return (
        <div className="w-full rounded border border-[#c9bfb0] bg-[#faf6ee] px-3 py-2" style={motionStyle}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="font-[family-name:var(--font-display)] text-[10px] uppercase tracking-wide text-[#6b6358]">
                        {displayed.controller} · {controllerNote(displayed.controller)}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-[#1c1915]">{displayed.obstacleLabel}</p>
                </div>
                {displayed.status === 'waiting' && displayed.remainingMs != null && (
                    <p className="font-[family-name:var(--font-display)] text-sm text-[#c87830]">
                        {Math.round(displayed.remainingMs)} ms left
                    </p>
                )}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-[#5c5348]">{displayed.question}</p>
            <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[10px] uppercase text-[#6b6358]">Answer</span>
                <span
                    className="font-[family-name:var(--font-display)] text-lg text-[#c87830]"
                    style={{
                        opacity: answerFade,
                        transition: reducedMotion ? undefined : 'opacity 120ms ease-out',
                    }}
                >
                    {displayed.status === 'waiting' ? 'waiting…' : (displayed.chosenAction ?? '—')}
                </span>
            </div>
            {displayed.status === 'answered' && displayed.controller === 'LAYA' && (
                <p className="mt-1 text-[10px] text-[#6b6358]">
                    {displayed.e2eMs != null ? `E2E ${Math.round(displayed.e2eMs)} ms` : 'E2E —'}
                    {' · '}
                    {displayed.inferenceMs != null ? `Infer ${Math.round(displayed.inferenceMs)} ms` : 'Infer —'}
                </p>
            )}
            {probs ? <p className="mt-1 text-[10px] text-[#6b6358]">{probs}</p> : null}
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#d4cbb8]">
                <div
                    className="h-full bg-[#e07828]"
                    style={{
                        width: `${deadlinePct}%`,
                        transition: reducedMotion ? undefined : 'width 100ms linear',
                    }}
                />
            </div>
        </div>
    )
}
