import * as THREE from 'three'
import type { ManifestFrame, SpriteSheetDef } from '@/lib/game/sprite-manifest'
import { getSheet } from '@/lib/game/sprite-manifest'

export function loadPixelSheet(loader: THREE.TextureLoader, sheet: SpriteSheetDef): THREE.Texture {
    const texture = loader.load(sheet.url)
    const filter = sheet.smooth ? THREE.LinearFilter : THREE.NearestFilter
    texture.magFilter = filter
    texture.minFilter = filter
    texture.generateMipmaps = false
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
}

export function uvRect(frame: ManifestFrame, sheet: SpriteSheetDef) {
    const W = sheet.width
    const H = sheet.height
    return {
        u0: frame.x / W,
        v0: 1 - (frame.y + frame.h) / H,
        u1: (frame.x + frame.w) / W,
        v1: 1 - frame.y / H,
    }
}

export function createSpriteMesh(textures: Map<string, THREE.Texture>, frame: ManifestFrame): THREE.Mesh {
    const sheet = getSheet(frame.sheet)
    const texture = textures.get(frame.sheet)
    const { u0, v0, u1, v1 } = uvRect(frame, sheet)
    const geo = new THREE.PlaneGeometry(frame.displayW, frame.displayH)
    const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
    })
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array([u0, v1, u1, v1, u0, v0, u1, v0]), 2))
    return new THREE.Mesh(geo, mat)
}

export function applyFrame(mesh: THREE.Mesh, textures: Map<string, THREE.Texture>, frame: ManifestFrame): void {
    const sheet = getSheet(frame.sheet)
    const texture = textures.get(frame.sheet)
    const mat = mesh.material as THREE.MeshBasicMaterial
    if (texture && mat.map !== texture) {
        mat.map = texture
        mat.needsUpdate = true
    }

    const { u0, v0, u1, v1 } = uvRect(frame, sheet)
    const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute
    uv.setXY(0, u0, v1)
    uv.setXY(1, u1, v1)
    uv.setXY(2, u0, v0)
    uv.setXY(3, u1, v0)
    uv.needsUpdate = true

    if (mesh.geometry instanceof THREE.PlaneGeometry) {
        mesh.geometry.dispose()
    }
    mesh.geometry = new THREE.PlaneGeometry(frame.displayW, frame.displayH)
    mesh.geometry.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(new Float32Array([u0, v1, u1, v1, u0, v0, u1, v0]), 2),
    )
}

/** World position for mesh center given anchor and feet/center reference point. */
export function positionWithAnchor(
    mesh: THREE.Object3D,
    frame: ManifestFrame,
    refX: number,
    refY: number,
    z: number,
): void {
    let cx = refX
    let cy = refY
    if (frame.anchor === 'feet') {
        cx = refX
        cy = refY + frame.displayH / 2
    }
    mesh.position.set(Math.round(cx), Math.round(cy), z)
}

export function loadAllSheets(
    loader: THREE.TextureLoader,
    sheets: readonly SpriteSheetDef[],
): Map<string, THREE.Texture> {
    const map = new Map<string, THREE.Texture>()
    for (const sheet of sheets) {
        map.set(sheet.id, loadPixelSheet(loader, sheet))
    }
    return map
}
