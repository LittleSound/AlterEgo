import { defineConfig } from 'drizzle-kit'

console.log('Drizzle config env:', process.env)

export default defineConfig({
  out: './drizzle',
  // schema: './src/db/schema.ts',
  schema: './src/database/index.ts',
  dialect: 'postgresql',
  dbCredentials: {
    // eslint-disable-next-line node/prefer-global/process
    url: process.env.POSTGRESQL_DATABASE_URL!,
  },
})
