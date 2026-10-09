/**
 * Flips bird frames so they face left and clears the black backdrop.
 * Interior black (outlines, pupils) is kept. Run: pnpm run sprites:birds
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC_DIR = path.join(__dirname, 'sprites/birds')
const OUT_DIR = path.join(__dirname, '../public/sprites/birds')

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
    let i = 0
    let prev = Buffer.alloc(stride)
    for (let y = 0; y < h; y++) {
        const filt = raw[i++]
        const row = Buffer.from(raw.subarray(i, i + stride))
        i += stride
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
            const ri = x * 4
            rgba[j] = row[ri]
            rgba[j + 1] = row[ri + 1]
            rgba[j + 2] = row[ri + 2]
            rgba[j + 3] = row[ri + 3]
        }
    }
    return { width: w, height: h, rgba }
}

function isBackdrop(rgba, i) {
    return rgba[i] < 28 && rgba[i + 1] < 28 && rgba[i + 2] < 28
}

/** Clear only backdrop black connected to the image edge. */
function clearBackdrop(rgba, w, h) {
    const seen = new Uint8Array(w * h)
    const stack = []
    const push = (x, y) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return
        const p = y * w + x
        if (seen[p]) return
        if (!isBackdrop(rgba, p * 4)) return
        seen[p] = 1
        stack.push(p)
    }
    for (let x = 0; x < w; x++) {
        push(x, 0)
        push(x, h - 1)
    }
    for (let y = 0; y < h; y++) {
        push(0, y)
        push(w - 1, y)
    }
    while (stack.length) {
        const p = stack.pop()
        rgba[p * 4 + 3] = 0
        const x = p % w
        const y = (p - x) / w
        push(x + 1, y)
        push(x - 1, y)
        push(x, y + 1)
        push(x, y - 1)
    }
}

function flipHorizontal(rgba, w, h) {
    const out = new Uint8Array(rgba.length)
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const si = (y * w + (w - 1 - x)) * 4
            const di = (y * w + x) * 4
            out[di] = rgba[si]
            out[di + 1] = rgba[si + 1]
            out[di + 2] = rgba[si + 2]
            out[di + 3] = rgba[si + 3]
        }
    }
    return out
}

const files = fs
    .readdirSync(SRC_DIR)
    .filter((name) => name.endsWith('.png'))
    .sort()
if (files.length === 0) {
    console.error(`No frames in ${SRC_DIR}`)
    process.exit(1)
}
fs.mkdirSync(OUT_DIR, { recursive: true })

const meta = {}
for (const name of files) {
    const img = readPng(path.join(SRC_DIR, name))
    clearBackdrop(img.rgba, img.width, img.height)
    const flipped = flipHorizontal(img.rgba, img.width, img.height)
    const outPath = path.join(OUT_DIR, name)
    writePng(outPath, img.width, img.height, flipped)
    const key = name.replace(/\.png$/, '')
    meta[key] = { width: img.width, height: img.height }
    console.log(`Wrote ${outPath}`)
}
fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2))
