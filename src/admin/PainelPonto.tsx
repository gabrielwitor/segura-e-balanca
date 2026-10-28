import { useEffect, useState } from 'react';
import { pontosDaPosicao, tabelaDePontos } from '@/dominio/pontuacao';
import { SACUDIDAS_MAX, SACUDIDAS_MIN } from '@/dominio/constantes';
import type { EntradaNaFila, ResultadoRanking } from '@/dominio/ranking';
import type { Fila, Partida, Ponto } from '@/dominio/tipos';
import { hora } from '@/ui/tempo';
import { Icone } from '@/ui/Icone';
import { anularEntrada, desativarPonto, excluirPonto, podeExcluirPonto, salvarPonto } from './operacoes';
import { Botao, Campo, Confirmar, Selo } from './componentes';

/** RF-51/52: edição do ponto. Percentuais na tela, frações no banco. */
export function EditorPonto({
  ponto,
  pontos,
  partida,
  proximaPos,
}: {
  ponto: Ponto;
  pontos: Ponto[];
  partida: Partida | null;
  proximaPos: number;
}) {
  const [f, setF] = useState(() => paraForm(ponto));
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<'desativar' | 'excluir' | null>(null);
  const excluivel = podeExcluirPonto(partida);
  useEffect(() => {
    setF(paraForm(ponto));
    setMsg(null);
  }, [ponto]);

  const num = (s: string) => Number(s.replace(',', '.'));
  const sacudidasOk = Number.isInteger(num(f.sacudidas)) && num(f.sacudidas) >= SACUDIDAS_MIN && num(f.sacudidas) <= SACUDIDAS_MAX;
  const valido =
    num(f.valorBase) > 0 && num(f.passo) >= 0 && num(f.passo) <= 100 && num(f.piso) >= 0 && num(f.piso) <= 100 && num(f.raio) > 0 && sacudidasOk;
  const regra = valido ? { valorBase: num(f.valorBase), passoPct: num(f.passo) / 100, pisoPct: num(f.piso) / 100 } : null;

  const salvar = async () => {
    if (!regra) return;
    try {
      await salvarPonto(ponto.id, {
        nome: f.nome.trim() || `Ponto ${ponto.numero}`,
        raioM: num(f.raio),
        dica: f.dica.trim(),
        sacudidas: num(f.sacudidas),
        ...regra,
      });
      setMsg('Salvo. Os jogadores recebem no próximo sync.');
    } catch (e) {
      setMsg(`Não salvou: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <section className="flex flex-col gap-3.5 border-b border-[#E2DED3] p-5" aria-labelledby="ponto-t">
      <div className="flex items-center justify-between gap-2">
        <h2 id="ponto-t" className="m-0 font-display text-xl font-bold">
          {ponto.nome && ponto.nome !== `Ponto ${ponto.numero}` ? `Ponto ${ponto.numero} · ${ponto.nome}` : `Ponto ${ponto.numero}`}
        </h2>
        {ponto.ativo ? <Selo tom="verde">ativo</Selo> : <Selo>desativado</Selo>}
      </div>
      <div className="font-mono text-xs text-tinta-suave">
        {ponto.lat.toFixed(5)}, {ponto.lng.toFixed(5)} {ponto.ativo && '· arraste o marcador para mover'}
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        <Campo id="nome" rotulo="Nome (só o admin vê)" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
          <Campo id="vb" rotulo="Valor-base" inputMode="numeric" value={f.valorBase} onChange={(e) => setF({ ...f, valorBase: e.target.value })} />
          <Campo id="ps" rotulo="Passo %" inputMode="decimal" value={f.passo} onChange={(e) => setF({ ...f, passo: e.target.value })} />
          <Campo id="pi" rotulo="Piso %" inputMode="decimal" value={f.piso} onChange={(e) => setF({ ...f, piso: e.target.value })} />
          <Campo id="ra" rotulo="Raio m" inputMode="numeric" value={f.raio} onChange={(e) => setF({ ...f, raio: e.target.value })} />
          <Campo
            id="sc"
            rotulo="Balanços"
            inputMode="numeric"
            value={f.sacudidas}
            aria-invalid={!sacudidasOk}
            aria-describedby={sacudidasOk ? undefined : 'sc-erro'}
            onChange={(e) => setF({ ...f, sacudidas: e.target.value })}
          />
        </div>
        {!sacudidasOk && (
          <p id="sc-erro" role="alert" className="-mt-1.5 mb-0 text-[13px] text-perigo">
            Balanços: de {SACUDIDAS_MIN} a {SACUDIDAS_MAX}.
          </p>
        )}
        <Campo id="dc" rotulo="Dica (opcional)" value={f.dica} onChange={(e) => setF({ ...f, dica: e.target.value })} />
        {regra && (
          <p className="m-0 text-[13px] text-tinta-suave">
            Próxima balançada vale <strong className="text-tinta">{pontosDaPosicao(regra, proximaPos)} pts</strong> ({proximaPos}º) · tabela:{' '}
            {tabelaDePontos(regra, 10).join(' · ')}
          </p>
        )}
        <div className="flex flex-wrap gap-2.5">
          <Botao variante="primario" type="submit" disabled={!valido}>
            Salvar
          </Botao>
          {excluivel ? (
            <Botao onClick={() => setConfirmar('excluir')} className="text-perigo-texto">
              Excluir ponto
            </Botao>
          ) : (
            ponto.ativo && <Botao onClick={() => setConfirmar('desativar')}>Desativar ponto</Botao>
          )}
        </div>
        {msg && (
          <p className="m-0 text-[13px] text-tinta-suave" role="status">
            {msg}
          </p>
        )}
      </form>
      {confirmar === 'excluir' && (
        <Confirmar
          titulo={`Excluir o ponto ${ponto.numero}?`}
          rotuloOk="Excluir"
          perigo
          aoCancelar={() => setConfirmar(null)}
          aoConfirmar={() =>
            void excluirPonto(ponto, pontos, partida)
              .catch((e) => setMsg(`Não excluiu: ${e instanceof Error ? e.message : e}`))
              .finally(() => setConfirmar(null))
          }
        >
          <p className="m-0">
            O ponto some do mapa e do radar dos jogadores no próximo sync.
            {pontos.some((p) => p.numero > ponto.numero) && ' Os pontos seguintes são renumerados para continuarem em sequência.'}
          </p>
        </Confirmar>
      )}
      {confirmar === 'desativar' && (
        <Confirmar
          titulo={`Desativar o ponto ${ponto.numero}?`}
          rotuloOk="Desativar"
          perigo
          aoCancelar={() => setConfirmar(null)}
          aoConfirmar={() => void desativarPonto(ponto.id).finally(() => setConfirmar(null))}
        >
          <p className="m-0">Ele some do radar no próximo sync. Balançadas feitas antes de agora continuam valendo; as de depois não contam.</p>
        </Confirmar>
      )}
    </section>
  );
}

function paraForm(p: Ponto) {
  return {
    nome: p.nome,
    valorBase: String(p.valorBase),
    passo: String(Math.round(p.passoPct * 1000) / 10),
    piso: String(Math.round(p.pisoPct * 1000) / 10),
    raio: String(p.raioM),
    sacudidas: String(p.sacudidas),
    dica: p.dica,
  };
}

interface LinhaFila {
  e: EntradaNaFila;
  pos: number | null;
  pts: number;
  nota: string;
}

/** RF-53: fila do ponto com dispositivo, fonte do horário, conflitos e anulação. */
export function FilaDoPonto({
  ponto,
  fila,
  partida,
  ranking,
  apelidos,
  compacto,
}: {
  ponto: Ponto;
  fila: Fila | undefined;
  partida: Partida | null;
  ranking: ResultadoRanking;
  apelidos: Map<string, string>;
  compacto?: boolean;
}) {
  const [anular, setAnular] = useState<LinhaFila | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const todas = Object.entries(fila?.entradas ?? {}).map(([chave, e]) => ({ ...e, chave, pontoId: ponto.id }));
  const aparelhos = new Map<string, Set<string>>();
  for (const e of todas) aparelhos.set(e.uid, (aparelhos.get(e.uid) ?? new Set()).add(e.dispositivoId));

  const linhas: LinhaFila[] = todas
    .map((e) => {
      const s = ranking.status.get(e.chave);
      const nota =
        s?.tipo === 'conflito'
          ? `conflito: vale a de ${hora(todas.find((x) => x.chave === s.vencedora)?.t ?? 0)}`
          : s?.tipo === 'anulada'
            ? 'anulada'
            : s?.tipo === 'pausa'
              ? 'durante pausa'
              : s?.tipo === 'desativado'
                ? 'após desativação'
                : e.recebidoEm && e.recebidoEm - e.t > 60_000
                  ? `chegou offline · sync ${hora(e.recebidoEm)}`
                  : '';
      return { e, pos: s?.tipo === 'valida' ? s.pos : null, pts: s?.tipo === 'valida' ? s.pts : 0, nota };
    })
    .sort((a, b) => (a.pos ?? Infinity) - (b.pos ?? Infinity) || a.e.t - b.e.t);

  const nome = (l: LinhaFila) => {
    const n = apelidos.get(l.e.uid) ?? l.e.uid.slice(0, 6);
    return (aparelhos.get(l.e.uid)?.size ?? 0) > 1 ? `${n} · ${l.e.dispositivoId.slice(0, 4)}` : n;
  };
  const podeAnular = partida && partida.estado !== 'finalizada';

  const confirmarAnulacao = async () => {
    if (!anular || !partida) return;
    setOcupado(true);
    try {
      await anularEntrada(partida.id, ponto.id, anular.e.chave);
    } finally {
      setOcupado(false);
      setAnular(null);
    }
  };

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby={`fila-${ponto.id}`}>
      <h3 id={`fila-${ponto.id}`} className="m-0 font-display text-base font-bold">
        Fila do ponto {ponto.numero}
      </h3>
      {linhas.length === 0 ? (
        <p className="m-0 text-sm text-tinta-suave">Ninguém balançou aqui ainda.</p>
      ) : compacto ? (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {linhas.map((l) => (
            <li
              key={l.e.chave}
              className={`flex items-center gap-3 rounded-xl border bg-white px-3.5 py-3 ${l.nota.startsWith('conflito') ? 'border-[#FDE68A]' : 'border-[#E4E4E7]'} ${l.pos == null ? 'opacity-75' : ''}`}
            >
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${l.pos ? 'bg-tinta text-white' : 'bg-areia text-tinta-suave'}`}>
                {l.pos ? `${l.pos}º` : '—'}
              </span>
              <span className="flex min-w-0 grow flex-col gap-0.5">
                <span className={`font-semibold ${l.e.anulada ? 'line-through' : ''}`}>{nome(l)}</span>
                <span className="font-mono text-xs text-tinta-suave">
                  {hora(l.e.t, true)} · {l.e.fonte === 'monotonica' ? 'monotônica' : 'relógio corrigido'}
                </span>
                {l.nota && <span className="text-xs font-semibold text-[#A15C07]">{l.nota}</span>}
              </span>
              <span className="font-bold">{l.pts}</span>
              {podeAnular && l.pos != null && (
                <button
                  type="button"
                  aria-label={`Anular balançada de ${nome(l)}`}
                  onClick={() => setAnular(l)}
                  className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-[#E4E4E7] text-perigo"
                >
                  <Icone nome="anular" tamanho={18} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="text-left text-tinta-suave">
                <th className="border-b border-[#E2DED3] px-1.5 py-2 font-semibold">Pos.</th>
                <th className="border-b border-[#E2DED3] px-1.5 py-2 font-semibold">Jogador</th>
                <th className="border-b border-[#E2DED3] px-1.5 py-2 font-semibold">Horário</th>
                <th className="border-b border-[#E2DED3] px-1.5 py-2 font-semibold">Fonte</th>
                <th className="border-b border-[#E2DED3] px-1.5 py-2 text-right font-semibold">Pts</th>
                <th className="border-b border-[#E2DED3]">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.e.chave} className={l.pos == null ? 'text-[#7A847E]' : ''}>
                  <td className="border-b border-[#EFECE4] px-1.5 py-2">{l.pos ? `${l.pos}º` : '—'}</td>
                  <td className={`border-b border-[#EFECE4] px-1.5 py-2 ${l.e.anulada ? 'line-through' : ''}`}>{nome(l)}</td>
                  <td className="border-b border-[#EFECE4] px-1.5 py-2 font-mono text-[12.5px]">{hora(l.e.t, true)}</td>
                  <td className="border-b border-[#EFECE4] px-1.5 py-2 text-xs">
                    {l.nota || (l.e.fonte === 'monotonica' ? 'monotônica' : 'relógio corrigido')}
                  </td>
                  <td className="border-b border-[#EFECE4] px-1.5 py-2 text-right font-semibold">{l.pts}</td>
                  <td className="border-b border-[#EFECE4] px-1.5 py-1 text-right">
                    {podeAnular && l.pos != null && (
                      <button
                        type="button"
                        onClick={() => setAnular(l)}
                        className="h-8 rounded-md border border-[#C9C3B5] bg-white px-2.5 text-[12.5px] text-perigo-texto"
                      >
                        Anular
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="m-0 text-[12.5px] leading-normal text-tinta-suave">
        Ordenado pelo horário da balançada. Um sync atrasado pode entrar no meio da fila e empurrar os de baixo.
      </p>
      {anular && (
        <Confirmar
          titulo={`Anular a balançada de ${nome(anular)}?`}
          rotuloOk="Anular"
          perigo
          ocupado={ocupado}
          aoCancelar={() => setAnular(null)}
          aoConfirmar={() => void confirmarAnulacao()}
        >
          <p className="m-0">
            Ela deixa de pontuar e a fila é recalculada. {nome(anular)} poderá balançar este ponto de novo, entrando no fim da fila.
          </p>
        </Confirmar>
      )}
    </section>
  );
}
