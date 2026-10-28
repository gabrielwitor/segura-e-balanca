import { ErroRemoto, type CodigoErroRemoto } from '@/sync/remoto';

export function traduzirErro(err: unknown): ErroRemoto {
  if (err instanceof ErroRemoto) return err;
  // Pelo `code`, não por instanceof: o bundle pode ter mais de uma cópia da classe de erro.
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string') {
    const mapa: Partial<Record<string, CodigoErroRemoto>> = {
      'permission-denied': 'permission-denied',
      'not-found': 'not-found',
      unavailable: 'unavailable',
      'deadline-exceeded': 'timeout',
      'failed-precondition': 'unavailable',
    };
    return new ErroRemoto(mapa[code.replace(/^firestore\//, '')] ?? 'outro', err instanceof Error ? err.message : code);
  }
  return new ErroRemoto('outro', err instanceof Error ? err.message : String(err));
}

export async function traduzindo<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    throw traduzirErro(err);
  }
}
