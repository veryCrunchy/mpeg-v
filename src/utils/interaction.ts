export function createId(namespace: string, ...args: unknown[]): string {
  return `${namespace};${args.join(';')}`
}

export function readId(id: string): [namespace: string | undefined, ...args: string[]] {
  const [namespace, ...args] = id.split(';')
  return [namespace, ...args]
}
