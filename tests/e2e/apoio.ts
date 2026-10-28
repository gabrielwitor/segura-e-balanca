import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { expect, type BrowserContext, type Page } from '@playwright/test';

export const PROJETO = 'demo-seb';
export const PONTO_A = { lat: -23.5589, lng: -46.7315 };
export const PONTO_B = { lat: -23.5600, lng: -46.7330 };

let env: RulesTestEnvironment | null = null;

export async function ambiente(): Promise<RulesTestEnvironment> {
  env ??= await initializeTestEnvironment({
    projectId: PROJETO,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 },
  });
  return env;
}

/** Estado inicial: partida #1 ativa com dois pontos. */
export async function semear(): Promise<void> {
  const e = await ambiente();
  await e.clearFirestore();
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJETO}/accounts`, { method: 'DELETE' });
  await e.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const ponto = (numero: number, pos: { lat: number; lng: number }) => ({
      numero, nome: `Ponto ${numero}`, ...pos, raioM: 25, valorBase: 100, passoPct: 0.1, pisoPct: 0.2,
      dica: `Dica do ponto ${numero}`, ativo: true, desativadoEm: null,
    });
    await setDoc(doc(db, 'config/jogo'), { partidaAtual: 'p1' });
    await setDoc(doc(db, 'partidas/p1'), { numero: 1, estado: 'ativa', criadaEm: Date.now(), finalizadaEm: null, pausas: [], rankingFinal: null });
    await setDoc(doc(db, 'pontos/A'), ponto(1, PONTO_A));
    await setDoc(doc(db, 'pontos/B'), ponto(2, PONTO_B));
    await setDoc(doc(db, 'partidas/p1/filas/A'), { entradas: {} });
    await setDoc(doc(db, 'partidas/p1/filas/B'), { entradas: {} });
  });
}

export async function entradasNoServidor(pontoId: string): Promise<Record<string, { uid: string; t: number }>> {
  const e = await ambiente();
  let r: Record<string, { uid: string; t: number }> = {};
  await e.withSecurityRulesDisabled(async (ctx) => {
    r = ((await getDoc(doc(ctx.firestore(), `partidas/p1/filas/${pontoId}`))).get('entradas') ?? {}) as typeof r;
  });
  return r;
}

export const geo = (pos: { lat: number; lng: number }) => ({ latitude: pos.lat, longitude: pos.lng, accuracy: 5 });

export async function irPara(ctx: BrowserContext, pos: { lat: number; lng: number }) {
  await ctx.setGeolocation(geo(pos));
}

/** Login no Auth Emulator, apelido e entrada na partida (telas 1 e 6). */
export async function entrarNoJogo(page: Page, uid: string, apelido: string, { novo = true, dicas = 'pular' }: { novo?: boolean; dicas?: 'pular' | 'manter' } = {}) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar com Google' }).waitFor();
  await page.evaluate(
    ([u, n]) => (window as unknown as { __seb: { entrar: (a: string, b: string, c: string) => Promise<void> } }).__seb.entrar(u!, n!, `${u}@teste.dev`),
    [uid, apelido],
  );
  if (novo) {
    await page.getByLabel('Apelido').fill(apelido);
    await expect(page.getByText('Disponível')).toBeVisible();
    await page.getByRole('button', { name: 'Continuar' }).click();
  }
  // Instalar a PWA é opcional: no teste, pula.
  await page.getByRole('button', { name: 'Agora não' }).click();
  await page.getByRole('button', { name: 'Permitir e continuar' }).click();
  // Dicas e treino da primeira vez.
  if (dicas === 'manter') return;
  await page.getByRole('button', { name: 'Pular', exact: true }).click();
  await expect(page.getByTestId('temperatura')).toBeVisible();
}

/** Picos de aceleração sintéticos, depois da carência do toque (300 ms). */
export async function sacudir(page: Page, vezes = 8) {
  await page.evaluate(async (n) => {
    await new Promise((r) => setTimeout(r, 350));
    for (let i = 0; i < n; i++) {
      const x = i % 2 ? 25 : -25;
      // O WebKit não deixa construir DeviceMotionEvent: um Event comum com o mesmo campo serve.
      const ev = new Event('devicemotion');
      Object.defineProperty(ev, 'accelerationIncludingGravity', { value: { x, y: 0, z: 9.8 } });
      window.dispatchEvent(ev);
      await new Promise((r) => setTimeout(r, 160));
    }
  }, vezes);
}

/** RF-22: segura o botão e manda picos de aceleração sintéticos (DeviceMotionEvent). */
export async function balancar(page: Page) {
  const botao = page.getByTestId('balancar');
  await expect(botao).toBeEnabled();
  // Sem toque válido na página ainda (ex.: logo depois de recarregar), o 1º toque ativa som e sensores.
  if ((await botao.textContent())?.includes('Toque para ativar')) {
    await botao.click();
    await expect(botao).toContainText('Segura e balança');
  }
  await botao.dispatchEvent('pointerdown');
  // Sacudidas de sobra para o padrão de 4.
  await sacudir(page);
  await expect(page.getByTestId('balancou')).toBeVisible();
}

export async function voltarAoRadar(page: Page) {
  await page.getByRole('button', { name: /^(Próxima pista|Voltar ao radar)$/ }).click();
}

export async function escolherPista(page: Page, n: number) {
  await page.getByRole('button', { name: new RegExp(`^Pista ${n}`) }).click();
}

/** Espera o service worker assumir, para o app abrir offline (RNF-03). */
export async function esperarServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

export const conexao = (page: Page) => page.getByTestId('conexao');
