import type { Metadata } from 'next'
import { config } from '@/lib/config/server'
import { DinoApp } from '@/components/dino/dino-app'

export const metadata: Metadata = {
    title: `${config.app.name} — Autonomous Runner`,
    description: config.app.description,
}

export default function HomePage() {
    return <DinoApp />
}
