import { useEffect, useRef, useState } from 'react';
import { DetectorDeBalanco } from '@/dominio/balanco';

type ComPermissao = { requestPermission?: () => Promise<'granted' | 'denied'> };

/** RF-05: o iOS só libera movimento e orientação dentro de um gesto do usuário. */
export async function pedirPermissaoDeMovimento(): Promise<boolean> {
  const pedidos: Promise<'granted' | 'denied'>[] = [];
  const motion = (globalThis as { DeviceMotionEvent?: ComPermissao }).DeviceMotionEvent;
  const orient = (globalThis as { DeviceOrientationEvent?: ComPermissao }).DeviceOrientationEvent;
  if (typeof motion?.requestPermission === 'function') pedidos.push(motion.requestPermission());
  if (typeof orient?.requestPermission === 'function') pedidos.push(orient.requestPermission());
  try {
    const r = await Promise.all(pedidos);
    return r.every((x) => x === 'granted');
  } catch {
    return false;
  }
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
      (p) =>
        setEstado({
          tipo: 'ok',
          leitura: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, t: p.timestamp },
        }),
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

/** RF-22: escuta devicemotion só enquanto armado; chama `aoBalancar` quando o gesto completa. */
export function useBalanco(armado: boolean, aoBalancar: () => void): void {
  const detector = useRef(new DetectorDeBalanco());
  const cb = useRef(aoBalancar);
  useEffect(() => {
    cb.current = aoBalancar;
  });
  useEffect(() => {
    if (!armado) return;
    const d = detector.current;
    d.reiniciar();
    const f = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      if (d.alimentar({ x: a.x, y: a.y, z: a.z, t: performance.now() })) cb.current();
    };
    window.addEventListener('devicemotion', f);
    return () => window.removeEventListener('devicemotion', f);
  }, [armado]);
}
