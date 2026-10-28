import { useEffect, useMemo } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Ponto } from '@/dominio/tipos';

const CENTRO_PADRAO: [number, number] = [-23.5589, -46.7315];

function icone(p: Ponto, selecionado: boolean): L.DivIcon {
  const tam = selecionado ? 32 : 26;
  const cor = !p.ativo ? '#9AA39C' : selecionado ? '#126B42' : '#18211C';
  return L.divIcon({
    className: '',
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
    html: `<div style="width:${tam}px;height:${tam}px;border-radius:50%;background:${cor};color:#fff;font:700 ${selecionado ? 13 : 12}px Inter,sans-serif;display:flex;align-items:center;justify-content:center;${selecionado ? 'box-shadow:0 0 0 4px #fff' : ''}">${p.numero}</div>`,
  });
}

function Cliques({ aoClicar }: { aoClicar: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => aoClicar(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Enquadra os pontos uma vez, ao carregar. */
function Enquadrar({ pontos }: { pontos: Ponto[] }) {
  const map = useMap();
  const temPontos = pontos.length > 0;
  useEffect(() => {
    if (temPontos) map.fitBounds(L.latLngBounds(pontos.map((p) => [p.lat, p.lng])), { padding: [60, 60], maxZoom: 18 });
    else navigator.geolocation?.getCurrentPosition((p) => map.setView([p.coords.latitude, p.coords.longitude], 17), () => {}, { timeout: 5000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temPontos, map]);
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
  return (
    <MapContainer center={CENTRO_PADRAO} zoom={17} maxZoom={19} className="size-full" aria-label="Mapa dos pontos">
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} attribution="Mapa: Leaflet + &copy; OpenStreetMap" />
      <Cliques aoClicar={aoCriar} />
      <Enquadrar pontos={pontos} />
      <Redimensionar />
      {sel && <Circle center={[sel.lat, sel.lng]} radius={sel.raioM} pathOptions={{ color: '#126B42', weight: 2, fillOpacity: 0.16 }} />}
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
    </MapContainer>
  );
}
