import { NextResponse, type NextRequest } from 'next/server'

const STATIC_PATH_PREFIXES = ['/_next', '/icons', '/images', '/sprites']
const PUBLIC_FILE_EXTENSIONS = /\.(?:ico|png|jpg|jpeg|gif|svg|txt|xml|webmanifest)$/
const PUBLIC_FILE_PATHS = new Set(['/favicon.ico', '/manifest.json', '/robots.txt'])

const isStaticAsset = (pathname: string) =>
    STATIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    PUBLIC_FILE_PATHS.has(pathname) ||
    PUBLIC_FILE_EXTENSIONS.test(pathname)

export default function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl

    if (isStaticAsset(pathname)) {
        return NextResponse.next()
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image).*)'],
}
