/**
 * Generates public/sprites/atlas.png (512×512 pixel art atlas).
 * Run: pnpm run sprites:atlas
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const W = 512
const H = 512
const pixels = new Uint8Array(W * H * 4)

function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= W || y >= H) return
    const i = (y * W + x) * 4
    pixels[i] = r
    pixels[i + 1] = g
    pixels[i + 2] = b
    pixels[i + 3] = a
}

function fillRect(x, y, w, h, r, g, b, a = 255) {
    for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) setPixel(px, py, r, g, b, a)
    }
}

const ink = [28, 25, 21]
const bone = [247, 243, 234]
const green = [46, 110, 62]
const sand = [232, 220, 196]
const orange = [224, 120, 48]

for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) setPixel(x, y, ...sand, 0)
}

function dinoRunFrame(ox, legUp) {
    fillRect(ox + 10, 12, 18, 28, ...ink)
    fillRect(ox + 26, 16, 12, 10, ...ink)
    fillRect(ox + 6, 34 + (legUp ? 0 : 4), 8, 10, ...ink)
    fillRect(ox + 22, 34 + (legUp ? 4 : 0), 8, 10, ...ink)
    fillRect(ox + 30, 18, 14, 4, ...ink)
}

for (let f = 0; f < 6; f++) dinoRunFrame(8 + f * 48, f % 2 === 0)

fillRect(296, 8, 18, 32, ...ink)
fillRect(314, 12, 12, 10, ...ink)
fillRect(292, 36, 8, 10, ...ink)

fillRect(8, 64, 44, 22, ...ink)
fillRect(68, 66, 44, 20, ...ink)
fillRect(128, 68, 44, 24, ...ink)

fillRect(8, 120, 20, 36, ...green)
fillRect(14, 108, 8, 12, ...green)
fillRect(40, 120, 24, 48, ...green)
fillRect(76, 120, 40, 40, ...green)

function pteroFrame(ox, oy, wingUp) {
    fillRect(ox + 12, oy + 8, 14, 8, ...ink)
    fillRect(ox + 24, oy + 10, 8, 4, ...ink)
    if (wingUp) {
        fillRect(ox + 2, oy + 2, 10, 6, ...ink)
        fillRect(ox + 22, oy + 4, 12, 4, ...ink)
    } else {
        fillRect(ox + 4, oy + 14, 12, 4, ...ink)
        fillRect(ox + 20, oy + 12, 12, 6, ...ink)
    }
    fillRect(ox + 10, oy + 16, 6, 4, ...orange)
}

for (let f = 0; f < 4; f++) pteroFrame(224 + f * 40, 152, f % 2 === 0)

fillRect(8, 184, 64, 12, ...bone)
fillRect(8, 204, 256, 20, sand[0] - 18, sand[1] - 18, sand[2] - 18)
fillRect(280, 184, 46, 14, 255, 255, 255, 200)
fillRect(340, 184, 28, 28, 255, 220, 120)

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
