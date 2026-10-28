import { describe, expect, it } from 'vitest';
import { calcularRanking } from '@/dominio/ranking';
import { entrada, fila, ponto } from './fabricas';

const semPausa = { pausas: [] };

describe('calcularRanking (seção 7.1)', () => {
  it('ordena por horário e soma por jogador', () => {
    const r = calcularRanking(
      [ponto('A'), ponto('B', { valorBase: 50 })],
      {
        A: fila('A', { a1: entrada('ana', 10), b1: entrada('bia', 5) }),
        B: fila('B', { a2: entrada('ana', 1) }),
      },
      semPausa,
    );
    expect(r.ranking).toEqual([
      { uid: 'ana', pontos: 140, pos: 1 },
      { uid: 'bia', pontos: 100, pos: 2 },
    ]);
    expect(r.status.get('b1')).toEqual({ tipo: 'valida', pos: 1, pts: 100 });
  });

  it('sync atrasado de quem balançou antes empurra os outros (RF-41)', () => {
    const antes = calcularRanking([ponto('A')], { A: fila('A', { c: entrada('carla', 20) }) }, semPausa);
    expect(antes.ranking[0]).toMatchObject({ uid: 'carla', pontos: 100 });
    const depois = calcularRanking(
      [ponto('A')],
      { A: fila('A', { c: entrada('carla', 20), b: entrada('bruno', 10, { recebidoEm: 999 }) }) },
      semPausa,
    );
    expect(depois.ranking).toEqual([
      { uid: 'bruno', pontos: 100, pos: 1 },
      { uid: 'carla', pontos: 90, pos: 2 },
    ]);
  });

  it('conflito: mesmo jogador, dois aparelhos → vale o menor horário (RF-36)', () => {
    const r = calcularRanking(
      [ponto('A')],
      {
        A: fila('A', {
          'bruno_cel_0': entrada('bruno', 100, { dispositivoId: 'cel' }),
          'bruno_tab_0': entrada('bruno', 50, { dispositivoId: 'tab' }),
          'diego_x_0': entrada('diego', 70),
        }),
      },
      semPausa,
    );
    expect(r.status.get('bruno_tab_0')).toEqual({ tipo: 'valida', pos: 1, pts: 100 });
    expect(r.status.get('bruno_cel_0')).toEqual({ tipo: 'conflito', vencedora: 'bruno_tab_0' });
    expect(r.status.get('diego_x_0')).toEqual({ tipo: 'valida', pos: 2, pts: 90 });
    expect(r.filas.get('A')!.map((e) => e.chave)).toEqual(['bruno_tab_0', 'diego_x_0']);
  });

  it('o resultado não depende da ordem de chegada (RNF-05)', () => {
    const es = { x: entrada('a', 3), y: entrada('b', 1), z: entrada('a', 2, { dispositivoId: 'd2' }), w: entrada('c', 2) };
    const r1 = calcularRanking([ponto('A')], { A: fila('A', es) }, semPausa);
    const invertido = Object.fromEntries(Object.entries(es).reverse());
    const r2 = calcularRanking([ponto('A')], { A: fila('A', invertido) }, semPausa);
    expect(r1.ranking).toEqual(r2.ranking);
  });

  it('empate exato: chegada no servidor, depois chave (RNF-06); pendente vai por último', () => {
    const r = calcularRanking(
      [ponto('A')],
      {
        A: fila('A', {
          k3: entrada('c', 10, { recebidoEm: null }),
          k2: entrada('b', 10, { recebidoEm: 500 }),
          k1: entrada('a', 10, { recebidoEm: 500 }),
          k0: entrada('d', 10, { recebidoEm: 600 }),
        }),
      },
      semPausa,
    );
    expect(r.filas.get('A')!.map((e) => e.chave)).toEqual(['k1', 'k2', 'k0', 'k3']);
  });

  it('anulada, pausa e desativação não pontuam (RF-24, RF-37)', () => {
    const r = calcularRanking(
      [ponto('A', { desativadoEm: 1000, ativo: false })],
      {
        A: fila('A', {
          an: entrada('a', 10, { anulada: true }),
          pa: entrada('b', 150),
          de: entrada('c', 1000),
          ok: entrada('d', 999),
          re: entrada('a', 300, { v: 1 }),
        }),
      },
      { pausas: [{ de: 100, ate: 200 }] },
    );
    expect(r.status.get('an')).toEqual({ tipo: 'anulada' });
    expect(r.status.get('pa')).toEqual({ tipo: 'pausa' });
    expect(r.status.get('de')).toEqual({ tipo: 'desativado' });
    // Depois de anulada, pode balançar de novo e entra com o horário novo.
    expect(r.status.get('re')).toEqual({ tipo: 'valida', pos: 1, pts: 100 });
    expect(r.status.get('ok')).toEqual({ tipo: 'valida', pos: 2, pts: 90 });
  });

  it('empate no total divide a posição', () => {
    const r = calcularRanking(
      [ponto('A'), ponto('B')],
      { A: fila('A', { a: entrada('ana', 1), b: entrada('bia', 2) }), B: fila('B', { c: entrada('bia', 1), d: entrada('ana', 2) }) },
      semPausa,
    );
    expect(r.ranking.map((l) => l.pos)).toEqual([1, 1]);
  });
});
