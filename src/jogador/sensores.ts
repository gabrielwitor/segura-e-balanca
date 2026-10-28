import { useEffect, useRef, useState } from 'react';
import { DetectorDeBalanco } from '@/dominio/balanco';

type ComPermissao = { requestPermission?: () => Promise<'granted' | 'denied'> };

const motion = () => (globalThis as { DeviceMotionEvent?: ComPermissao }).DeviceMotionEvent;
const orient = () => (globalThis as { DeviceOrientationEvent?: ComPermissao }).DeviceOrientationEvent;

const ehIos = () =>
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/**
 * Só o iOS bloqueia movimento e orientação até o pedido explícito. O Chrome recente também expõe
 * requestPermission, mas os sensores funcionam sem ele: lá não exigimos nada (nem bloqueamos o botão).
 */
export const movimentoPrecisaDePermissao = () =>
  ehIos() && (typeof motion()?.requestPermission === 'function' || typeof orient()?.requestPermission === 'function');

/**
 * O iOS esquece a permissão a cada carregamento da página (atualização, recarga): é preciso pedir
 * de novo, dentro de um toque. Se já foi dada antes, libera sem mostrar nada.
 */
let liberadoNestaPagina = !movimentoPrecisaDePermissao();
const ouvintes = new Set<() => void>();

export const permissaoDeMovimento = {
  liberada: () => liberadoNestaPagina,
  inscrever(cb: () => void) {
    ouvintes.add(cb);
    return () => ouvintes.delete(cb);
  },
};

/** RF-05: precisa rodar dentro de um toque (click/touchend; no iOS, pointerdown não serve). */
export async function pedirPermissaoDeMovimento(): Promise<boolean> {
  const pedidos: Promise<'granted' | 'denied'>[] = [];
  const m = motion();
  const o = orient();
  if (typeof m?.requestPermission === 'function') pedidos.push(m.requestPermission());
  if (typeof o?.requestPermission === 'function') pedidos.push(o.requestPermission());
  try {
    const r = await Promise.all(pedidos);
    const ok = r.every((x) => x === 'granted');
    if (ok && !liberadoNestaPagina) {
      liberadoNestaPagina = true;
      ouvintes.forEach((cb) => cb());
    }
    return ok;
  } catch {
    return false;
  }
}

/** Depois de recarregar, pede de novo no primeiro toque válido em qualquer lugar do app. */
export function pedirMovimentoNoPrimeiroToque(): void {
  if (liberadoNestaPagina) return;
  const eventos = ['touchend', 'click'] as const;
  // Trava própria: um toque gera touchend e click, e o pedido deve sair uma vez só.
  let pedido = false;
  const tentar = () => {
    if (pedido) return;
    pedido = true;
    eventos.forEach((e) => document.removeEventListener(e, tentar, true));
    void pedirPermissaoDeMovimento();
  };
  eventos.forEach((e) => document.addEventListener(e, tentar, true));
}

/**
 * Resolve com `semResposta` se a promessa não terminar a tempo. O pedido de permissão do sistema
 * pode nunca responder (diálogo fechado sem escolha, UI "silenciosa" do Chrome, app instalado no
 * iPhone) e a tela não pode ficar presa esperando.
 */
export function comLimite<T, R>(p: Promise<T>, ms: number, semResposta: R): Promise<T | R> {
  return new Promise((resolve) => {
    const id = setTimeout(() => resolve(semResposta), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      () => {
        clearTimeout(id);
        resolve(semResposta);
      },
    );
  });
}

export function pedirLocalizacao(): Promise<'ok' | 'negada' | 'indisponivel'> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve('indisponivel');
    navigator.geolocation.getCurrentPosition(
      () => resolve('ok'),
      (e) => resolve(e.code === e.PERMISSION_DENIED ? 'negada' : 'ok'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  });
}

/** RF-05: um toque pede tudo. Movimento primeiro (precisa do gesto ainda "quente" no iOS). */
export async function pedirPermissoes(): Promise<'ok' | 'localizacao-negada' | 'sem-localizacao'> {
  await pedirPermissaoDeMovimento();
  const loc = await pedirLocalizacao();
  if (loc === 'negada') return 'localizacao-negada';
  if (loc === 'indisponivel') return 'sem-localizacao';
  return 'ok';
}

export interface Leitura {
  lat: number;
  lng: number;
  accuracy: number;
  t: number;
}

export type EstadoGps = { tipo: 'aguardando' } | { tipo: 'ok'; leitura: Leitura } | { tipo: 'negado' } | { tipo: 'erro' };

const visivel = () => document.visibilityState === 'visible';

/** RNF-10: GPS em alta precisão só com o radar visível. */
export function usePosicao(ativo: boolean): EstadoGps {
  const [estado, setEstado] = useState<EstadoGps>({ tipo: 'aguardando' });
  const [aba, setAba] = useState(visivel());

  useEffect(() => {
    const f = () => setAba(visivel());
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);

  useEffect(() => {
    if (!ativo || !aba || !('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const { latitude: lat, longitude: lng, accuracy } = p.coords;
        // Leitura sem coordenada válida (alguns navegadores entregam NaN) é ignorada.
        if ([lat, lng, accuracy].every(Number.isFinite)) setEstado({ tipo: 'ok', leitura: { lat, lng, accuracy, t: p.timestamp } });
      },
      (e) => setEstado(e.code === e.PERMISSION_DENIED ? { tipo: 'negado' } : (s) => (s.tipo === 'ok' ? s : { tipo: 'erro' })),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [ativo, aba]);

  return estado;
}

/**
 * Seção 7.3: webkitCompassHeading no iOS; deviceorientationabsolute no Android.
 * null = sem bússola → o radar vira lista (RF-16).
 */
export function useBussola(ativo: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  useEffect(() => {
    if (!ativo) return;
    const ios = (e: DeviceOrientationEvent) => {
      const h = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
      if (typeof h === 'number' && !Number.isNaN(h)) setHeading(h);
    };
    const absoluto = (e: DeviceOrientationEvent) => {
      if (e.absolute && e.alpha != null) setHeading((360 - e.alpha) % 360);
    };
    const comAbs = 'ondeviceorientationabsolute' in window;
    window.addEventListener('deviceorientation', ios);
    if (comAbs) window.addEventListener('deviceorientationabsolute' as 'deviceorientation', absoluto);
    else window.addEventListener('deviceorientation', absoluto);
    return () => {
      window.removeEventListener('deviceorientation', ios);
      window.removeEventListener('deviceorientationabsolute' as 'deviceorientation', absoluto);
      window.removeEventListener('deviceorientation', absoluto);
    };
  }, [ativo]);
  return heading;
}

/**
 * RF-22: escuta devicemotion só enquanto armado. `aoProgresso` recebe quantas sacudidas valem
 * agora (0–3) a cada mudança; `aoBalancar` dispara quando o gesto completa.
 */
export function useBalanco(
  armado: boolean,
  aoBalancar: () => void,
  aoProgresso?: (picos: number, novoPico: boolean) => void,
  exigidos?: number,
): void {
  const cbs = useRef({ aoBalancar, aoProgresso });
  useEffect(() => {
    cbs.current = { aoBalancar, aoProgresso };
  });
  useEffect(() => {
    if (!armado) return;
    // Detector novo a cada vez que arma: começa do zero, com a carência e o número do ponto.
    const d = new DetectorDeBalanco(exigidos);
    let ultimo = 0;
    const f = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const r = d.alimentar({ x: a.x, y: a.y, z: a.z, t: performance.now() });
      if (r.novoPico || r.picos !== ultimo) cbs.current.aoProgresso?.(r.picos, r.novoPico);
      ultimo = r.completo ? 0 : r.picos;
      if (r.completo) cbs.current.aoBalancar();
    };
    window.addEventListener('devicemotion', f);
    return () => window.removeEventListener('devicemotion', f);
  }, [armado, exigidos]);
}
