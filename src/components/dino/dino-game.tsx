'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { birdVisual } from '@/lib/game/bird-visual'
import type { GameSnapshot } from '@/lib/game/types'
import { GROUND_Y, NOSE_X, WORLD_HEIGHT, WORLD_WIDTH } from '@/lib/game/types'
import { applyFrame, createSpriteMesh, loadAllSheets, positionWithAnchor } from '@/lib/game/pixel-sprite'
import { sceneryForWindow, sceneryScreenX } from '@/lib/game/scenery'
import {
    BUSH_FRAMES,
    CLIPS,
    CLOUD_FRAMES,
    type FrameKey,
    getFrame,
    GROUND_TILE_FRAME,
    type ManifestFrame,
    OBSTACLE_FRAME,
    pickClipFrame,
    SCENERY_PARALLAX,
    SHEETS,
    SKY_FRAME,
    TREE_FRAMES,
} from '@/lib/game/sprite-manifest'
import type { SceneryProp } from '@/lib/game/scenery'

interface DinoGameProps {
    snapshot: GameSnapshot | null
}

function scrollOffset(distance: number, factor: number, tileWidth: number): number {
    const raw = (distance * factor) % tileWidth
    return raw - tileWidth
}

function frameForProp(prop: SceneryProp): ManifestFrame {
    const list = prop.slot === 'cloud' ? CLOUD_FRAMES : prop.slot === 'tree' ? TREE_FRAMES : BUSH_FRAMES
    return list[prop.variant % list.length] ?? list[0] ?? GROUND_TILE_FRAME
}

export function DinoGame({ snapshot }: DinoGameProps) {
    const mountRef = useRef<HTMLDivElement>(null)
    const snapRef = useRef(snapshot)
    snapRef.current = snapshot
    const [reducedMotion, setReducedMotion] = useState(false)

    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
        setReducedMotion(mq.matches)
        const onChange = () => setReducedMotion(mq.matches)
        mq.addEventListener('change', onChange)
        return () => mq.removeEventListener('change', onChange)
    }, [])

    useEffect(() => {
        const mount = mountRef.current
        if (!mount) return

        const scene = new THREE.Scene()
        scene.background = new THREE.Color('#7ec8f0')

        const camera = new THREE.OrthographicCamera(0, WORLD_WIDTH, WORLD_HEIGHT, 0, 0.1, 1000)
        camera.position.z = 10

        const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false })
        renderer.setPixelRatio(1)
        renderer.setSize(WORLD_WIDTH, WORLD_HEIGHT, false)
        renderer.domElement.style.width = '100%'
        renderer.domElement.style.height = '100%'
        renderer.domElement.style.imageRendering = 'pixelated'
        mount.appendChild(renderer.domElement)

        const loader = new THREE.TextureLoader()
        const textures = loadAllSheets(loader, SHEETS)

        const skyMesh = createSpriteMesh(textures, SKY_FRAME)
        positionWithAnchor(skyMesh, SKY_FRAME, WORLD_WIDTH / 2, WORLD_HEIGHT / 2, -4)
        scene.add(skyMesh)

        const groundFrame = GROUND_TILE_FRAME
        const groundTileW = groundFrame.displayW
        const groundMeshes: THREE.Mesh[] = []
        for (let i = 0; i < Math.ceil(WORLD_WIDTH / groundTileW) + 3; i++) {
            const g = createSpriteMesh(textures, groundFrame)
            positionWithAnchor(g, groundFrame, i * groundTileW, GROUND_Y + 8 - groundFrame.displayH, 0)
            scene.add(g)
            groundMeshes.push(g)
        }

        const sceneryMeshes = new Map<string, THREE.Mesh>()
        const obstacleMeshes = new Map<string, THREE.Mesh>()
        const dustMeshes = new Map<string, THREE.Mesh>()

        const runnerGroup = new THREE.Group()
        const runnerMesh = createSpriteMesh(textures, pickClipFrame(CLIPS.dino.run, 0))
        runnerGroup.add(runnerMesh)
        scene.add(runnerGroup)

        const shadowMat = new THREE.MeshBasicMaterial({ color: '#1c1915', transparent: true, opacity: 0.22 })
        const shadow = new THREE.Mesh(new THREE.PlaneGeometry(28, 6), shadowMat)
        shadow.position.z = 0.55
        scene.add(shadow)

        const speedLines: THREE.Mesh[] = []
        for (let i = 0; i < 5; i++) {
            const line = new THREE.Mesh(
                new THREE.PlaneGeometry(40, 2),
                new THREE.MeshBasicMaterial({ color: '#1c1915', transparent: true, opacity: 0.12 }),
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

        let raf = 0

        const resize = () => {
            renderer.setSize(WORLD_WIDTH, WORLD_HEIGHT, false)
        }
        resize()
        const ro = new ResizeObserver(resize)
        ro.observe(mount)

        const syncScenery = (snap: GameSnapshot) => {
            const props = sceneryForWindow(snap.seed, snap.distance)
            const active = new Set(props.map((p) => p.id))
            for (const [id, mesh] of sceneryMeshes) {
                if (!active.has(id)) {
                    scene.remove(mesh)
                    mesh.geometry.dispose()
                    ;(mesh.material as THREE.Material).dispose()
                    sceneryMeshes.delete(id)
                }
            }
            for (const prop of props) {
                let mesh = sceneryMeshes.get(prop.id)
                const frame = frameForProp(prop)
                if (!mesh) {
                    mesh = createSpriteMesh(textures, frame)
                    mesh.scale.set(prop.scale, prop.scale, 1)
                    scene.add(mesh)
                    sceneryMeshes.set(prop.id, mesh)
                }
                const sx = sceneryScreenX(prop, snap.distance)
                positionWithAnchor(mesh, frame, sx, prop.y, prop.z)
            }
        }

        const animate = () => {
            const snap = snapRef.current
            if (snap) {
                let dinoClip: readonly FrameKey[] = CLIPS.dino.run
                let dinoIdx = Math.floor(snap.runFrame)
                if (snap.playerPose === 'crashed') {
                    dinoClip = CLIPS.dino.dead
                    dinoIdx = 0
                } else {
                    const duckT = reducedMotion ? (snap.playerPose === 'ducking' ? 1 : 0) : snap.duckBlend
                    if (duckT >= 0.5) {
                        dinoClip = CLIPS.dino.duck
                    }
                }
                if (snap.playerPose === 'airborne') {
                    dinoClip = snap.jumpProgress < 0.5 ? CLIPS.dino.jump : CLIPS.dino.fall
                    dinoIdx = 0
                }
                const dinoFrame = pickClipFrame(dinoClip, dinoIdx)
                applyFrame(runnerMesh, textures, dinoFrame)
                positionWithAnchor(runnerMesh, dinoFrame, 0, 0, 0)
                const duckT = reducedMotion ? (snap.playerPose === 'ducking' ? 1 : 0) : snap.duckBlend
                const squatEase = duckT * duckT * (3 - 2 * duckT)
                const squatPx = Math.round(squatEase * 10)
                runnerGroup.position.set(Math.round(NOSE_X), Math.round(GROUND_Y + snap.playerY + squatPx), 1)
                const frozen = snap.phase === 'crashed'
                runnerGroup.rotation.z = frozen ? 0.35 : 0

                const airFactor = snap.playerPose === 'airborne' ? 0.55 : 1
                shadow.scale.set(airFactor, airFactor, 1)
                shadowMat.opacity = 0.12 + 0.1 * airFactor
                shadow.position.set(Math.round(NOSE_X), Math.round(GROUND_Y + snap.playerY + 2), 0.55)

                if (!frozen && snap.cameraShake > 0) {
                    camera.position.x = (Math.random() - 0.5) * 8 * snap.cameraShake
                    camera.position.y = (Math.random() - 0.5) * 4 * snap.cameraShake
                } else {
                    camera.position.x = 0
                    camera.position.y = 0
                }

                ;(flash.material as THREE.MeshBasicMaterial).opacity = snap.flashAlpha

                const groundScroll = scrollOffset(snap.distance, SCENERY_PARALLAX.ground, groundTileW)
                for (let i = 0; i < groundMeshes.length; i++) {
                    const g = groundMeshes[i]
                    if (g) {
                        positionWithAnchor(
                            g,
                            groundFrame,
                            i * groundTileW + groundScroll,
                            GROUND_Y + 8 - groundFrame.displayH,
                            0,
                        )
                    }
                }

                syncScenery(snap)

                const activeObs = new Set(snap.obstacles.map((o) => o.id))
                for (const [id, mesh] of obstacleMeshes) {
                    if (!activeObs.has(id)) {
                        scene.remove(mesh)
                        mesh.geometry.dispose()
                        ;(mesh.material as THREE.Material).dispose()
                        obstacleMeshes.delete(id)
                    }
                }

                for (const obs of snap.obstacles) {
                    let mesh = obstacleMeshes.get(obs.id)
                    const isBird = obs.kind.startsWith('bird')
                    let frame = isBird
                        ? pickClipFrame(CLIPS.bird.flap, Math.floor(snap.runFrame * 2))
                        : getFrame(OBSTACLE_FRAME[obs.kind])
                    if (!mesh) {
                        mesh = createSpriteMesh(textures, frame)
                        scene.add(mesh)
                        obstacleMeshes.set(obs.id, mesh)
                    }
                    if (isBird) {
                        frame = pickClipFrame(CLIPS.bird.flap, Math.floor(snap.runFrame * 2))
                        applyFrame(mesh, textures, frame)
                        const visual = birdVisual(obs)
                        const sx = visual.displayW / frame.displayW
                        const sy = visual.displayH / frame.displayH
                        mesh.scale.set(sx, sy, 1)
                        mesh.position.set(
                            Math.round(obs.x + obs.width / 2),
                            Math.round(visual.feetY - visual.displayH / 2),
                            0.5,
                        )
                    } else {
                        mesh.scale.set(1, 1, 1)
                        applyFrame(mesh, textures, frame)
                        positionWithAnchor(mesh, frame, obs.x + obs.width / 2, GROUND_Y + obs.yOffset, 0.5)
                    }
                }

                const activeDust = new Set(snap.dustEvents.map((_, i) => `dust-${i}`))
                for (const [id, mesh] of dustMeshes) {
                    if (!activeDust.has(id)) {
                        scene.remove(mesh)
                        mesh.geometry.dispose()
                        ;(mesh.material as THREE.Material).dispose()
                        dustMeshes.delete(id)
                    }
                }
                snap.dustEvents.forEach((ev, i) => {
                    const id = `dust-${i}`
                    let mesh = dustMeshes.get(id)
                    const dustFrame = pickClipFrame(CLIPS.fx.dust, ev.frame)
                    if (!mesh) {
                        mesh = createSpriteMesh(textures, dustFrame)
                        scene.add(mesh)
                        dustMeshes.set(id, mesh)
                    }
                    applyFrame(mesh, textures, dustFrame)
                    positionWithAnchor(mesh, dustFrame, ev.x, GROUND_Y, 1.2)
                })

                const parallax = snap.distance * 0.0004
                for (let i = 0; i < speedLines.length; i++) {
                    const line = speedLines[i]
                    if (!line) continue
                    line.visible = snap.showSpeedLines
                    if (snap.showSpeedLines) {
                        line.position.set(200 + i * 120 - ((parallax * 200) % 100), GROUND_Y + 40 + i * 18, 2)
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
    }, [reducedMotion])

    const snap = snapshot

    return (
        <div className="relative h-full w-full">
            <div
                ref={mountRef}
                className="absolute inset-0 [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-contain"
            />
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
        </div>
    )
}
