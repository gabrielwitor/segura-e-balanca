import { afterEach, describe, expect, it, vi } from 'vitest';

// Simula o iPhone: DeviceMotionEvent/DeviceOrientationEvent com requestPermission, e um document.
async function carregarComoIphone(resposta: 'granted' | 'denied' = 'granted') {
  vi.resetModules();
  const pedidos = { n: 0 };
  const api = { requestPermission: async () => (pedidos.n++, resposta) };
  Object.assign(globalThis, { DeviceMotionEvent: api, DeviceOrientationEvent: api, document: new EventTarget() });
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 });
  const mod = await import('@/jogador/sensores');
  return { ...mod, pedidos };
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ['DeviceMotionEvent', 'DeviceOrientationEvent', 'document']) delete (globalThis as Record<string, unknown>)[k];
});

const microtarefas = () => new Promise((r) => setTimeout(r, 0));

describe('permissão de movimento depois de recarregar (iOS)', () => {
  it('começa bloqueada e libera no primeiro toque válido (click), não no pointerdown', async () => {
    const { permissaoDeMovimento, pedirMovimentoNoPrimeiroToque, pedidos } = await carregarComoIphone();
    expect(permissaoDeMovimento.liberada()).toBe(false);
    pedirMovimentoNoPrimeiroToque();
    document.dispatchEvent(new Event('pointerdown'));
    await microtarefas();
    expect(pedidos.n).toBe(0);
    document.dispatchEvent(new Event('click'));
    await microtarefas();
    expect(pedidos.n).toBe(2);
    expect(permissaoDeMovimento.liberada()).toBe(true);
  });

  it('pede uma vez só, mesmo com vários toques', async () => {
    const { pedirMovimentoNoPrimeiroToque, pedidos } = await carregarComoIphone('denied');
    pedirMovimentoNoPrimeiroToque();
    document.dispatchEvent(new Event('touchend'));
    document.dispatchEvent(new Event('click'));
    await microtarefas();
    expect(pedidos.n).toBe(2); // movimento + orientação, uma vez
  });

  it('fora do iOS já começa liberada, mesmo com requestPermission (Chrome recente)', async () => {
    vi.resetModules();
    const api = { requestPermission: async () => 'denied' as const };
    Object.assign(globalThis, { DeviceMotionEvent: api, DeviceOrientationEvent: api });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/130.0 Mobile', platform: 'Linux armv8l', maxTouchPoints: 5 });
    const { permissaoDeMovimento } = await import('@/jogador/sensores');
    expect(permissaoDeMovimento.liberada()).toBe(true);
  });
});
