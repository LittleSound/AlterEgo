import { bigint, jsonb, pgTable, varchar } from 'drizzle-orm/pg-core'
import { nanoid } from 'nanoid'

export const memoryTable = pgTable('memory', {
  id: varchar('id').$defaultFn(() => nanoid(21)).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull().unique(),
  content: jsonb('content').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
})
