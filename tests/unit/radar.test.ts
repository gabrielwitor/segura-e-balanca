import { describe, expect, it } from 'vitest';
import { alcance, faixaDaDistancia, haversine, rumo, setor, tendencia } from '@/dominio/radar';

const origem = { lat: -23.5589, lng: -46.7315 };
// ~1 grau de latitude ≈ 111,2 km
const norte = (m: number) => ({ lat: origem.lat + m / 111_195, lng: origem.lng });

describe('radar (seção 7.3)', () => {
  it('haversine', () => {
    expect(haversine(origem, norte(100))).toBeCloseTo(100, 0);
  });

  it('rumo e setor relativo ao heading', () => {
    expect(rumo(origem, norte(100))).toBeCloseTo(0, 1);
    expect(setor(0, 0)).toBe(0);
    expect(setor(90, 0)).toBe(2);
    expect(setor(0, 90)).toBe(6);
    expect(setor(350, 0)).toBe(0);
    expect(setor(200, 0)).toBe(4);
  });

  it('faixas e histerese', () => {
    expect(faixaDaDistancia(49)).toBe('quente');
    expect(faixaDaDistancia(150)).toBe('morno');
    expect(faixaDaDistancia(151)).toBe('frio');
    expect(faixaDaDistancia(55, 'quente')).toBe('quente');
    expect(faixaDaDistancia(61, 'quente')).toBe('morno');
    expect(faixaDaDistancia(45, 'morno')).toBe('morno');
    expect(faixaDaDistancia(39, 'morno')).toBe('quente');
    expect(faixaDaDistancia(155, 'morno')).toBe('morno');
    expect(faixaDaDistancia(145, 'frio')).toBe('frio');
    expect(faixaDaDistancia(139, 'frio')).toBe('morno');
  });

  it('tendência pela média móvel', () => {
    const caindo = [{ t: 0, d: 120 }, { t: 5000, d: 115 }, { t: 12_000, d: 100 }, { t: 18_000, d: 95 }];
    expect(tendencia(caindo, 19_000)).toBe('esquentando');
    const subindo = caindo.map((a) => ({ ...a, d: 200 - a.d }));
    expect(tendencia(subindo, 19_000)).toBe('esfriando');
    expect(tendencia([{ t: 0, d: 50 }], 1000)).toBe('estavel');
  });

  it('alcance (RF-20, RF-21)', () => {
    expect(alcance(30, 8, 25)).toBe('dentro');
    expect(alcance(40, 8, 25)).toBe('fora');
    expect(alcance(20, 38, 25)).toBe('gps-impreciso');
    expect(alcance(100, 38, 25)).toBe('fora');
  });
});
