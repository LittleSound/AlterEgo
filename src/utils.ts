export function invoke<T extends (...args: any) => any>(cb: T): ReturnType<T> {
  return cb()
}
