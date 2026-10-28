import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteField, doc, FieldPath, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

let env: RulesTestEnvironment;
const DISP = '0b6f6a3e-7c1e-4c1a-9a51-0e0a8f0f3a11';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-seb',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 },
  });
});
afterAll(() => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins/chefe'), {});
    await setDoc(doc(db, 'config/jogo'), { partidaAtual: 'p1' });
    await setDoc(doc(db, 'partidas/p1'), { numero: 1, estado: 'ativa', pausas: [] });
    await setDoc(doc(db, 'partidas/p1/filas/A'), { entradas: {} });
    await setDoc(doc(db, 'partidas/fim'), { numero: 0, estado: 'finalizada', pausas: [] });
    await setDoc(doc(db, 'partidas/fim/filas/A'), { entradas: {} });
  });
});

const jogador = (uid = 'ana') => env.authenticatedContext(uid).firestore();
const admin = () => env.authenticatedContext('chefe').firestore();

const entrada = (uid = 'ana', v = 0, extra: Record<string, unknown> = {}) => ({
  uid, dispositivoId: DISP, v, t: 1000, fonte: 'monotonica',
  lat: -23.5, lng: -46.7, accuracy: 6, recebidoEm: serverTimestamp(), anulada: false,
  ...extra,
});
const chave = (uid = 'ana', v = 0) => `${uid}_${DISP}_${v}`;
const enviar = (db: ReturnType<typeof jogador>, pid: string, k: string, e: object) =>
  updateDoc(doc(db, `partidas/${pid}/filas/A`), new FieldPath('entradas', k), e);

describe('filas (seção 5.3)', () => {
  it('jogador adiciona a própria entrada', async () => {
    await assertSucceeds(enviar(jogador(), 'p1', chave(), entrada()));
  });

  it('não escreve com o UID de outro', async () => {
    await assertFails(enviar(jogador('ana'), 'p1', chave('bia'), entrada('bia')));
    await assertFails(enviar(jogador('ana'), 'p1', chave('ana'), entrada('bia')));
  });

  it('chave tem de bater com uid, dispositivo e v', async () => {
    await assertFails(enviar(jogador(), 'p1', chave('ana', 7), entrada('ana', 0)));
  });

  it('não entra já anulada, sem hora do servidor ou com campo extra', async () => {
    await assertFails(enviar(jogador(), 'p1', chave(), entrada('ana', 0, { anulada: true })));
    await assertFails(enviar(jogador(), 'p1', chave(), entrada('ana', 0, { recebidoEm: 5 })));
    await assertFails(enviar(jogador(), 'p1', chave(), entrada('ana', 0, { pontos: 100 })));
  });

  it('entrada é imutável: nem o dono altera ou apaga', async () => {
    await assertSucceeds(enviar(jogador(), 'p1', chave(), entrada()));
    await assertFails(updateDoc(doc(jogador(), 'partidas/p1/filas/A'), new FieldPath('entradas', chave(), 't'), 1));
    await assertFails(updateDoc(doc(jogador(), 'partidas/p1/filas/A'), new FieldPath('entradas', chave()), deleteField()));
  });

  it('uma entrada por escrita', async () => {
    await assertFails(
      updateDoc(doc(jogador(), 'partidas/p1/filas/A'), {
        [`entradas.${'ana_aaaaaaaa_0'}`]: entrada('ana', 0, { dispositivoId: 'aaaaaaaa' }),
        [`entradas.${'ana_aaaaaaaa_1'}`]: entrada('ana', 1, { dispositivoId: 'aaaaaaaa' }),
      }),
    );
  });

  it('partida finalizada recusa (RF-38)', async () => {
    await assertFails(enviar(jogador(), 'fim', chave(), entrada()));
  });

  it('partida pausada aceita (a regra de pontuação é que descarta, RF-37)', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'partidas/p1'), { estado: 'pausada' }));
    await assertSucceeds(enviar(jogador(), 'p1', chave(), entrada()));
  });

  it('sem login nem lê', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'partidas/p1/filas/A')));
  });

  it('admin anula e cria filas; jogador não', async () => {
    await assertSucceeds(enviar(jogador(), 'p1', chave(), entrada()));
    await assertSucceeds(updateDoc(doc(admin(), 'partidas/p1/filas/A'), new FieldPath('entradas', chave(), 'anulada'), true));
    await assertFails(setDoc(doc(jogador(), 'partidas/p1/filas/B'), { entradas: {} }));
    await assertSucceeds(setDoc(doc(admin(), 'partidas/p1/filas/B'), { entradas: {} }));
  });
});

describe('admin (RF-50)', () => {
  it('só quem está na lista escreve pontos e partidas', async () => {
    await assertFails(setDoc(doc(jogador(), 'pontos/X'), { lat: 0 }));
    await assertFails(updateDoc(doc(jogador(), 'partidas/p1'), { estado: 'finalizada' }));
    await assertSucceeds(setDoc(doc(admin(), 'pontos/X'), { lat: 0 }));
    await assertSucceeds(updateDoc(doc(admin(), 'partidas/p1'), { estado: 'pausada' }));
  });

  it('ninguém se promove a admin', async () => {
    await assertFails(setDoc(doc(jogador(), 'admins/ana'), {}));
  });
});

describe('jogadores e apelidos (RF-02, RF-57)', () => {
  const criar = (db: ReturnType<typeof jogador>, uid: string, n: string, donoApelido = uid) => {
    const b = writeBatch(db);
    b.set(doc(db, `apelidos/${n}`), { uid: donoApelido, apelido: n });
    b.set(doc(db, `jogadores/${uid}`), { apelido: n, apelidoNormalizado: n, criadoEm: serverTimestamp(), partidas: [] });
    return b.commit();
  };

  it('cria jogador junto com o apelido', async () => {
    await assertSucceeds(criar(jogador('ana'), 'ana', 'ana lima'));
  });

  it('apelido já reservado por outro não serve', async () => {
    await assertSucceeds(criar(jogador('ana'), 'ana', 'ana lima'));
    await assertFails(criar(jogador('bia'), 'bia', 'ana lima'));
  });

  it('não cria jogador sem reservar o apelido', async () => {
    const db = jogador('ana');
    await assertFails(setDoc(doc(db, 'jogadores/ana'), { apelido: 'x', apelidoNormalizado: 'x', criadoEm: serverTimestamp(), partidas: [] }));
  });

  it('jogador só acrescenta partidas; renomear é do admin', async () => {
    await assertSucceeds(criar(jogador('ana'), 'ana', 'ana'));
    await assertSucceeds(updateDoc(doc(jogador('ana'), 'jogadores/ana'), { partidas: ['p1'] }));
    await assertFails(updateDoc(doc(jogador('ana'), 'jogadores/ana'), { apelido: 'outra' }));
    await assertSucceeds(updateDoc(doc(admin(), 'jogadores/ana'), { apelido: 'Ana R.' }));
  });
});

describe('relógio (seção 7.2)', () => {
  it('cada um só o seu', async () => {
    await assertSucceeds(setDoc(doc(jogador('ana'), 'relogio/ana'), { agora: serverTimestamp() }));
    await assertFails(setDoc(doc(jogador('ana'), 'relogio/bia'), { agora: serverTimestamp() }));
  });
});
