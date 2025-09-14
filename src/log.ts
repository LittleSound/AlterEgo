let isVerbose = true

export function setVerboseMode(verbose: boolean) {
  isVerbose = verbose
}
export function getVerboseMode() {
  return isVerbose
}

export function log(...messages: any[]) {
  // eslint-disable-next-line no-console
  isVerbose && console.log(`[LOG]:`, ...messages)
}
export function warn(...messages: any[]) {
  console.warn(`[WARN]:`, ...messages)
}
export function error(...messages: any[]) {
  console.error(`[ERROR]:`, ...messages)
}

export function defineLogStreamed(startText = '') {
  // eslint-disable-next-line node/prefer-global/process
  if (typeof process === 'undefined' || !process.stdout || !process.stdout.write) {
    return (_text: string) => {}
  }
  // 新起一行 log
  // eslint-disable-next-line node/prefer-global/process
  ;isVerbose && process.stdout.write(`\n[LOG]: ${startText}`)
  return (text: string) => {
    // eslint-disable-next-line node/prefer-global/process
    ;isVerbose && process.stdout.write(text)
  }
}
