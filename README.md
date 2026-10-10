# DINO.AI — Autonomous Runner

Chrome Dino–style endless runner where an AI controller chooses **JUMP**, **DUCK**, or **RUN** for each obstacle. The homepage is a live demo focused on **decision latency** (Laya SystemOne) and a side-by-side **performance monitor** and **decision terminal**.

Built on a Next.js App Router stack (TypeScript, Biome, Tailwind). Auth and database packages remain in the repo but are optional for running the game locally.

## What you see

- **960×300** pixel-art stage (Three.js canvas, crisp scaling)
- **Controllers:** `LAYA` (remote inference), `RULES` (ideal action per obstacle), `RANDOM`
- **Live decision card** under the canvas: question, answer, controller, deadline bar, Laya timings when available
- **Decision terminal:** full request/response history per obstacle

## Quick start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Choose a controller and tier, then **Start**.

### Environment (game)

| Variable | Required | Description |
|----------|----------|-------------|
| `LAYA_BASE_URL` | For LAYA | SystemOne base URL (see `.env.example`; `/v1/systemone` is appended if missing) |
| `LAYA_API_KEY` | For LAYA | Bearer token for Laya |
| `NEXT_PUBLIC_APP_NAME` | Optional | UI title (default `DINO.AI`) |
| `NEXT_PUBLIC_APP_URL` | Optional | App URL for metadata |

For **RULES** or **RANDOM**, Laya credentials are not required.

## How decisions work

When an obstacle enters the sensor range, the engine sends one structured payload (state + choice question) to `/api/decide`. For **LAYA**, the route forwards to SystemOne and returns `choice`, probabilities, and optional `X-Inference-Time-Ms`.

**State** includes player pose (text), upcoming obstacle label, distance, speed, time-to-collision, and the next obstacle label.

**Acceptable actions by obstacle:**

| Obstacle | Valid moves |
|----------|-------------|
| Cacti (short / tall / cluster) | `JUMP` |
| Low-flying bird | `JUMP` or `DUCK` |
| High-flying bird | `RUN` |

The engine scores **on time** only if the reply arrives before a maneuver-specific deadline (jump lead uses clearance height including `yOffset`, so jumping over a low bird is timed correctly). Late or wrong moves may still execute and can cause a crash.

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and serve |
| `pnpm sim:rules` | Headless RULES tests (bird duck, RUN crash, 40-obstacle run) |
| `pnpm bench:laya` | Batch latency bench against `/api/decide` (set `LAYA_BENCH_URL` if needed) |
| `pnpm sprites:cactus` / `sprites:birds` / `sprites:scenery` | Regenerate sprite assets from source sheets |
| `pnpm lint` / `pnpm check` | Biome lint and format |

## Project layout (game)

```
src/
├── app/
│   ├── page.tsx              # DINO.AI homepage
│   └── api/decide/route.ts   # LAYA / RULES / RANDOM decision proxy
├── components/dino/          # Stage UI, canvas, performance panel, decision log
└── lib/game/
    ├── engine.ts             # Simulation, deadlines, collisions
    ├── physics.ts            # Jump arc, hitboxes, maneuver lead times
    ├── obstacles.ts          # Spawn definitions and labels
    ├── controllers.ts        # Laya request builder
    └── laya/client.ts        # SystemOne HTTP client
public/sprites/               # Atlases, cactus variants, birds, scenery
scripts/                      # sim-rules, bench-laya, asset pipelines
```

## Rendering and smoothness

The simulation steps on `requestAnimationFrame`. The canvas reads a **per-frame snapshot** ref; React store updates (distance in HUD panels, stats) are throttled (~250ms) to avoid unnecessary re-renders.

## Template features (optional)

The repo still includes Better Auth, Drizzle, todos, and related routes. To use them, uncomment and set variables in `.env.example` (`DATABASE_URL`, `BETTER_AUTH_SECRET`, etc.) and run `pnpm db:push`. See [CLAUDE.md](CLAUDE.md) for full template conventions.

## License

MIT — see [LICENSE](LICENSE).
