/** Database is disabled for DINO.AI. Auth/todo routes remain in repo but are not wired. */

import type { NeonDatabase } from 'drizzle-orm/neon-serverless'
import type * as schema from '@/db/schema'

const disabledMessage = 'Database is disabled. Drizzle is not connected in this build.'

export const db = new Proxy({} as NeonDatabase<typeof schema>, {
    get() {
        throw new Error(disabledMessage)
    },
    apply() {
        throw new Error(disabledMessage)
    },
})

export function getDb(): typeof db {
    throw new Error(disabledMessage)
}
