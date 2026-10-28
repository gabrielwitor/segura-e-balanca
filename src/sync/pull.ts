import type { BancoLocal } from './db';
import { limparPartida } from './db';
import type { Cancelar, InstantaneoDaPartida, Remoto } from './remoto';

/** RF-04: grava tudo no armazenamento local para jogar offline. */
export async function guardarInstantaneo(db: BancoLocal, inst: InstantaneoDaPartida, agora = Date.now()): Promise<void> {
  await db.transaction('rw', db.sessao, db.pontos, db.filas, async () => {
    const anterior = await db.sessao.get('partida');
    if (anterior?.partida?.id !== inst.partida.id) await limparPartida(db);
    await db.sessao.put({ id: 'partida', partida: inst.partida });
    await db.pontos.bulkPut(inst.pontos.map((p) => ({ ...p, sincronizadoEm: agora })));
    await db.filas.bulkPut(inst.filas.map((f) => ({ ...f, partidaId: inst.partida.id })));
    await db.sessao.put({ id: 'sync', ultimoPull: agora });
  });
}

/**
 * Seção 6.3: com conexão, listeners gravam cada snapshot no store local; a UI reage ao store.
 * Devolve uma função que desliga tudo.
 */
export function escutarServidor(
  db: BancoLocal,
  remoto: Remoto,
  aoFalhar: (e: unknown) => void,
  aoTrocarPartida: (partidaId: string | null) => void,
  agora: () => number = Date.now,
): Cancelar {
  let daPartida: Cancelar[] = [];
  const desligarDaPartida = () => {
    daPartida.forEach((c) => c());
    daPartida = [];
  };
  const marcarPull = () => db.sessao.put({ id: 'sync', ultimoPull: agora() });

  const ligarPartida = (partidaId: string) => {
    daPartida.push(
      remoto.escutarPartida(
        partidaId,
        (partida) => void db.sessao.put({ id: 'partida', partida }).then(marcarPull),
        aoFalhar,
      ),
      remoto.escutarFilas(
        partidaId,
        (filas) =>
          void db
            .transaction('rw', db.filas, async () => {
              await db.filas.bulkPut(filas.map((f) => ({ ...f, partidaId })));
            })
            .then(marcarPull),
        aoFalhar,
      ),
    );
  };

  const gerais: Cancelar[] = [
    remoto.escutarPartidaAtual((partidaId) => {
      desligarDaPartida();
      aoTrocarPartida(partidaId);
      if (partidaId) ligarPartida(partidaId);
    }, aoFalhar),
    remoto.escutarPontos((pontos) => {
      const t = agora();
      // O servidor vence (seção 8): substitui o snapshot inteiro.
      void db.transaction('rw', db.pontos, async () => {
        await db.pontos.clear();
        await db.pontos.bulkPut(pontos.map((p) => ({ ...p, sincronizadoEm: t })));
      });
    }, aoFalhar),
    remoto.escutarApelidos((lista) => void db.apelidos.bulkPut(lista), aoFalhar),
  ];

  return () => {
    desligarDaPartida();
    gerais.forEach((c) => c());
  };
}
