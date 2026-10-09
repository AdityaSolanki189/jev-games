import type { Metadata } from 'next'
import { cn } from '@/lib/utils/utils'
import { config } from '@/lib/config/server'
import { IBM_Plex_Mono, Silkscreen } from 'next/font/google'
import '@/app/globals.css'
import Providers from '@/app/providers'

const silkscreen = Silkscreen({
    weight: ['400', '700'],
    subsets: ['latin'],
    variable: '--font-display',
})

const ibmPlexMono = IBM_Plex_Mono({
    weight: ['400', '500', '600'],
    subsets: ['latin'],
    variable: '--font-mono',
})

export const metadata: Metadata = {
    title: {
        default: config.app.name,
        template: `%s | ${config.app.name}`,
    },
    description: config.app.description,
    metadataBase: new URL(config.app.url),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body
                className={cn(
                    silkscreen.variable,
                    ibmPlexMono.variable,
                    'min-h-screen bg-[#f3efe4] font-mono text-[#1c1915] antialiased',
                )}
            >
                <Providers>{children}</Providers>
            </body>
        </html>
    )
}
