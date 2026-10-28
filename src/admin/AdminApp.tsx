import { useEffect, useMemo, useState } from 'react';
import { calcularRanking } from '@/dominio/ranking';
import { APELIDO_MAX, RETENCAO_LOCALIZACAO_MS } from '@/dominio/constantes';
import type { Partida, Ponto } from '@/dominio/tipos';
import { ehAdmin, entrarComGoogle, observarUsuario, sair, type User } from '@/firebase/conta';
import { Icone } from '@/ui/Icone';
import { data, haQuanto } from '@/ui/tempo';
import { useDadosAdmin, type DadosAdmin } from './dados';
import { Mapa } from './Mapa';
import { EditorPonto, FilaDoPonto } from './PainelPonto';
import { Botao, Confirmar, Selo } from './componentes';
import {
  abrirPartida,
  ancorarAdmin,
  criarPonto,
  finalizar,
  garantirJogo,
  limparLocalizacao,
  moverPonto,
  novaPartida,
  pausar,
  renomearJogador,
  retomar,
} from './operacoes';

/** RF-50: só UIDs da lista de admins acessam o painel. */
export default function AdminApp() {
  const [usuario, setUsuario] = useState<User | null | undefined>(undefined);
  const [admin, setAdmin] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    document.title = 'Segura e Balança · Admin';
    // Topo do iOS com a cor do cabeçalho do painel (o jogador usa o verde-noite do index.css).
    const html = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const antes = { fundo: html.style.backgroundColor, tema: meta?.content };
    html.style.backgroundColor = '#18211C';
    document.body.style.backgroundColor = '#F7F5EF';
    if (meta) meta.content = '#18211C';
    return () => {
      html.style.backgroundColor = antes.fundo;
      document.body.style.backgroundColor = '';
      if (meta && antes.tema) meta.content = antes.tema;
    };
  }, []);

  useEffect(() => {
    return observarUsuario((u) => {
      setUsuario(u);
      setAdmin(undefined);
      if (u) void ehAdmin(u.uid).then(setAdmin);
    });
  }, []);

  if (usuario === undefined || (usuario && admin === undefined)) return <Centro>Carregando…</Centro>;
  if (!usuario)
    return (
      <Centro>
        <h1 className="m-0 font-display text-3xl font-bold">Segura e Balança · Admin</h1>
        <Botao variante="primario" onClick={() => void entrarComGoogle()}>
          Entrar com Google
        </Botao>
      </Centro>
    );
  if (!admin)
    return (
      <Centro>
        <h1 className="m-0 font-display text-2xl font-bold">Sem acesso ao painel</h1>
        <p className="m-0 max-w-md text-tinta-suave">
          A conta {usuario.email} não está na lista de admins. Peça para alguém do grupo criar o documento <code>admins/{usuario.uid}</code> no
          console do Firestore.
        </p>
        <Botao onClick={() => void sair()}>Trocar de conta</Botao>
      </Centro>
    );
  return <Painel uid={usuario.uid} />;
}

function Centro({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-papel p-6 text-center text-tinta">{children}</div>;
}

/** "Ponto 3 · Cantina", ou só "Ponto 3" quando o nome ainda é o padrão. */
export const tituloPonto = (p: Pick<Ponto, 'numero' | 'nome'>) =>
  p.nome && p.nome !== `Ponto ${p.numero}` ? `Ponto ${p.numero} · ${p.nome}` : `Ponto ${p.numero}`;

type AbaMobile = 'mapa' | 'filas' | 'partida';

function Painel({ uid }: { uid: string }) {
  const dados = useDadosAdmin(true);
  const { partida, pontos, filas, jogadores } = dados;
  const [sel, setSel] = useState<string | null>(null);
  const [aba, setAba] = useState<AbaMobile>('mapa');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void ancorarAdmin(uid).catch(() => {});
    void garantirJogo().catch((e) => setErro(String(e)));
  }, [uid]);

  const apelidos = useMemo(() => new Map(jogadores.map((j) => [j.uid, j.apelido])), [jogadores]);
  const ranking = useMemo(() => calcularRanking(pontos, filas, partida ?? { pausas: [] }), [pontos, filas, partida]);
  const ponto = pontos.find((p) => p.id === sel) ?? null;

  const criar = async (lat: number, lng: number) => {
    try {
      setSel(await criarPonto(lat, lng, pontos, partida));
    } catch (e) {
      setErro(`Não criou o ponto: ${e instanceof Error ? e.message : e}`);
    }
  };

  const mapa = (
    <div className="relative size-full">
      <Mapa pontos={pontos} selecionado={sel} aoSelecionar={setSel} aoCriar={(a, b) => void criar(a, b)} aoMover={(id, a, b) => void moverPonto(id, a, b)} />
      <div className="pointer-events-none absolute top-3 left-16 z-[500] rounded-lg bg-white px-3.5 py-2.5 text-[13px] text-[#2A352F] shadow-md">
        {pontos.length === 0 ? 'Clique em qualquer lugar do mapa para criar o primeiro ponto' : 'Clique no mapa para criar um ponto'}
      </div>
    </div>
  );

  const painelPonto = ponto ? (
    <>
      <EditorPonto ponto={ponto} pontos={pontos} partida={partida} proximaPos={(ranking.filas.get(ponto.id)?.length ?? 0) + 1} />
      <div className="p-5">
        <FilaDoPonto ponto={ponto} fila={filas[ponto.id]} partida={partida} ranking={ranking} apelidos={apelidos} />
      </div>
    </>
  ) : pontos.length === 0 ? (
    <PrimeiroUso />
  ) : (
    <p className="m-0 p-5 text-sm text-tinta-suave">Selecione um ponto no mapa ou na lista para editar e ver a fila.</p>
  );

  return (
    <div className="flex h-dvh flex-col bg-papel text-tinta">
      <Cabecalho dados={dados} ranking={ranking} />
      {erro && (
        <div role="alert" className="flex items-center justify-between gap-3 bg-[#FEE4E2] px-5 py-2 text-sm text-perigo-texto">
          {erro}
          <button type="button" className="h-9 px-2 font-semibold" onClick={() => setErro(null)}>
            Fechar
          </button>
        </div>
      )}

      {/* Desktop: mapa + painel lateral (tela 5) */}
      <div className="hidden min-h-0 grow grid-cols-[minmax(0,1fr)_460px] lg:grid">
        {mapa}
        <aside className="flex min-h-0 flex-col overflow-auto border-l border-areia-borda bg-white">
          {painelPonto}
          <ListaPontos pontos={pontos} ranking={ranking} sel={sel} setSel={setSel} />
          <Jogadores dados={dados} ranking={ranking} />
          <Historico historico={dados.historico} />
        </aside>
      </div>

      {/* Celular: abas Mapa · Filas · Partida (telas 10–12) */}
      <div className="flex min-h-0 grow flex-col lg:hidden">
        <div className="min-h-0 grow overflow-auto">
          {aba === 'mapa' && (
            <div className="flex h-full flex-col">
              <div className="min-h-[300px] grow">{mapa}</div>
              {ponto && <CartaoPontoMobile ponto={ponto} ranking={ranking} irParaFila={() => setAba('filas')} />}
            </div>
          )}
          {aba === 'filas' && (
            <div className="flex flex-col gap-4 bg-[#FAFAFA] p-4">
              {ponto ? (
                <>
                  <EditorPonto ponto={ponto} pontos={pontos} partida={partida} proximaPos={(ranking.filas.get(ponto.id)?.length ?? 0) + 1} />
                  <FilaDoPonto ponto={ponto} fila={filas[ponto.id]} partida={partida} ranking={ranking} apelidos={apelidos} compacto />
                </>
              ) : (
                <ListaPontos pontos={pontos} ranking={ranking} sel={sel} setSel={setSel} />
              )}
            </div>
          )}
          {aba === 'partida' && (
            <div className="flex flex-col bg-[#FAFAFA]">
              <ControlesPartida dados={dados} ranking={ranking} empilhado />
              <ListaPontos pontos={pontos} ranking={ranking} sel={sel} setSel={setSel} />
              <Jogadores dados={dados} ranking={ranking} />
              <Historico historico={dados.historico} />
            </div>
          )}
        </div>
        <nav aria-label="Seções" className="grid grid-cols-3 border-t border-[#E4E4E7] bg-white pb-[env(safe-area-inset-bottom)]">
          {(
            [
              ['mapa', 'Mapa', 'mapa'],
              ['filas', 'Filas', 'lista'],
              ['partida', 'Partida', 'bandeira'],
            ] as const
          ).map(([id, rotulo, icone]) => (
            <button
              key={id}
              type="button"
              aria-current={aba === id ? 'page' : undefined}
              onClick={() => setAba(id)}
              className={`flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${aba === id ? 'text-mata' : 'text-tinta-suave'}`}
            >
              <Icone nome={icone} tamanho={22} />
              {rotulo}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

function contarBalancadas(ranking: ReturnType<typeof calcularRanking>) {
  let n = 0;
  let conflitos = 0;
  for (const s of ranking.status.values()) {
    n++;
    if (s.tipo === 'conflito') conflitos++;
  }
  return { n, conflitos };
}

function Cabecalho({ dados, ranking }: { dados: DadosAdmin; ranking: ReturnType<typeof calcularRanking> }) {
  const { partida, pontos } = dados;
  const { n } = contarBalancadas(ranking);
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 bg-tinta px-4 py-3 text-[#E8F2EC] lg:px-7 lg:py-4">
      <div className="flex min-w-0 flex-col lg:flex-row lg:items-center lg:gap-4">
        <div className="font-display text-lg font-bold lg:text-[22px]">Segura e Balança · Admin</div>
        <div className="text-[13px] text-[#9FB5A9]">
          {partida
            ? `Partida #${partida.numero} · ${ranking.ranking.length} jogadores · ${n} balançadas · ${pontos.filter((p) => p.ativo).length} pontos ativos`
            : 'Carregando partida…'}
        </div>
      </div>
      <div className="hidden lg:block">
        <ControlesPartida dados={dados} ranking={ranking} />
      </div>
      <button type="button" onClick={() => void sair()} aria-label="Sair" className="flex size-11 items-center justify-center rounded-lg text-[#9FB5A9] lg:hidden">
        <Icone nome="sair" />
      </button>
    </header>
  );
}

/** RF-54 a RF-56: estado da partida, finalizar e nova partida. */
function ControlesPartida({ dados, ranking, empilhado }: { dados: DadosAdmin; ranking: ReturnType<typeof calcularRanking>; empilhado?: boolean }) {
  const { partida, pontos } = dados;
  const [dialogo, setDialogo] = useState<'finalizar' | 'nova' | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!partida) return null;

  const executar = async (f: () => Promise<unknown>) => {
    setOcupado(true);
    setMsg(null);
    try {
      await f();
      setDialogo(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  };

  const ativos = pontos.filter((p) => p.ativo);
  const lider = ranking.ranking[0];
  const { n, conflitos } = contarBalancadas(ranking);
  const ultimaEntrada = Math.max(0, ...Object.values(dados.filas).flatMap((f) => Object.values(f.entradas).map((e) => e.recebidoEm ?? 0)));

  const estado =
    partida.estado === 'rascunho' ? (
      <Botao variante="primario" disabled={ativos.length === 0 || ocupado} onClick={() => void executar(() => abrirPartida(partida, pontos))} title={ativos.length === 0 ? 'Crie ao menos 1 ponto' : undefined}>
        Abrir partida
      </Botao>
    ) : partida.estado === 'finalizada' ? (
      <Selo>finalizada</Selo>
    ) : (
      // Segmentado de estado (v2): as duas metades são estados; tocar na inativa troca.
      <div
        role="group"
        aria-label="Estado da partida"
        className={`grid grid-cols-2 gap-1.5 rounded-xl p-1 ${empilhado ? 'w-full bg-[#F1EEE6]' : 'bg-[#24372E]'}`}
      >
        {(
          [
            ['ativa', 'Ativa', 'play', 'bg-mata text-white', () => retomar(partida)],
            ['pausada', 'Pausada', 'pausa', 'bg-alerta text-[#2a1e05]', () => pausar(partida)],
          ] as const
        ).map(([id, rotulo, icone, corAtiva, acao]) => {
          const atual = partida.estado === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={atual}
              disabled={ocupado}
              onClick={() => !atual && void executar(acao)}
              className={`flex items-center justify-center gap-2 rounded-[9px] font-bold ${empilhado ? 'h-12 text-[15px]' : 'h-9 px-4 text-sm'} ${
                atual ? corAtiva : empilhado ? 'text-[#3F4A44]' : 'text-[#E8F2EC]'
              }`}
            >
              <Icone nome={icone} tamanho={empilhado ? 16 : 14} strokeWidth={2.2} />
              {rotulo}
            </button>
          );
        })}
      </div>
    );

  const finalizarBtn = partida.estado !== 'finalizada' && partida.estado !== 'rascunho' && (
    <Botao
      onClick={() => setDialogo('finalizar')}
      className={empilhado ? 'w-full' : ''}
      variante={empilhado ? 'perigo' : 'contorno-claro'}
    >
      Finalizar e congelar ranking
    </Botao>
  );
  const novaBtn = (
    <Botao
      onClick={() => setDialogo('nova')}
      disabled={partida.estado !== 'finalizada'}
      title={partida.estado !== 'finalizada' ? 'Disponível após finalizar' : undefined}
      className={empilhado ? 'w-full' : ''}
      variante={empilhado ? 'secundario' : 'contorno-alerta'}
    >
      {partida.estado === 'finalizada' || !empilhado ? 'Nova partida…' : 'Nova partida (disponível após finalizar)'}
    </Botao>
  );

  const dialogos = (
    <>
      {dialogo === 'finalizar' && (
        <Confirmar
          titulo={`Finalizar a partida #${partida.numero}?`}
          rotuloOk={ocupado ? 'Calculando ranking final…' : 'Finalizar partida'}
          perigo
          ocupado={ocupado}
          aoCancelar={() => setDialogo(null)}
          aoConfirmar={() => void executar(() => finalizar(partida.id))}
        >
          <p className="m-0">O ranking atual vira o resultado oficial e vai para o histórico. Isto não pode ser desfeito.</p>
          <div className="flex items-start gap-2.5 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-3 text-sm text-[#713F12]">
            <Icone nome="alerta" className="mt-0.5 shrink-0 text-[#A15C07]" />
            <p className="m-0">
              Quem jogou offline e ainda não sincronizou <strong>perde essas balançadas</strong>. Vale avisar no grupo para todos abrirem o app
              com internet antes.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-[#F4F4F5] p-3">
            <div>
              <div className="text-xs text-[#52525B]">Jogadores</div>
              <div className="text-lg font-bold">{ranking.ranking.length}</div>
            </div>
            <div>
              <div className="text-xs text-[#52525B]">Último sync recebido</div>
              <div className="text-lg font-bold">{ultimaEntrada ? `há ${haQuanto(Date.now() - ultimaEntrada)}` : '—'}</div>
            </div>
            <div>
              <div className="text-xs text-[#52525B]">Líder</div>
              <div className="truncate text-lg font-bold">{lider ? `${dados.jogadores.find((j) => j.uid === lider.uid)?.apelido ?? '?'} · ${lider.pontos}` : '—'}</div>
            </div>
          </div>
          {msg && <p className="m-0 text-perigo-texto">{msg}</p>}
        </Confirmar>
      )}
      {dialogo === 'nova' && (
        <Confirmar
          titulo={`Abrir a partida #${partida.numero + 1}?`}
          rotuloOk="Criar partida"
          ocupado={ocupado}
          aoCancelar={() => setDialogo(null)}
          aoConfirmar={() => void executar(() => novaPartida(partida, pontos))}
        >
          <p className="m-0">
            Cria uma partida vazia em rascunho com os {ativos.length} pontos ativos. As filas e o ranking começam do zero; a partida #{partida.numero} fica
            no histórico.
          </p>
          {msg && <p className="m-0 text-perigo-texto">{msg}</p>}
        </Confirmar>
      )}
    </>
  );

  if (empilhado)
    return (
      <section className="flex flex-col gap-4 border-b border-[#E4E4E7] p-4" aria-label="Partida">
        <div>
          <h2 className="m-0 text-lg font-bold">Partida #{partida.numero}</h2>
          <p className="m-0 text-sm text-tinta-suave">
            {partida.estado === 'rascunho' ? 'Rascunho' : `Aberta em ${data(partida.criadaEm)}`}
            {partida.pausas.length > 0 && ` · ${partida.pausas.length} ${partida.pausas.length === 1 ? 'pausa' : 'pausas'}`}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-tinta-suave">Estado</h3>
          {estado}
          {partida.estado === 'ativa' && (
            <p className="m-0 text-[13px] text-tinta-suave">Pausar esconde o radar de quem sincronizar. Balançadas feitas durante a pausa não contam.</p>
          )}
          {partida.estado === 'rascunho' && ativos.length === 0 && <p className="m-0 text-[13px] text-tinta-suave">Crie ao menos 1 ponto para abrir a partida.</p>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['Jogadores', ranking.ranking.length],
              ['Balançadas', n],
              ['Conflitos', conflitos],
            ] as const
          ).map(([r, v]) => (
            <div key={r} className="rounded-lg border border-[#E4E4E7] bg-white p-3">
              <div className="text-xs text-[#52525B]">{r}</div>
              <div className="text-xl font-bold">{v}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-tinta-suave">Encerrar</h3>
          {finalizarBtn}
          {novaBtn}
        </div>
        {msg && !dialogo && <p className="m-0 text-sm text-perigo-texto">{msg}</p>}
        {dialogos}
      </section>
    );

  return (
    <div className="flex items-center gap-3">
      {estado}
      {finalizarBtn}
      {partida.estado === 'finalizada' && novaBtn}
      {dialogos}
    </div>
  );
}

function CartaoPontoMobile({ ponto, ranking, irParaFila }: { ponto: Ponto; ranking: ReturnType<typeof calcularRanking>; irParaFila: () => void }) {
  const fila = ranking.filas.get(ponto.id) ?? [];
  const conflitos = [...ranking.status.entries()].filter(([, s]) => s.tipo === 'conflito').length;
  return (
    <section className="flex flex-col gap-3 border-t border-[#E4E4E7] bg-white p-4" aria-label="Ponto selecionado">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="m-0 text-base font-bold">
            {tituloPonto(ponto)}
          </h2>
          <div className="font-mono text-xs text-tinta-suave">
            {ponto.lat.toFixed(5)}, {ponto.lng.toFixed(5)} · raio {ponto.raioM} m
          </div>
        </div>
        <Selo tom={ponto.ativo ? 'verde' : 'neutro'}>{ponto.valorBase} pts</Selo>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xs text-[#52525B]">Na fila</div>
          <div className="text-lg font-bold">{fila.length}</div>
        </div>
        <div>
          <div className="text-xs text-[#52525B]">Próxima vale</div>
          <div className="text-lg font-bold">{Math.round(ponto.valorBase * Math.max(1 - ponto.passoPct * fila.length, ponto.pisoPct))}</div>
        </div>
        <div>
          <div className="text-xs text-[#52525B]">Conflitos</div>
          <div className="text-lg font-bold">{conflitos}</div>
        </div>
      </div>
      <Botao variante="primario" onClick={irParaFila}>
        Ver fila e editar
      </Botao>
    </section>
  );
}

function ListaPontos({
  pontos,
  ranking,
  sel,
  setSel,
}: {
  pontos: Ponto[];
  ranking: ReturnType<typeof calcularRanking>;
  sel: string | null;
  setSel: (id: string) => void;
}) {
  if (pontos.length === 0) return null;
  return (
    <section className="flex flex-col gap-1 p-5" aria-labelledby="pontos-t">
      <h3 id="pontos-t" className="m-0 mb-1 font-display text-base font-bold">
        Todos os pontos
      </h3>
      {pontos.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => setSel(p.id)}
          aria-pressed={p.id === sel}
          className={`flex min-h-11 items-center justify-between border-b border-[#EFECE4] px-1 text-left text-[13.5px] last:border-0 ${p.id === sel ? 'font-semibold' : ''} ${p.ativo ? '' : 'text-[#7A847E]'}`}
        >
          <span>{tituloPonto(p)}</span>
          <span className="text-tinta-suave">
            {p.ativo
              ? `${p.valorBase} pts · ${ranking.filas.get(p.id)?.length ?? 0} na fila`
              : `desativado${p.desativadoEm ? ` às ${new Date(p.desativadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}`}
          </span>
        </button>
      ))}
    </section>
  );
}

/** RF-57: renomear apelido ofensivo. */
function Jogadores({ dados, ranking }: { dados: DadosAdmin; ranking: ReturnType<typeof calcularRanking> }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const pontos = new Map(ranking.ranking.map((l) => [l.uid, l]));
  const lista = [...dados.jogadores].sort((a, b) => (pontos.get(a.uid)?.pos ?? 999) - (pontos.get(b.uid)?.pos ?? 999));
  if (lista.length === 0) return null;
  return (
    <section className="flex flex-col gap-1 p-5 pt-0" aria-labelledby="jog-t">
      <h3 id="jog-t" className="m-0 mb-1 font-display text-base font-bold">
        Jogadores ({lista.length})
      </h3>
      {lista.map((j) =>
        editando === j.uid ? (
          <form
            key={j.uid}
            className="flex gap-2 py-1"
            onSubmit={(e) => {
              e.preventDefault();
              renomearJogador(j.uid, texto)
                .then(() => setEditando(null))
                .catch((err) => setMsg(err instanceof Error ? err.message : String(err)));
            }}
          >
            <label htmlFor={`ren-${j.uid}`} className="sr-only">
              Novo apelido de {j.apelido}
            </label>
            <input id={`ren-${j.uid}`} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={APELIDO_MAX} className="h-11 min-w-0 grow rounded-lg border border-[#C9C3B5] px-2.5" />
            <Botao variante="primario" type="submit">
              Salvar
            </Botao>
            <Botao onClick={() => setEditando(null)}>Cancelar</Botao>
          </form>
        ) : (
          <div key={j.uid} className="flex min-h-11 items-center justify-between border-b border-[#EFECE4] text-[13.5px] last:border-0">
            <span>
              {pontos.get(j.uid) ? `${pontos.get(j.uid)!.pos}º · ` : ''}
              {j.apelido}
            </span>
            <span className="flex items-center gap-2 text-tinta-suave">
              {pontos.get(j.uid)?.pontos ?? 0} pts
              <button
                type="button"
                className="h-9 rounded-md px-2 text-xs font-semibold text-mata"
                onClick={() => {
                  setEditando(j.uid);
                  setTexto(j.apelido);
                  setMsg(null);
                }}
              >
                Renomear
              </button>
            </span>
          </div>
        ),
      )}
      {msg && (
        <p role="alert" className="m-0 text-sm text-perigo-texto">
          {msg}
        </p>
      )}
    </section>
  );
}

/** RF-55 / RF-58: histórico de partidas e limpeza de retenção. */
function Historico({ historico }: { historico: Partida[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-1 p-5 pt-0" aria-labelledby="hist-t">
      <h3 id="hist-t" className="m-0 mb-1 font-display text-base font-bold">
        Histórico de partidas
      </h3>
      {historico.length === 0 && <p className="m-0 text-sm text-tinta-suave">Nenhuma partida no histórico ainda.</p>}
      {historico.map((p) => {
        const lider = p.rankingFinal?.[0];
        const podeLimpar = !!p.finalizadaEm && Date.now() - p.finalizadaEm > RETENCAO_LOCALIZACAO_MS;
        return (
          <div key={p.id} className="flex min-h-11 items-center justify-between gap-2 border-b border-[#EFECE4] text-[13.5px] last:border-0">
            <span>
              #{p.numero} · {p.finalizadaEm ? data(p.finalizadaEm) : '—'} · {p.rankingFinal?.length ?? 0} jogadores
            </span>
            <span className="flex items-center gap-2 text-tinta-suave">
              {lider ? `1º ${lider.apelido} · ${lider.pontos}` : '—'}
              {podeLimpar && (
                <button
                  type="button"
                  className="h-9 rounded-md px-2 text-xs font-semibold text-perigo-texto"
                  onClick={() =>
                    limparLocalizacao(p)
                      .then((n) => setMsg(`Localização apagada de ${n} balançadas da partida #${p.numero}.`))
                      .catch((e) => setMsg(String(e)))
                  }
                >
                  Apagar localização
                </button>
              )}
            </span>
          </div>
        );
      })}
      {msg && (
        <p role="status" className="m-0 text-sm text-tinta-suave">
          {msg}
        </p>
      )}
    </section>
  );
}

/** Tela 13 · primeiro uso. */
function PrimeiroUso() {
  return (
    <section className="flex flex-col gap-4 border-b border-[#E2DED3] p-5" aria-labelledby="como-t">
      <div>
        <h2 id="como-t" className="m-0 font-display text-xl font-bold">
          Como funciona
        </h2>
        <p className="m-0 text-sm text-tinta-suave">Três passos antes de abrir a partida.</p>
      </div>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {[
          ['Crie os pontos no mapa', 'Valor-base, passo, piso, raio e uma dica. Prefira áreas abertas: dentro de prédios o GPS dos celulares erra mais.'],
          ['Teste um ponto no local', 'Abra o app de jogador no celular e confira se o raio libera.'],
          ['Abra a partida', 'Os jogadores precisam entrar online uma vez para baixar os pontos.'],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-tinta text-sm font-bold text-white">{i + 1}</span>
            <span>
              <strong className="block text-sm">{t}</strong>
              <span className="text-sm text-tinta-suave">{d}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
