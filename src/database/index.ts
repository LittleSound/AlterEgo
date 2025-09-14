import { drizzle } from 'drizzle-orm/node-postgres'

export function setupDatabase(options: { databaseUrl: string }) {
  const database = drizzle(options.databaseUrl)

  return { database }
}

export { memoryTable } from './memory'
