import { esperaDoBackoff } from '@/dominio/backoff';
import { ENVIO_TIMEOUT_MS } from '@/dominio/constantes';
import { chaveDaEntrada, type EstadoConexao, type FonteHorario } from '@/dominio/tipos';
import type { BancoLocal, ItemSaida } from './db';
import { ErroRemoto, type Remoto } from './remoto';

export interface DadosDaBalancada {
  uid: string;
  partidaId: string;
  pontoId: string;
  t: number;
  fonte: FonteHorario;
  lat: number;
  lng: number;
  accuracy: number;
}

/**
 * RF-26: grava na fila de saída ANTES de qualquer feedback de sucesso.
 * A versão `v` vem de um contador do aparelho, então a chave nunca se repete.
 */
export async function registrarBalancada(db: BancoLocal, dados: DadosDaBalancada, agora = Date.now()): Promise<ItemSaida> {
  return db.transaction('rw', db.sessao, db.saida, async () => {
    const aparelho = await db.sessao.get('aparelho');
    if (!aparelho?.dispositivoId) throw new Error('Aparelho sem identificação');
    const v = aparelho.proximoV ?? 0;
    await db.sessao.put({ ...aparelho, proximoV: v + 1 });
    const { uid, partidaId, pontoId, t, fonte, lat, lng, accuracy } = dados;
    const chave = chaveDaEntrada(uid, aparelho.dispositivoId, v);
    const item: ItemSaida = {
      chave,
      partidaId,
      pontoId,
      entrada: { uid, dispositivoId: aparelho.dispositivoId, v, t, fonte, lat, lng, accuracy },
      status: 'pendente',
      tentativas: 0,
      proximaTentativa: 0,
      erro: null,
      criadoEm: agora,
    };
    await db.saida.put(item);
    return item;
  });
}

export interface PortaDeConexao {
  estado(): EstadoConexao;
  marcarServidorIndisponivel(): void;
  marcarServidorRespondendo(): void;
}

export function comTimeout<T>(ms: number, p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new ErroRemoto('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

/** Seção 6.2: envia a fila de saída item a item, com backoff e idempotência. */
export class Sincronizador {
  private rodando = false;
  private pedidoDuranteExecucao = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private parado = false;

  constructor(
    private readonly db: BancoLocal,
    private readonly remoto: Remoto,
    private readonly conexao: PortaDeConexao,
    private readonly agora: () => number = Date.now,
    private readonly aleatorio: () => number = Math.random,
    private readonly timeoutMs = ENVIO_TIMEOUT_MS,
  ) {}

  /** Ao abrir o app: o que ficou "enviando" (app fechou no meio) volta a pendente. */
  async recuperarAoAbrir(): Promise<number> {
    return this.db.saida.where('status').equals('enviando').modify({ status: 'pendente' });
  }

  /** Gatilhos: online, foco, heartbeat ok, timer do backoff, nova balançada. */
  async sincronizar(): Promise<void> {
    if (this.parado) return;
    // Com "servidor indisponível" ainda tentamos no ritmo do backoff: um envio bem-sucedido
    // é a forma mais rápida de perceber que o servidor voltou.
    if (this.conexao.estado() === 'sem-rede') return;
    if (this.rodando) {
      this.pedidoDuranteExecucao = true;
      return;
    }
    this.rodando = true;
    try {
      do {
        this.pedidoDuranteExecucao = false;
        await this.rodada();
      } while (this.pedidoDuranteExecucao && this.conexao.estado() !== 'sem-rede');
    } finally {
      this.rodando = false;
      await this.agendar();
    }
  }

  private async rodada(): Promise<void> {
    const agora = this.agora();
    const itens = (await this.db.saida.where('status').anyOf('pendente', 'enviando').sortBy('criadoEm')).filter(
      (i) => i.proximaTentativa <= agora,
    );
    for (const item of itens) {
      if (this.conexao.estado() === 'sem-rede') return;
      const continuar = await this.enviar(item);
      if (!continuar) return;
    }
  }

  /** Devolve false quando a falha é de comunicação: não adianta tentar os próximos agora. */
  private async enviar(item: ItemSaida): Promise<boolean> {
    await this.db.saida.update(item.chave, { status: 'enviando' });
    try {
      await comTimeout(this.timeoutMs, this.remoto.enviarEntrada(item.partidaId, item.pontoId, item.chave, item.entrada));
      await this.confirmar(item); // só sai da saída após confirmação
      this.conexao.marcarServidorRespondendo();
      return true;
    } catch (err) {
      const codigo = err instanceof ErroRemoto ? err.codigo : 'outro';
      if (codigo === 'permission-denied') {
        // Reenvio de algo que já está lá (o recebidoEm mudaria) também é recusado pela regra:
        // conferimos antes de declarar a recusa definitiva (RF-35).
        const jaChegou = await this.remoto.entradaExiste(item.partidaId, item.pontoId, item.chave).catch(() => null);
        if (jaChegou === true) {
          await this.confirmar(item);
          return true;
        }
        if (jaChegou === false) {
          await this.db.saida.update(item.chave, { status: 'rejeitada', erro: 'permission-denied' });
          return true;
        }
      }
      const tentativas = item.tentativas + 1;
      await this.db.saida.update(item.chave, {
        status: 'pendente',
        tentativas,
        proximaTentativa: this.agora() + esperaDoBackoff(tentativas, this.aleatorio()),
        erro: err instanceof Error ? err.message : String(err),
      });
      if (codigo === 'timeout' || codigo === 'unavailable' || codigo === 'permission-denied') {
        this.conexao.marcarServidorIndisponivel();
        return false;
      }
      return true; // falha só deste item (ex.: not-found): segue com os outros
    }
  }

  /**
   * Tira da saída e põe na fila confirmada local na mesma transação: a balançada nunca some
   * da tela entre a confirmação e a chegada do snapshot do servidor (que depois a substitui).
   */
  private async confirmar(item: ItemSaida): Promise<void> {
    await this.db.transaction('rw', this.db.saida, this.db.filas, async () => {
      await this.db.saida.delete(item.chave);
      const fila = (await this.db.filas.get(item.pontoId)) ?? { pontoId: item.pontoId, partidaId: item.partidaId, entradas: {} };
      if (fila.partidaId !== item.partidaId || fila.entradas[item.chave]) return;
      fila.entradas = { ...fila.entradas, [item.chave]: { ...item.entrada, recebidoEm: this.agora(), anulada: false } };
      await this.db.filas.put(fila);
    });
  }

  private async agendar(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.parado) return;
    const pendentes = await this.db.saida.where('status').equals('pendente').toArray();
    if (pendentes.length === 0) return;
    const proxima = Math.min(...pendentes.map((i) => i.proximaTentativa));
    const espera = Math.max(proxima - this.agora(), 250);
    this.timer = setTimeout(() => void this.sincronizar(), espera);
  }

  /** O servidor voltou (heartbeat ok): o backoff já cumpriu seu papel, envia tudo agora. */
  async aoReconectar(): Promise<void> {
    await this.db.saida.where('status').equals('pendente').modify({ proximaTentativa: 0 });
    await this.sincronizar();
  }

  /** Para o botão de debug "reenviar última balançada" (seção 10.1). */
  async reenviar(item: ItemSaida): Promise<void> {
    await this.remoto.enviarEntrada(item.partidaId, item.pontoId, item.chave, item.entrada).catch(async (err) => {
      if (err instanceof ErroRemoto && err.codigo === 'permission-denied') {
        if (await this.remoto.entradaExiste(item.partidaId, item.pontoId, item.chave)) return;
      }
      throw err;
    });
  }

  parar(): void {
    this.parado = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
