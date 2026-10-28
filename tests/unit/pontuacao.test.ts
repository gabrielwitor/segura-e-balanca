import { describe, expect, it } from 'vitest';
import { emPausa, nivelDoValor, pontosDaPosicao, tabelaDePontos } from '@/dominio/pontuacao';
import { ponto } from './fabricas';

describe('pontuação (RF-40)', () => {
  it('100, passo 10%, piso 20% → 100, 90, …, 20 e fica no piso', () => {
    const p = ponto('a');
    expect([1, 2, 3, 4, 8, 9, 10, 30].map((i) => pontosDaPosicao(p, i))).toEqual([100, 90, 80, 70, 30, 20, 20, 20]);
  });

  it('arredonda', () => {
    expect(pontosDaPosicao(ponto('a', { valorBase: 75, passoPct: 0.15 }), 2)).toBe(64);
  });

  it('tabela para no piso', () => {
    expect(tabelaDePontos(ponto('a'))).toEqual([100, 90, 80, 70, 60, 50, 40, 30, 20]);
  });

  it('nível do blip (RF-13)', () => {
    const p = ponto('a');
    expect(nivelDoValor(p, 1)).toBe('alto');
    expect(nivelDoValor(p, 4)).toBe('alto');
    expect(nivelDoValor(p, 5)).toBe('medio');
    expect(nivelDoValor(p, 8)).toBe('baixo');
  });
});

describe('pausas (RF-37)', () => {
  const pausas = [{ de: 100, ate: 200 }, { de: 500, ate: null }];
  it('dentro, fora e pausa aberta', () => {
    expect(emPausa(99, pausas)).toBe(false);
    expect(emPausa(100, pausas)).toBe(true);
    expect(emPausa(200, pausas)).toBe(false);
    expect(emPausa(10_000, pausas)).toBe(true);
  });
});
