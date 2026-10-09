import { env } from './env'

export const config = {
    app: {
        name: process.env.NEXT_PUBLIC_APP_NAME || 'DINO.AI',
        description:
            process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
            'Autonomous Chrome Dino-style runner powered by Laya decision latency',
        url: env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    },
    laya: {
        baseUrl: env.LAYA_BASE_URL,
        apiKey: env.LAYA_API_KEY,
    },
} as const
