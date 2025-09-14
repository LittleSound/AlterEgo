import { drizzle } from 'drizzle-orm/postgres-js'

export function setupDatabase(options: { databaseUrl: string }) {
  const database = drizzle(options.databaseUrl)

  return { database }
}

export { memoryTable } from './memory'
