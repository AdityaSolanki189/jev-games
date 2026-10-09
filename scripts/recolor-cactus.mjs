/**
 * Builds color-shifted cactus variants from scripts/sprites/cactus-source.png
 * Run: pnpm run sprites:cactus
 * Uses ffmpeg when available; falls back to Node PNG processing.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = path.join(__dirname, 'sprites/cactus-source.png')
const OUT_DIR = path.join(__dirname, '../public/sprites/cactus')

function crc32(buf) {
    let c = ~0
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i]
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    return ~c >>> 0
}

function pngChunk(type, data) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const typeBuf = Buffer.from(type)
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
    return Buffer.concat([len, typeBuf, data, crcBuf])
}

function writePng(filePath, w, h, rgba) {
    const raw = Buffer.alloc((w * 4 + 1) * h)
    let off = 0
    for (let y = 0; y < h; y++) {
        raw[off++] = 0
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4
            raw[off++] = rgba[i]
            raw[off++] = rgba[i + 1]
            raw[off++] = rgba[i + 2]
            raw[off++] = rgba[i + 3]
        }
    }
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(w, 0)
    ihdr.writeUInt32BE(h, 4)
    ihdr[8] = 8
    ihdr[9] = 6
    const png = Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0)),
    ])
    fs.writeFileSync(filePath, png)
}

function paeth(a, b, c) {
    const p = a + b - c
    const pa = Math.abs(p - a)
    const pb = Math.abs(p - b)
    const pc = Math.abs(p - c)
    if (pa <= pb && pa <= pc) return a
    if (pb <= pc) return b
    return c
}

function readPng(filePath) {
    const data = fs.readFileSync(filePath)
    if (!data.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        throw new Error(`Not a PNG: ${filePath}`)
    }
    let off = 8
    let w = 0
    let h = 0
    let idat = Buffer.alloc(0)
    while (off < data.length) {
        const len = data.readUInt32BE(off)
        const typ = data.subarray(off + 4, off + 8).toString('ascii')
        const chunk = data.subarray(off + 8, off + 8 + len)
        if (typ === 'IHDR') {
            w = chunk.readUInt32BE(0)
            h = chunk.readUInt32BE(4)
        } else if (typ === 'IDAT') {
            idat = Buffer.concat([idat, chunk])
        } else if (typ === 'IEND') {
            break
        }
        off += 12 + len
    }
    const raw = zlib.inflateSync(idat)
    const bpp = 4
    const stride = w * bpp
    const rgba = new Uint8Array(w * h * 4)
    const rows = []
    let i = 0
    for (let y = 0; y < h; y++) {
        const filt = raw[i++]
        const row = Buffer.from(raw.subarray(i, i + stride))
        i += stride
        const prev = rows[y - 1] ?? Buffer.alloc(stride)
        if (filt === 1) {
            for (let x = 0; x < stride; x++) {
                row[x] = (row[x] + (x >= bpp ? row[x - bpp] : 0)) & 255
            }
        } else if (filt === 2) {
            for (let x = 0; x < stride; x++) row[x] = (row[x] + prev[x]) & 255
        } else if (filt === 3) {
            for (let x = 0; x < stride; x++) {
                const left = x >= bpp ? row[x - bpp] : 0
                row[x] = (row[x] + ((left + prev[x]) >> 1)) & 255
            }
        } else if (filt === 4) {
            for (let x = 0; x < stride; x++) {
                const a = x >= bpp ? row[x - bpp] : 0
                const b = prev[x]
                const c = x >= bpp ? prev[x - bpp] : 0
                row[x] = (row[x] + paeth(a, b, c)) & 255
            }
        }
        rows.push(row)
        for (let x = 0; x < w; x++) {
            const j = (y * w + x) * 4
            const ri = x * 4
            rgba[j] = row[ri]
            rgba[j + 1] = row[ri + 1]
            rgba[j + 2] = row[ri + 2]
            rgba[j + 3] = row[ri + 3]
        }
    }
    return { width: w, height: h, rgba }
}

function rgbToHsl(r, g, b) {
    r /= 255
    g /= 255
    b /= 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h = 0
    let s = 0
    const l = (max + min) / 2
    if (max !== min) {
        const d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0)
                break
            case g:
                h = (b - r) / d + 2
                break
            default:
                h = (r - g) / d + 4
        }
        h /= 6
    }
    return [h, s, l]
}

function hslToRgb(h, s, l) {
    if (s === 0) {
        const v = Math.round(l * 255)
        return [v, v, v]
    }
    const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1 / 6) return p + (q - p) * 6 * t
        if (t < 1 / 2) return q
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
        return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    return [
        Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
        Math.round(hue2rgb(p, q, h) * 255),
        Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
    ]
}

function keyNearBlack(rgba, threshold = 42) {
    for (let i = 0; i < rgba.length; i += 4) {
        const r = rgba[i]
        const g = rgba[i + 1]
        const b = rgba[i + 2]
        if (r < threshold && g < threshold && b < threshold) {
            rgba[i + 3] = 0
        }
    }
}

function tintCopy(src, { hueShift = 0, satMul = 1, lightMul = 1, sepia = false }) {
    const out = new Uint8Array(src.rgba.length)
    for (let i = 0; i < src.rgba.length; i += 4) {
        const a = src.rgba[i + 3]
        if (a === 0) continue
        let r = src.rgba[i]
        let g = src.rgba[i + 1]
        let b = src.rgba[i + 2]
        if (sepia) {
            const tr = Math.min(255, r * 0.55 + g * 0.35 + b * 0.1)
            const tg = Math.min(255, r * 0.35 + g * 0.28 + b * 0.08)
            const tb = Math.min(255, r * 0.2 + g * 0.15 + b * 0.05)
            r = tr
            g = tg
            b = tb
        } else {
            let [h, s, l] = rgbToHsl(r, g, b)
            h = (h + hueShift / 360 + 1) % 1
            s = Math.min(1, Math.max(0, s * satMul))
            l = Math.min(1, Math.max(0, l * lightMul))
            ;[r, g, b] = hslToRgb(h, s, l)
        }
        out[i] = r
        out[i + 1] = g
        out[i + 2] = b
        out[i + 3] = a
    }
    return { width: src.width, height: src.height, rgba: out }
}

function scaleNearest(src, newW, newH) {
    const out = new Uint8Array(newW * newH * 4)
    for (let y = 0; y < newH; y++) {
        for (let x = 0; x < newW; x++) {
            const sx = Math.floor((x / newW) * src.width)
            const sy = Math.floor((y / newH) * src.height)
            const si = (sy * src.width + sx) * 4
            const di = (y * newW + x) * 4
            out[di] = src.rgba[si]
            out[di + 1] = src.rgba[si + 1]
            out[di + 2] = src.rgba[si + 2]
            out[di + 3] = src.rgba[si + 3]
        }
    }
    return { width: newW, height: newH, rgba: out }
}

function blit(dst, dstW, dstH, src, ox, oy) {
    for (let y = 0; y < src.height; y++) {
        for (let x = 0; x < src.width; x++) {
            const dx = ox + x
            const dy = oy + y
            if (dx < 0 || dy < 0 || dx >= dstW || dy >= dstH) continue
            const si = (y * src.width + x) * 4
            const sa = src.rgba[si + 3]
            if (sa === 0) continue
            const di = (dy * dstW + dx) * 4
            const srcA = sa / 255
            const dstA = dst[di + 3] / 255
            const outA = srcA + dstA * (1 - srcA)
            if (outA <= 0) continue
            dst[di] = Math.round((src.rgba[si] * srcA + dst[di] * dstA * (1 - srcA)) / outA)
            dst[di + 1] = Math.round((src.rgba[si + 1] * srcA + dst[di + 1] * dstA * (1 - srcA)) / outA)
            dst[di + 2] = Math.round((src.rgba[si + 2] * srcA + dst[di + 2] * dstA * (1 - srcA)) / outA)
            dst[di + 3] = Math.round(outA * 255)
        }
    }
}

function ffmpegOk() {
    const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' })
    return r.status === 0
}

function runFfmpegVariant(name, vf, outPath) {
    const args = ['-y', '-i', SOURCE, '-vf', `${vf},format=rgba`, outPath]
    const r = spawnSync('ffmpeg', args, { encoding: 'utf8' })
    if (r.status !== 0) {
        console.warn(`ffmpeg ${name} failed`, r.stderr?.slice(0, 200))
        return false
    }
    return true
}

function buildWithNode() {
    const src = readPng(SOURCE)
    keyNearBlack(src.rgba)

    const variants = {
        short: tintCopy(src, { hueShift: 28, satMul: 1.18, lightMul: 1.08 }),
        tall: tintCopy(src, { hueShift: -18, satMul: 1.25, lightMul: 0.82 }),
        bush: tintCopy(src, { hueShift: 48, satMul: 0.48, lightMul: 0.92 }),
        tree: tintCopy(src, { sepia: true, lightMul: 0.88 }),
    }

    const clusterW = 220
    const clusterH = 140
    const clusterRgba = new Uint8Array(clusterW * clusterH * 4)
    const layers = [
        { tint: { hueShift: 22, satMul: 1.1, lightMul: 1 }, scale: 0.42, x: 8, y: 36 },
        { tint: { hueShift: -8, satMul: 1.05, lightMul: 0.95 }, scale: 0.52, x: 72, y: 18 },
        { tint: { hueShift: -32, satMul: 1.15, lightMul: 0.9 }, scale: 0.36, x: 128, y: 44 },
    ]
    for (const layer of layers) {
        const tinted = tintCopy(src, layer.tint)
        const sw = Math.max(1, Math.round(tinted.width * layer.scale))
        const sh = Math.max(1, Math.round(tinted.height * layer.scale))
        const scaled = scaleNearest(tinted, sw, sh)
        blit(clusterRgba, clusterW, clusterH, scaled, layer.x, layer.y)
    }
    variants.cluster = { width: clusterW, height: clusterH, rgba: clusterRgba }

    const meta = {}
    for (const [key, img] of Object.entries(variants)) {
        const file = path.join(OUT_DIR, `${key}.png`)
        writePng(file, img.width, img.height, img.rgba)
        meta[key] = { width: img.width, height: img.height }
        console.log(`Wrote ${file} (${img.width}x${img.height})`)
    }
    fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2))
}

function buildWithFfmpeg() {
    fs.mkdirSync(OUT_DIR, { recursive: true })
    const key = 'colorkey=0x000000:0.12:0.08'
    const ok =
        runFfmpegVariant('short', `${key},hue=h=28:s=1.15`, path.join(OUT_DIR, 'short.png')) &&
        runFfmpegVariant('tall', `${key},hue=h=-18:s=1.2,eq=brightness=-0.1`, path.join(OUT_DIR, 'tall.png')) &&
        runFfmpegVariant('bush', `${key},hue=h=48:s=0.5`, path.join(OUT_DIR, 'bush.png')) &&
        runFfmpegVariant('tree', `${key},hue=s=0,eq=gamma=1.15:contrast=1.05`, path.join(OUT_DIR, 'tree.png'))
    if (!ok) return false

    const clusterOut = path.join(OUT_DIR, 'cluster.png')
    const clusterFilter = [
        `[0:v]${key},hue=h=22:s=1.1,scale=200:-1[la]`,
        `[0:v]${key},hue=h=-8:s=1.05,scale=250:-1[lb]`,
        `[0:v]${key},hue=h=-32:s=1.1,scale=170:-1[lc]`,
        `color=s=220x140:c=black@0.0[bg]`,
        `[bg][lc]overlay=8:36[tmp1]`,
        `[tmp1][la]overlay=72:18[tmp2]`,
        `[tmp2][lb]overlay=128:44[out]`,
    ].join(';')
    const r = spawnSync('ffmpeg', ['-y', '-i', SOURCE, '-filter_complex', clusterFilter, '-map', '[out]', clusterOut], {
        encoding: 'utf8',
    })
    if (r.status !== 0) {
        console.warn('ffmpeg cluster failed', r.stderr?.slice(0, 300))
        return false
    }

    const meta = {}
    for (const key of ['short', 'tall', 'bush', 'tree', 'cluster']) {
        const img = readPng(path.join(OUT_DIR, `${key}.png`))
        meta[key] = { width: img.width, height: img.height }
    }
    fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2))
    return true
}

if (!fs.existsSync(SOURCE)) {
    console.error(`Missing source: ${SOURCE}`)
    process.exit(1)
}
fs.mkdirSync(OUT_DIR, { recursive: true })

if (ffmpegOk() && buildWithFfmpeg()) {
    console.log('Built cactus variants with ffmpeg')
} else {
    console.log('Building cactus variants with Node (ffmpeg unavailable or failed)')
    buildWithNode()
}
