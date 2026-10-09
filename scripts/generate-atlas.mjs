/**
 * Generates public/sprites/atlas.png (256×256 pixel art atlas).
 * Run: node scripts/generate-atlas.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const W = 256
const H = 256
const pixels = new Uint8Array(W * H * 4)

function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= W || y >= H) return
    const i = (y * W + x) * 4
    pixels[i] = r
    pixels[i + 1] = g
    pixels[i + 2] = b
    pixels[i + 3] = a
}

function fillRect(x, y, w, h, r, g, b) {
    for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) setPixel(px, py, r, g, b)
    }
}

const ink = [28, 25, 21]
const bone = [243, 239, 228]
const green = [58, 122, 72]
const sand = [212, 196, 168]
const orange = [224, 120, 48]

fillRect(0, 0, W, H, ...sand)

for (let f = 0; f < 6; f++) {
    const ox = f * 32
    fillRect(ox + 8, 8, 16, 28, ...ink)
    fillRect(ox + 20, 12 + (f % 2) * 4, 8, 4, ...ink)
    fillRect(ox + 4, 20, 6, 8, ...ink)
}

fillRect(192, 8, 20, 32, ...ink)
fillRect(216, 8, 16, 40, ...ink)
fillRect(236, 8, 28, 30, ...green)
fillRect(192, 48, 72, 8, ...green)

for (let f = 0; f < 4; f++) {
    fillRect(f * 16, 56, 14, 10, ...orange)
    fillRect(f * 16 + 4, 54 + (f % 2), 8, 4, ...orange)
}

fillRect(0, 72, 64, 8, ...bone)
fillRect(0, 88, 128, 24, sand[0], sand[1], sand[2])
fillRect(0, 112, 64, 16, sand[0] - 20, sand[1] - 20, sand[2] - 20)

for (let f = 0; f < 4; f++) fillRect(140 + f * 8, 96, 6, 6, ...bone)

fillRect(200, 88, 24, 24, 255, 220, 120)

function crc32(buf) {
    let c = ~0
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i]
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    return ~c >>> 0
}

function chunk(type, data) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const typeBuf = Buffer.from(type)
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
    return Buffer.concat([len, typeBuf, data, crcBuf])
}

const raw = Buffer.alloc((W * 4 + 1) * H)
let off = 0
for (let y = 0; y < H; y++) {
    raw[off++] = 0
    for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        raw[off++] = pixels[i]
        raw[off++] = pixels[i + 1]
        raw[off++] = pixels[i + 2]
        raw[off++] = pixels[i + 3]
    }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8
ihdr[9] = 6
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
])

const outDir = path.join(__dirname, '../public/sprites')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'atlas.png'), png)
console.log('Wrote public/sprites/atlas.png')
