import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { comLimite } from '@/jogador/sensores';

describe('pedido de permissão com limite de tempo (tela de sensores)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('responde normalmente quando a resposta chega a tempo', async () => {
    const r = comLimite(Promise.resolve('ok'), 20_000, 'sem-resposta');
    await expect(r).resolves.toBe('ok');
  });

  it('diálogo que nunca responde vira "sem resposta" (a tela não fica presa)', async () => {
    const r = comLimite(new Promise<string>(() => {}), 20_000, 'sem-resposta');
    vi.advanceTimersByTime(20_000);
    await expect(r).resolves.toBe('sem-resposta');
  });

  it('pedido que falha também vira "sem resposta"', async () => {
    const r = comLimite(Promise.reject(new Error('NotAllowedError')), 15_000, null);
    await expect(r).resolves.toBeNull();
  });
});
