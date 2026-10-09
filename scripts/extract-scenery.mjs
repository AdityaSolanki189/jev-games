/**
 * Cuts individual clouds and plants out of the scenery sheets.
 * Run: pnpm run sprites:scenery
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(__dirname, 'sprites/env')
const PUBLIC = path.join(__dirname, '../public/sprites')

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
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
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
    let off = 8
    let w = 0
    let h = 0
    let color = 6
    let idat = Buffer.alloc(0)
    while (off < data.length) {
        const len = data.readUInt32BE(off)
        const typ = data.subarray(off + 4, off + 8).toString('ascii')
        const chunk = data.subarray(off + 8, off + 8 + len)
        if (typ === 'IHDR') {
            w = chunk.readUInt32BE(0)
            h = chunk.readUInt32BE(4)
            color = chunk[9]
        } else if (typ === 'IDAT') {
            idat = Buffer.concat([idat, chunk])
        } else if (typ === 'IEND') {
            break
        }
        off += 12 + len
    }
    const raw = zlib.inflateSync(idat)
    const channels = color === 6 ? 4 : color === 2 ? 3 : 4
    const stride = w * channels
    const rgba = new Uint8Array(w * h * 4)
    let i = 0
    let prev = Buffer.alloc(stride)
    for (let y = 0; y < h; y++) {
        const filt = raw[i++]
        const row = Buffer.from(raw.subarray(i, i + stride))
        i += stride
        const bpp = channels
        if (filt === 1) {
            for (let x = 0; x < stride; x++) row[x] = (row[x] + (x >= bpp ? row[x - bpp] : 0)) & 255
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
        prev = row
        for (let x = 0; x < w; x++) {
            const j = (y * w + x) * 4
            const ri = x * channels
            rgba[j] = row[ri]
            rgba[j + 1] = row[ri + 1]
            rgba[j + 2] = row[ri + 2]
            rgba[j + 3] = channels === 4 ? row[ri + 3] : 255
        }
    }
    return { width: w, height: h, rgba }
}

function components(img, isInk) {
    const { width: w, height: h, rgba } = img
    const seen = new Uint8Array(w * h)
    const out = []
    const stack = []
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const p = y * w + x
            if (seen[p] || !isInk(rgba, p * 4)) continue
            let minx = x
            let maxx = x
            let miny = y
            let maxy = y
            let count = 0
            stack.push(p)
            seen[p] = 1
            while (stack.length) {
                const q = stack.pop()
                const qx = q % w
                const qy = (q - qx) / w
                count++
                if (qx < minx) minx = qx
                if (qx > maxx) maxx = qx
                if (qy < miny) miny = qy
                if (qy > maxy) maxy = qy
                for (const [nx, ny] of [
                    [qx + 1, qy],
                    [qx - 1, qy],
                    [qx, qy + 1],
                    [qx, qy - 1],
                ]) {
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
                    const np = ny * w + nx
                    if (seen[np] || !isInk(rgba, np * 4)) continue
                    seen[np] = 1
                    stack.push(np)
                }
            }
            if (count > 30) out.push({ minx, miny, maxx, maxy, count })
        }
    }
    out.sort((a, b) => a.miny - b.miny || a.minx - b.minx)
    return out
}

function crop(img, box, keep) {
    const w = box.maxx - box.minx + 1
    const h = box.maxy - box.miny + 1
    const rgba = new Uint8Array(w * h * 4)
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const si = ((box.miny + y) * img.width + (box.minx + x)) * 4
            const di = (y * w + x) * 4
            if (!keep(img.rgba, si)) continue
            rgba[di] = img.rgba[si]
            rgba[di + 1] = img.rgba[si + 1]
            rgba[di + 2] = img.rgba[si + 2]
            rgba[di + 3] = 255
        }
    }
    return { width: w, height: h, rgba }
}

const SKY = [129, 201, 249]
function cloudInk(rgba, i) {
    if (rgba[i + 3] < 16) return false
    if (rgba[i] < 18 && rgba[i + 1] < 18 && rgba[i + 2] < 18) return false
    const dr = rgba[i] - SKY[0]
    const dg = rgba[i + 1] - SKY[1]
    const db = rgba[i + 2] - SKY[2]
    return dr * dr + dg * dg + db * db > 900
}

function plantInk(rgba, i) {
    return rgba[i + 3] > 16
}

function extractClouds() {
    const img = readPng(path.join(SRC, 'clouds.png'))
    const all = components(img, cloudInk)
    const larges = all.filter((c) => c.count > 1000)
    const smalls = all.filter((c) => c.count <= 1000)
    const used = new Set()
    const boxes = larges.map((large) => {
        const box = {
            minx: large.minx - 2,
            miny: large.miny - 2,
            maxx: large.maxx + 2,
            maxy: large.maxy + 2,
        }
        for (let i = 0; i < smalls.length; i++) {
            if (used.has(i)) continue
            const s = smalls[i]
            const cx = (s.minx + s.maxx) / 2
            const cy = (s.miny + s.maxy) / 2
            const near = cx >= box.minx - 28 && cx <= box.maxx + 28 && cy >= box.miny - 16 && cy <= box.maxy + 16
            if (!near) continue
            used.add(i)
            box.minx = Math.min(box.minx, s.minx - 1)
            box.miny = Math.min(box.miny, s.miny - 1)
            box.maxx = Math.max(box.maxx, s.maxx + 1)
            box.maxy = Math.max(box.maxy, s.maxy + 1)
        }
        box.minx = Math.max(0, box.minx)
        box.miny = Math.max(0, box.miny)
        box.maxx = Math.min(img.width - 1, box.maxx)
        box.maxy = Math.min(img.height - 1, box.maxy)
        return box
    })

    const dir = path.join(PUBLIC, 'clouds')
    const meta = []
    boxes.forEach((box, index) => {
        const id = `cloud-${index}`
        const cut = crop(img, box, cloudInk)
        writePng(path.join(dir, `${id}.png`), cut.width, cut.height, cut.rgba)
        const displayW = Math.max(48, Math.round(cut.width * 0.5))
        const displayH = Math.max(20, Math.round(cut.height * 0.5))
        meta.push({ id, width: cut.width, height: cut.height, displayW, displayH })
        console.log(`cloud ${id} ${cut.width}x${cut.height}`)
    })
    return meta
}

function extractPlants() {
    const img = readPng(path.join(SRC, 'plants.png'))
    const parts = components(img, plantInk)
    const dir = path.join(PUBLIC, 'plants')
    const meta = []
    parts.forEach((part, index) => {
        const id = `plant-${index}`
        const box = {
            minx: Math.max(0, part.minx),
            miny: Math.max(0, part.miny),
            maxx: Math.min(img.width - 1, part.maxx),
            maxy: Math.min(img.height - 1, part.maxy),
        }
        const cut = crop(img, box, plantInk)
        writePng(path.join(dir, `${id}.png`), cut.width, cut.height, cut.rgba)
        const role = cut.height >= 24 ? 'tree' : 'bush'
        meta.push({
            id,
            role,
            width: cut.width,
            height: cut.height,
            displayW: cut.width * 2,
            displayH: cut.height * 2,
        })
        console.log(`${role} ${id} ${cut.width}x${cut.height}`)
    })
    return meta
}

function extractGround() {
    const img = readPng(path.join(SRC, 'ground.png'))
    const rgba = new Uint8Array(img.rgba)
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255
    writePng(path.join(PUBLIC, 'ground/tile.png'), img.width, img.height, rgba)
    return { id: 'ground', width: img.width, height: img.height, displayW: img.width, displayH: img.height }
}

const clouds = extractClouds()
const plants = extractPlants()
const ground = extractGround()
const skyStat = fs.statSync(path.join(SRC, 'sky.jpg'))
fs.mkdirSync(path.join(PUBLIC, 'sky'), { recursive: true })
fs.copyFileSync(path.join(SRC, 'sky.jpg'), path.join(PUBLIC, 'sky/sky.jpg'))
const meta = {
    clouds,
    plants,
    ground,
    sky: { width: 1024, height: 640, bytes: skyStat.size },
}
fs.writeFileSync(path.join(PUBLIC, 'scenery-meta.json'), JSON.stringify(meta, null, 2))
console.log(`Wrote ${clouds.length} clouds, ${plants.length} plants, ground, sky`)
