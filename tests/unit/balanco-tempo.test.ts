import { describe, expect, it } from 'vitest';
import { DetectorDeBalanco } from '@/dominio/balanco';
import { ancoraDivergente, calcularAncora, horarioAncorado } from '@/dominio/tempo';
import { normalizarApelido, validarApelido, sugerirApelido } from '@/dominio/apelido';
import { esperaDoBackoff } from '@/dominio/backoff';

describe('balanço (RF-22)', () => {
  // Amostra parada em t=0 (inicia a carência); sacudidas começam depois dela.
  const sacudir = (det: DetectorDeBalanco, picos: number, passo = 200, inicio = 400) => {
    det.alimentar({ x: 0, y: 0, z: 9.8, t: 0 });
    let ok = false;
    for (let i = 0; i <= picos; i++) ok = det.alimentar({ x: i % 2 ? 20 : -5, y: 0, z: 9.8, t: inicio + i * passo }).completo || ok;
    return ok;
  };

  it('padrão: 4 sacudidas completam o gesto, 3 não', () => {
    expect(sacudir(new DetectorDeBalanco(), 4)).toBe(true);
    expect(sacudir(new DetectorDeBalanco(), 3)).toBe(false);
  });

  it('o número de sacudidas é configurável por ponto', () => {
    expect(sacudir(new DetectorDeBalanco(2), 2)).toBe(true);
    expect(sacudir(new DetectorDeBalanco(6), 5)).toBe(false);
    expect(sacudir(new DetectorDeBalanco(6), 6)).toBe(true);
  });

  it('o tranco do toque que arma o gesto não conta como sacudida', () => {
    const d = new DetectorDeBalanco();
    d.alimentar({ x: 0, y: 0, z: 9.8, t: 0 });
    // Pancada forte logo depois de armar (dentro da carência): ignorada.
    expect(d.alimentar({ x: 30, y: 0, z: 9.8, t: 80 }).picos).toBe(0);
    expect(d.alimentar({ x: 0, y: 0, z: 9.8, t: 200 }).picos).toBe(0);
    // Depois da carência, conta normalmente.
    expect(d.alimentar({ x: 30, y: 0, z: 9.8, t: 400 }).picos).toBe(1);
  });

  it('informa o progresso de cada sacudida (1 de 4, 2 de 4…)', () => {
    const d = new DetectorDeBalanco();
    d.alimentar({ x: 0, y: 0, z: 9.8, t: 0 });
    const r = [0, 1, 2, 3, 4].map((i) => d.alimentar({ x: i % 2 ? 20 : -5, y: 0, z: 9.8, t: 400 + i * 200 }));
    expect(r.map((x) => x.picos)).toEqual([0, 1, 2, 3, 4]);
    expect(r.map((x) => x.novoPico)).toEqual([false, true, true, true, true]);
    expect(r[4]!.completo).toBe(true);
  });

  it('o progresso volta a zero se a pessoa parar', () => {
    const d = new DetectorDeBalanco();
    d.alimentar({ x: 0, y: 0, z: 9.8, t: 0 });
    d.alimentar({ x: -5, y: 0, z: 9.8, t: 400 });
    expect(d.alimentar({ x: 20, y: 0, z: 9.8, t: 600 }).picos).toBe(1);
    expect(d.alimentar({ x: 20, y: 0, z: 9.8, t: 4000 }).picos).toBe(0);
  });

  it('picos espaçados demais não contam', () => {
    expect(sacudir(new DetectorDeBalanco(), 4, 1100)).toBe(false);
  });

  it('balanço leve não conta', () => {
    const d = new DetectorDeBalanco();
    let ok = false;
    for (let i = 0; i < 30; i++) ok = d.alimentar({ x: i % 2 ? 5 : -5, y: 0, z: 9.8, t: i * 100 }).completo || ok;
    expect(ok).toBe(false);
  });
});

describe('âncora de tempo (seção 7.2)', () => {
  it('meio da ida e volta', () => {
    const { ancora, desvio } = calcularAncora(1_000_000, 100, 300, 990_000);
    expect(ancora).toEqual({ servidor: 1_000_100, perf: 300 });
    expect(desvio).toBe(10_100);
  });
  it('monotônica com âncora, relógio corrigido sem', () => {
    const ancora = { servidor: 1_000_000, perf: 500 };
    expect(horarioAncorado(ancora, 0, 1500, 0)).toEqual({ t: 1_001_000, fonte: 'monotonica' });
    expect(horarioAncorado(null, 2000, 0, 5000)).toEqual({ t: 7000, fonte: 'relogio-corrigido' });
  });
  it('divergência > 2 s invalida a âncora', () => {
    const ancora = { servidor: 10_000, perf: 0 };
    expect(ancoraDivergente(ancora, 0, 1000, 11_000)).toBe(false);
    expect(ancoraDivergente(ancora, 0, 1000, 20_000)).toBe(true);
  });
});

describe('apelido (RF-02)', () => {
  it('normaliza acento, caixa e espaços', () => {
    expect(normalizarApelido('  Ána   LIMA ')).toBe('ana lima');
    expect(normalizarApelido('João')).toBe(normalizarApelido('joao'));
  });
  it('valida', () => {
    expect(validarApelido('A')).not.toBeNull();
    expect(validarApelido('Ana/Lima')).not.toBeNull();
    expect(validarApelido('Ana Lima')).toBeNull();
  });
  it('sugere o primeiro nome', () => {
    expect(sugerirApelido('Ana Lima Souza')).toBe('Ana');
    expect(sugerirApelido(null)).toBe('');
  });
});

describe('backoff (RNF-07)', () => {
  it('2 s → 60 s com jitter', () => {
    expect(esperaDoBackoff(0, 0.5)).toBe(2000);
    expect(esperaDoBackoff(1, 0.5)).toBe(4000);
    expect(esperaDoBackoff(10, 0.5)).toBe(60_000);
    expect(esperaDoBackoff(0, 0)).toBe(1600);
    expect(esperaDoBackoff(0, 0.9999)).toBeLessThanOrEqual(2400);
  });
});
