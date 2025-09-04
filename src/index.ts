import { Elysia } from 'elysia'

const app = new Elysia().get('/', () => 'Hello Elysia').listen(34466)

// eslint-disable-next-line no-console
console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
)
