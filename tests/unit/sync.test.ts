import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EstadoConexao } from '@/dominio/tipos';
import { abrirBanco, obterAparelho, type BancoLocal } from '@/sync/db';
import { registrarBalancada, Sincronizador, type PortaDeConexao } from '@/sync/saida';
import { MonitorDeConexao, type AmbienteDeConexao } from '@/sync/conexao';
import { RelogioAncorado } from '@/sync/relogio';
import { RemotoFalso } from './remoto-falso';

class ConexaoFalsa implements PortaDeConexao {
  constructor(public atual: EstadoConexao = 'online') {}
  estado() {
    return this.atual;
  }
  marcarServidorIndisponivel() {
    this.atual = 'servidor-indisponivel';
  }
  marcarServidorRespondendo() {
    this.atual = 'online';
  }
}

let db: BancoLocal;
let remoto: RemotoFalso;
let conexao: ConexaoFalsa;
let agora: number;
let sync: Sincronizador;
let n = 0;

const balancar = (pontoId = 'A', t = 100) =>
  registrarBalancada(db, { uid: 'ana', partidaId: 'p1', pontoId, t, fonte: 'monotonica', lat: 1, lng: 2, accuracy: 5 }, agora);

beforeEach(async () => {
  db = abrirBanco(`teste-${n++}`);
  await obterAparelho(db);
  remoto = new RemotoFalso();
  conexao = new ConexaoFalsa();
  agora = 10_000;
  sync = new Sincronizador(db, remoto, conexao, () => agora, () => 0.5);
});

afterEach(() => {
  sync.parar();
  db.close();
});

describe('fila de saída (seção 6.2)', () => {
  it('grava antes do envio e apaga só depois da confirmação', async () => {
    const item = await balancar();
    expect(await db.saida.count()).toBe(1);
    await sync.sincronizar();
    expect(await db.saida.count()).toBe(0);
    expect(remoto.filas.get('p1/A')?.[item.chave]).toMatchObject({ uid: 'ana', t: 100 });
    // Já está na fila confirmada local, sem depender do listener.
    expect((await db.filas.get('A'))?.entradas[item.chave]).toMatchObject({ uid: 'ana', t: 100, anulada: false });
  });

  it('chaves nunca se repetem no mesmo aparelho', async () => {
    const a = await balancar('A');
    const b = await balancar('B');
    expect(a.chave).not.toBe(b.chave);
    expect(a.chave.endsWith('_0')).toBe(true);
    expect(b.chave.endsWith('_1')).toBe(true);
  });

  it('sem rede: não tenta e mantém pendente (RF-31)', async () => {
    conexao.atual = 'sem-rede';
    await balancar();
    await sync.sincronizar();
    expect(remoto.envios).toBe(0);
    expect((await db.saida.toArray())[0]!.status).toBe('pendente');
  });

  it('servidor fora: backoff exponencial e marca indisponível (RNF-07, RNF-08)', async () => {
    remoto.fora = true;
    await balancar();
    await sync.sincronizar();
    let item = (await db.saida.toArray())[0]!;
    expect(item).toMatchObject({ status: 'pendente', tentativas: 1, proximaTentativa: agora + 4000 });
    expect(conexao.atual).toBe('servidor-indisponivel');

    // Antes da hora, nem tenta.
    const envios = remoto.envios;
    await sync.sincronizar();
    expect(remoto.envios).toBe(envios);

    agora += 4000;
    await sync.sincronizar();
    item = (await db.saida.toArray())[0]!;
    expect(item).toMatchObject({ tentativas: 2, proximaTentativa: agora + 8000 });

    remoto.fora = false;
    agora += 8000;
    await sync.sincronizar();
    expect(await db.saida.count()).toBe(0);
    expect(conexao.atual).toBe('online');
  });

  it('reenvio do que já chegou é no-op e sai da fila (RF-35)', async () => {
    const item = await balancar();
    await sync.sincronizar();
    // Simula "app fechou antes de apagar": o item volta para a saída.
    await db.saida.put({ ...item, status: 'enviando' });
    await sync.recuperarAoAbrir();
    expect((await db.saida.get(item.chave))!.status).toBe('pendente');
    await sync.sincronizar();
    expect(await db.saida.count()).toBe(0);
    expect(Object.keys(remoto.filas.get('p1/A')!)).toHaveLength(1);
  });

  it('partida finalizada: recusa definitiva, sem novas tentativas (RF-38)', async () => {
    remoto.estado = 'finalizada';
    await balancar();
    await sync.sincronizar();
    const item = (await db.saida.toArray())[0]!;
    expect(item.status).toBe('rejeitada');
    const envios = remoto.envios;
    agora += 120_000;
    await sync.sincronizar();
    expect(remoto.envios).toBe(envios);
    expect(conexao.atual).toBe('online');
  });

  it('ao reconectar, ignora o backoff e envia na hora', async () => {
    remoto.fora = true;
    await balancar();
    await sync.sincronizar();
    expect((await db.saida.toArray())[0]!.proximaTentativa).toBeGreaterThan(agora);
    remoto.fora = false;
    conexao.atual = 'online';
    await sync.aoReconectar();
    expect(await db.saida.count()).toBe(0);
  });

  it('timeout volta a pendente', async () => {
    remoto.enviarEntrada = () => new Promise(() => {});
    const s = new Sincronizador(db, remoto, conexao, () => agora, () => 0.5, 20);
    await balancar();
    await s.sincronizar();
    s.parar();
    expect((await db.saida.toArray())[0]).toMatchObject({ status: 'pendente', tentativas: 1, erro: 'timeout' });
  });
});

describe('monitor de conexão (seção 6.1)', () => {
  const ambiente = (online: { v: boolean }): AmbienteDeConexao & { disparar(): void } => {
    let cb: () => void = () => {};
    return {
      online: () => online.v,
      visivel: () => true,
      aoMudarRede(f) {
        cb = f;
        return () => {};
      },
      aoMudarVisibilidade: () => () => {},
      disparar: () => cb(),
    };
  };

  it('online → sem rede → servidor indisponível → online', async () => {
    const rede = { v: true };
    const amb = ambiente(rede);
    let fora = false;
    const m = new MonitorDeConexao(async () => {
      if (fora) throw new Error('x');
    }, amb, 1_000_000, 50);
    let reconexoes = 0;
    m.aoReconectar(() => reconexoes++);
    m.iniciar();
    expect(await m.heartbeat()).toBe('online');

    rede.v = false;
    amb.disparar();
    expect(m.estado()).toBe('sem-rede');

    rede.v = true;
    fora = true;
    expect(await m.heartbeat()).toBe('servidor-indisponivel');

    fora = false;
    expect(await m.heartbeat()).toBe('online');
    expect(reconexoes).toBe(1);
    m.parar();
  });

  it('heartbeat pendurado conta como servidor indisponível', async () => {
    const m = new MonitorDeConexao(() => new Promise(() => {}), ambiente({ v: true }), 1_000_000, 20);
    expect(await m.heartbeat()).toBe('servidor-indisponivel');
  });
});

describe('relógio ancorado (seção 7.2)', () => {
  it('ancora, persiste o desvio e cai para relógio corrigido ao reabrir', async () => {
    let perf = 0;
    let sistema = 990_000;
    const r = new RelogioAncorado(db, () => perf, () => sistema);
    remoto.relogioServidor = 1_000_000;
    await r.ancorar(remoto, 'ana');
    perf = 5000;
    sistema += 5000;
    expect(r.agoraNoServidor()).toEqual({ t: 1_005_000, fonte: 'monotonica' });

    const reaberto = new RelogioAncorado(db, () => 0, () => sistema);
    await reaberto.carregar();
    expect(reaberto.agoraNoServidor()).toEqual({ t: 1_005_000, fonte: 'relogio-corrigido' });
  });
});
