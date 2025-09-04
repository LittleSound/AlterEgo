export function log(...messages: any[]) {
  // eslint-disable-next-line no-console
  console.log(`[LOG]:`, ...messages)
}
export function warn(...messages: any[]) {
  console.warn(`[WARN]:`, ...messages)
}
export function error(...messages: any[]) {
  console.error(`[ERROR]:`, ...messages)
}
