const ERR = Symbol('ERR')

export type Err = {
  [ERR]: true
  error: unknown
  type?: ErrTypes
}

type ErrTypes = 'internal' | 'fileSystem' | 'badRequest'

export function isErr(x: unknown): x is Err {
  return typeof x === 'object' && x != null && ERR in x
}

export function NewErr(message: string, type?: ErrTypes): Err {
  return { [ERR]: true, error: message, type: type }
}

export function NewBadRequestErr(message: string): Err {
  return { [ERR]: true, error: message, type: 'badRequest' }
}

export function NewInternalErr(message: string): Err {
  return { [ERR]: true, error: message, type: 'internal' }
}

// To wrap an error throwing function
export async function tryFail<T>(f: (() => Promise<T>) | (() => T)): Promise<T | Err> {
  try {
    return await f()
  } catch (e) {
    return { [ERR]: true, error: e }
  }
}
