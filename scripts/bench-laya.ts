/**
 * POST the same decision payloads to Laya (via local /api/decide or direct URL).
 * Run on the Linux host: pnpm exec tsx scripts/bench-laya.ts
 *
 * Env: LAYA_BENCH_URL (default http://127.0.0.1:3000/api/decide)
 */
import { buildLayaRequest } from '../src/lib/game/controllers'

const BENCH_URL = process.env.LAYA_BENCH_URL ?? 'http://127.0.0.1:3000/api/decide'

const CASES = [
    { kind: 'cactus_short' as const, distance: 600, speed: 160, ttc: 3750 },
    { kind: 'cactus_tall' as const, distance: 520, speed: 160, ttc: 3250 },
    { kind: 'cactus_cluster' as const, distance: 480, speed: 160, ttc: 3000 },
    { kind: 'bird_low' as const, distance: 500, speed: 160, ttc: 3125 },
    { kind: 'bird_high' as const, distance: 500, speed: 160, ttc: 3125 },
]

async function one(model: string | undefined, kind: (typeof CASES)[0]['kind']) {
    const c = CASES.find((x) => x.kind === kind) ?? CASES[0]!
    const request = buildLayaRequest({
        player: 'Running on the ground',
        upcomingKind: kind,
        distancePx: c.distance,
        speed: c.speed,
        ttcMs: c.ttc,
        nextLabel: 'none',
    })
    const started = performance.now()
    const res = await fetch(BENCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ controller: 'LAYA', obstacleKind: kind, model, request }),
    })
    const roundTrip = performance.now() - started
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? res.statusText)
    return {
        kind,
        choice: data.choice as string,
        roundTripMs: Math.round(roundTrip),
        inferenceMs: data.inferenceMs as number | null,
    }
}

async function bench(label: string, model?: string) {
    console.log(`\n=== ${label} ===`)
    const rows = []
    for (const c of CASES) {
        rows.push(await one(model, c.kind))
    }
    for (const r of rows) {
        console.log(`${r.kind.padEnd(14)} choice=${r.choice} e2e=${r.roundTripMs}ms infer=${r.inferenceMs ?? '—'}ms`)
    }
    const med = (nums: number[]) => {
        const s = [...nums].sort((a, b) => a - b)
        return s[Math.floor(s.length / 2)] ?? 0
    }
    console.log(
        `median e2e=${med(rows.map((r) => r.roundTripMs))}ms median infer=${med(rows.map((r) => r.inferenceMs ?? r.roundTripMs))}ms`,
    )
}

await bench('default model')
await bench('multilingual', 'multilingual')
