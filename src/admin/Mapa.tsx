import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Ponto } from '@/dominio/tipos';
import { Icone } from '@/ui/Icone';

const CENTRO_PADRAO: [number, number] = [-23.5589, -46.7315];
/** Acima disso o "criar aqui" fica bloqueado: o ponto nasceria fora do lugar. */
const PRECISAO_MAX_CRIAR_M = 30;

export interface MinhaPosicao {
  lat: number;
  lng: number;
  accuracy: number;
}

/** Posição do admin em tempo real, enquanto o mapa estiver aberto. */
function useMinhaPosicao(): MinhaPosicao | null {
  const [pos, setPos] = useState<MinhaPosicao | null>(null);
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        // Leitura sem coordenada válida (alguns navegadores entregam NaN) derrubaria o Leaflet.
        const { latitude: lat, longitude: lng, accuracy } = p.coords;
        if ([lat, lng, accuracy].every(Number.isFinite)) setPos({ lat, lng, accuracy });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return pos;
}

function icone(p: Ponto, selecionado: boolean): L.DivIcon {
  const tam = selecionado ? 34 : 28;
  const fundo = !p.ativo ? '#FFFFFF' : selecionado ? '#126B42' : '#18211C';
  const cor = p.ativo ? '#FFFFFF' : '#55615A';
  const borda = !p.ativo ? 'border:2px dashed #7A847E;' : '';
  const sombra = selecionado ? 'box-shadow:0 0 0 4px #fff,0 4px 12px rgba(0,0,0,.25);' : '';
  return L.divIcon({
    className: '',
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
    html: `<div style="box-sizing:border-box;width:${tam}px;height:${tam}px;border-radius:50%;background:${fundo};color:${cor};${borda}${sombra}font:700 ${selecionado ? 14 : 12}px Inter,sans-serif;display:flex;align-items:center;justify-content:center">${p.numero}</div>`,
  });
}

function Cliques({ aoClicar }: { aoClicar: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => aoClicar(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Enquadra uma vez: nos pontos, ou na posição do admin se ainda não há pontos. */
function Enquadrar({ pontos, minha }: { pontos: Ponto[]; minha: MinhaPosicao | null }) {
  const map = useMap();
  const feito = useRef(false);
  useEffect(() => {
    if (feito.current) return;
    if (pontos.length > 0) {
      map.fitBounds(L.latLngBounds(pontos.map((p) => [p.lat, p.lng])), { padding: [60, 60], maxZoom: 18 });
      feito.current = true;
    } else if (minha) {
      map.setView([minha.lat, minha.lng], 18);
      feito.current = true;
    }
  }, [pontos, minha, map]);
  return null;
}

/** Mantém o tamanho certo quando o contêiner muda (abas no celular). */
function Redimensionar() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

/** Botões sobre o mapa: centralizar em mim e criar ponto onde estou. */
function ControlesDePosicao({ minha, aoCriar }: { minha: MinhaPosicao | null; aoCriar: (lat: number, lng: number) => void }) {
  const map = useMap();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Toques nos botões não podem virar "clique no mapa" (que cria ponto).
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current);
      L.DomEvent.disableScrollPropagation(ref.current);
    }
  }, []);
  const precisao = minha ? Math.round(minha.accuracy) : null;
  const fraco = precisao != null && precisao > PRECISAO_MAX_CRIAR_M;
  return (
    <div ref={ref} className="absolute right-3 bottom-3 z-[500] flex flex-col items-end gap-2">
      <button
        type="button"
        aria-label="Centralizar em mim"
        disabled={!minha}
        onClick={() => minha && map.setView([minha.lat, minha.lng], Math.max(map.getZoom(), 18))}
        className="flex size-11 items-center justify-center rounded-[10px] bg-white text-tinta shadow-md disabled:opacity-50"
      >
        <Icone nome="meuLocal" tamanho={22} />
      </button>
      <button
        type="button"
        disabled={!minha || fraco}
        onClick={() => minha && aoCriar(minha.lat, minha.lng)}
        className="flex h-11 items-center gap-2 rounded-[10px] bg-mata px-3.5 text-sm font-bold text-white shadow-md disabled:bg-white disabled:text-tinta-suave"
      >
        <Icone nome="criarAqui" tamanho={20} />
        {!minha ? 'Buscando sua posição…' : fraco ? `GPS fraco · ±${precisao} m` : `Criar ponto aqui · ±${precisao} m`}
      </button>
    </div>
  );
}

export function Mapa({
  pontos,
  selecionado,
  aoSelecionar,
  aoCriar,
  aoMover,
}: {
  pontos: Ponto[];
  selecionado: string | null;
  aoSelecionar: (id: string) => void;
  aoCriar: (lat: number, lng: number) => void;
  aoMover: (id: string, lat: number, lng: number) => void;
}) {
  const sel = useMemo(() => pontos.find((p) => p.id === selecionado), [pontos, selecionado]);
  const minha = useMinhaPosicao();
  return (
    <MapContainer center={CENTRO_PADRAO} zoom={17} maxZoom={19} className="size-full" aria-label="Mapa dos pontos">
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} attribution="&copy; OpenStreetMap" />
      <Cliques aoClicar={aoCriar} />
      <Enquadrar pontos={pontos} minha={minha} />
      <Redimensionar />
      {sel && <Circle center={[sel.lat, sel.lng]} radius={sel.raioM} pathOptions={{ color: '#126B42', weight: 2, dashArray: '6 6', fillOpacity: 0.16 }} />}
      {minha && (
        <>
          <Circle center={[minha.lat, minha.lng]} radius={minha.accuracy} interactive={false} pathOptions={{ color: '#2B6FD6', weight: 1, fillColor: '#2B6FD6', fillOpacity: 0.12 }} />
          <CircleMarker center={[minha.lat, minha.lng]} radius={8} interactive={false} pathOptions={{ color: '#FFFFFF', weight: 3, fillColor: '#2B6FD6', fillOpacity: 1 }} />
        </>
      )}
      {pontos.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={icone(p, p.id === selecionado)}
          draggable={p.id === selecionado && p.ativo}
          keyboard
          title={`${p.numero} · ${p.nome}`}
          eventHandlers={{
            click: () => aoSelecionar(p.id),
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              aoMover(p.id, ll.lat, ll.lng);
            },
          }}
        />
      ))}
      <ControlesDePosicao minha={minha} aoCriar={aoCriar} />
    </MapContainer>
  );
}
