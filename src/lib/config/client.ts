export const clientConfig = {
    app: {
        name: process.env.NEXT_PUBLIC_APP_NAME || 'DINO.AI',
        description:
            process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
            'Autonomous runner — Laya chooses JUMP, DUCK, or RUN before the deadline',
        url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    },
} as const
