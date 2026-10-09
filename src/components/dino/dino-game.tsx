'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { GameSnapshot, ObstacleKind } from '@/lib/game/types'
import { ATLAS_SIZE, FRAMES, pickFrame } from '@/lib/game/sprite-frames'
import { WORLD_HEIGHT, WORLD_WIDTH } from '@/lib/game/types'

interface DinoGameProps {
    snapshot: GameSnapshot | null
}

function uvRect(frame: { x: number; y: number; w: number; h: number }) {
    return {
        u0: frame.x / ATLAS_SIZE,
        v0: 1 - (frame.y + frame.h) / ATLAS_SIZE,
        u1: (frame.x + frame.w) / ATLAS_SIZE,
        v1: 1 - frame.y / ATLAS_SIZE,
    }
}

function makeSprite(
    texture: THREE.Texture,
    frame: { x: number; y: number; w: number; h: number },
    w: number,
    h: number,
): THREE.Mesh {
    const { u0, v0, u1, v1 } = uvRect(frame)
    const geo = new THREE.PlaneGeometry(w, h)
    const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
    })
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array([u0, v1, u1, v1, u0, v0, u1, v0]), 2))
    return new THREE.Mesh(geo, mat)
}

function cactusFrame(kind: ObstacleKind) {
    if (kind === 'cactus_tall') return FRAMES.cactusTall
    if (kind === 'cactus_cluster') return FRAMES.cactusCluster
    return FRAMES.cactusShort
}

export function DinoGame({ snapshot }: DinoGameProps) {
    const mountRef = useRef<HTMLDivElement>(null)
    const snapRef = useRef(snapshot)
    snapRef.current = snapshot

    useEffect(() => {
        const mount = mountRef.current
        if (!mount) return

        const scene = new THREE.Scene()
        scene.background = new THREE.Color('#e8dcc8')

        const camera = new THREE.OrthographicCamera(0, WORLD_WIDTH, WORLD_HEIGHT, 0, 0.1, 1000)
        camera.position.z = 10

        const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false })
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
        mount.appendChild(renderer.domElement)

        const loader = new THREE.TextureLoader()
        const texture = loader.load('/sprites/atlas.png')
        texture.magFilter = THREE.NearestFilter
        texture.minFilter = THREE.NearestFilter
        texture.colorSpace = THREE.SRGBColorSpace

        const runnerGroup = new THREE.Group()
        const runnerMesh = makeSprite(texture, pickFrame(FRAMES.run, 0), 32, 36)
        runnerGroup.add(runnerMesh)
        runnerGroup.position.set(96, WORLD_HEIGHT - 36, 1)
        scene.add(runnerGroup)

        const groundMeshes: THREE.Mesh[] = []
        for (let i = 0; i < 20; i++) {
            const g = makeSprite(texture, FRAMES.ground, 64, 8)
            g.position.set(i * 64, WORLD_HEIGHT - 8, 0)
            scene.add(g)
            groundMeshes.push(g)
        }

        const duneNear = makeSprite(texture, FRAMES.duneNear, 128, 24)
        duneNear.position.set(200, WORLD_HEIGHT - 40, -1)
        scene.add(duneNear)
        const duneFar = makeSprite(texture, FRAMES.duneFar, 64, 16)
        duneFar.position.set(100, WORLD_HEIGHT - 52, -2)
        scene.add(duneFar)

        const sun = makeSprite(texture, FRAMES.sun, 24, 24)
        sun.position.set(WORLD_WIDTH - 40, 24, -3)
        scene.add(sun)

        const clouds: THREE.Mesh[] = []
        for (let i = 0; i < 3; i++) {
            const c = makeSprite(texture, FRAMES.cloud, 32, 8)
            c.position.set(120 + i * 180, 36 + i * 8, -2)
            scene.add(c)
            clouds.push(c)
        }

        const obstacleMeshes = new Map<string, THREE.Mesh>()
        const speedLines: THREE.Mesh[] = []
        for (let i = 0; i < 5; i++) {
            const line = new THREE.Mesh(
                new THREE.PlaneGeometry(40, 2),
                new THREE.MeshBasicMaterial({ color: '#1c1915', transparent: true, opacity: 0.15 }),
            )
            line.visible = false
            line.position.z = 2
            scene.add(line)
            speedLines.push(line)
        }

        const flash = new THREE.Mesh(
            new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_HEIGHT),
            new THREE.MeshBasicMaterial({ color: '#fff5e6', transparent: true, opacity: 0 }),
        )
        flash.position.set(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 5)
        scene.add(flash)

        let parallax = 0
        let raf = 0

        const resize = () => {
            const rect = mount.getBoundingClientRect()
            const aspect = WORLD_WIDTH / WORLD_HEIGHT
            let w = rect.width
            let h = rect.height
            if (w / h > aspect) w = h * aspect
            else h = w / aspect
            renderer.setSize(w, h, false)
            renderer.domElement.style.width = `${w}px`
            renderer.domElement.style.height = `${h}px`
        }
        resize()
        const ro = new ResizeObserver(resize)
        ro.observe(mount)

        const animate = () => {
            const snap = snapRef.current
            if (snap) {
                const runIdx = Math.floor(snap.runFrame) % FRAMES.run.length
                let frame = pickFrame(FRAMES.run, runIdx)
                if (snap.playerPose === 'airborne') frame = FRAMES.jump
                else if (snap.playerPose === 'ducking') {
                    const di = Math.floor(snap.runFrame) % 2
                    frame = pickFrame(FRAMES.duck, di)
                } else if (snap.playerPose === 'crashed') frame = FRAMES.crash

                const { u0, v0, u1, v1 } = uvRect(frame)
                const uv = runnerMesh.geometry.getAttribute('uv') as THREE.BufferAttribute
                uv.setXY(0, u0, v1)
                uv.setXY(1, u1, v1)
                uv.setXY(2, u0, v0)
                uv.setXY(3, u1, v0)
                uv.needsUpdate = true

                const h = snap.playerPose === 'ducking' ? 24 : 36
                runnerMesh.scale.y = h / 36
                runnerGroup.position.y = WORLD_HEIGHT - h - snap.playerY
                runnerGroup.rotation.z = snap.playerPose === 'crashed' ? Math.sin(snap.runFrame * 0.5) * 0.8 : 0

                if (snap.cameraShake > 0) {
                    camera.position.x = (Math.random() - 0.5) * 8 * snap.cameraShake
                    camera.position.y = (Math.random() - 0.5) * 4 * snap.cameraShake
                } else {
                    camera.position.x = 0
                    camera.position.y = 0
                }

                flash.material.opacity = snap.flashAlpha

                parallax += snap.speed * 0.0004
                duneNear.position.x = 200 - ((parallax * 80) % 400)
                duneFar.position.x = 100 - ((parallax * 40) % 300)
                for (let i = 0; i < clouds.length; i++) {
                    const c = clouds[i]
                    if (c) c.position.x = (120 + i * 180 - parallax * 20 * (i + 1)) % (WORLD_WIDTH + 80)
                }

                for (const g of groundMeshes) {
                    g.position.x -= snap.speed * 0.016
                    if (g.position.x < -64) g.position.x += 64 * groundMeshes.length
                }

                const activeIds = new Set(snap.obstacles.map((o) => o.id))
                for (const [id, mesh] of obstacleMeshes) {
                    if (!activeIds.has(id)) {
                        scene.remove(mesh)
                        mesh.geometry.dispose()
                        ;(mesh.material as THREE.Material).dispose()
                        obstacleMeshes.delete(id)
                    }
                }

                for (const obs of snap.obstacles) {
                    let mesh = obstacleMeshes.get(obs.id)
                    if (!mesh) {
                        const fr = obs.kind.startsWith('bird') ? pickFrame(FRAMES.bird, 0) : cactusFrame(obs.kind)
                        const mw = obs.kind.startsWith('bird') ? 28 : obs.width + 8
                        const mh = obs.kind.startsWith('bird') ? 14 : obs.height + 4
                        mesh = makeSprite(texture, fr, mw, mh)
                        scene.add(mesh)
                        obstacleMeshes.set(obs.id, mesh)
                    }
                    if (obs.kind.startsWith('bird')) {
                        const bi = Math.floor(snap.runFrame * 2) % 4
                        const bf = pickFrame(FRAMES.bird, bi)
                        const { u0, v0, u1, v1 } = uvRect(bf)
                        const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute
                        uv.setXY(0, u0, v1)
                        uv.setXY(1, u1, v1)
                        uv.setXY(2, u0, v0)
                        uv.setXY(3, u1, v0)
                        uv.needsUpdate = true
                    }
                    mesh.position.set(obs.x + obs.width / 2, WORLD_HEIGHT - 8 - obs.yOffset - obs.height / 2, 0.5)
                }

                for (let i = 0; i < speedLines.length; i++) {
                    const line = speedLines[i]
                    if (!line) continue
                    line.visible = snap.showSpeedLines
                    if (snap.showSpeedLines) {
                        line.position.set(200 + i * 120 - ((parallax * 200) % 100), 60 + i * 22, 2)
                    }
                }
            }

            renderer.render(scene, camera)
            raf = requestAnimationFrame(animate)
        }
        raf = requestAnimationFrame(animate)

        return () => {
            cancelAnimationFrame(raf)
            ro.disconnect()
            renderer.dispose()
            mount.removeChild(renderer.domElement)
        }
    }, [])

    const snap = snapshot
    const deadlinePct =
        snap?.remainingDecisionMs != null && snap.remainingDecisionMs > 0
            ? Math.min(100, (snap.remainingDecisionMs / 800) * 100)
            : 0

    return (
        <div className="relative flex h-full w-full flex-col">
            <div ref={mountRef} className="relative flex flex-1 items-center justify-center bg-[#e8dcc8]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-3 font-[family-name:var(--font-display)] text-sm tracking-wide">
                <div className="space-y-1">
                    <p className="text-[10px] text-[#5c5348]">DISTANCE</p>
                    <p className="text-lg">{String(Math.floor(snap?.distance ?? 0)).padStart(6, '0')}</p>
                </div>
                <div className="space-y-1 text-right">
                    <p className="text-[10px] text-[#5c5348]">SCORE</p>
                    <p className="text-lg">{snap?.score ?? 0}</p>
                </div>
            </div>
            <div className="pointer-events-none absolute bottom-3 left-3 right-3 space-y-2">
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <p className="font-[family-name:var(--font-display)] text-[10px] text-[#5c5348]">
                            CURRENT DECISION
                        </p>
                        <p className="font-[family-name:var(--font-display)] text-2xl text-[#c87830]">
                            {snap?.currentAction ?? '—'}
                        </p>
                    </div>
                    {snap?.remainingDecisionMs != null && (
                        <div className="min-w-[140px]">
                            <p className="text-right text-[10px] text-[#5c5348]">REMAINING WINDOW</p>
                            <p className="text-right font-[family-name:var(--font-display)] text-lg">
                                {Math.round(snap.remainingDecisionMs)} ms
                            </p>
                        </div>
                    )}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#d4cbb8]">
                    <div
                        className="h-full bg-[#e07828] transition-[width] duration-100"
                        style={{ width: `${deadlinePct}%` }}
                    />
                </div>
            </div>
        </div>
    )
}
