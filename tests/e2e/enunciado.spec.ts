import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  PONTO_A,
  PONTO_B,
  balancar,
  conexao,
  entradasNoServidor,
  entrarNoJogo,
  escolherPonto,
  geo,
  esperarServiceWorker,
  irPara,
  semear,
  voltarAoRadar,
} from './apoio';

test.beforeEach(async () => {
  await semear();
});

test('balançar online: a entrada aparece no servidor', async ({ page, context }) => {
  await irPara(context, PONTO_A);
  await entrarNoJogo(page, 'ana', 'Ana Lima');
  await expect(page.getByTestId('temperatura')).toContainText('Você chegou!');
  await balancar(page);
  await expect(page.getByTestId('balancou')).toContainText('1º lugar · +100');
  expect(Object.keys(await entradasNoServidor('A'))).toHaveLength(1);
  await voltarAoRadar(page);
  await expect(page.getByTestId('meus-pontos')).toHaveText('100 pts');
});

test('cair a rede, balançar, fechar e reabrir offline, voltar a rede', async ({ page, context }) => {
  await irPara(context, PONTO_A);
  await entrarNoJogo(page, 'bia', 'Bia');
  await esperarServiceWorker(page);

  await context.setOffline(true);
  await expect(conexao(page)).toContainText('Sem rede');
  await balancar(page);
  await expect(page.getByTestId('balancou')).toContainText('Enviamos quando a internet voltar');
  await voltarAoRadar(page);
  await expect(conexao(page)).toContainText('1');

  // Fechar e reabrir offline: tudo volta do IndexedDB (RF-32).
  await page.reload();
  await expect(page.getByTestId('temperatura')).toBeVisible();
  await expect(conexao(page)).toContainText('Sem rede');
  await page.getByRole('button', { name: 'Ranking' }).click();
  await expect(page.getByTestId('minhas-balancadas')).toContainText('Pendente');
  await expect(page.getByTestId('ranking-frescor')).toContainText('Atualizado há');

  // A rede volta: o sync dispara sozinho (RF-34).
  await context.setOffline(false);
  await expect(page.getByTestId('minhas-balancadas')).toContainText('1º · 100 pts', { timeout: 30_000 });
  await expect(conexao(page)).toHaveText('Sincronizado');
  expect(Object.keys(await entradasNoServidor('A'))).toHaveLength(1);
});

test('outro dispositivo recupera o progresso', async ({ page, context, browser }) => {
  await irPara(context, PONTO_A);
  await entrarNoJogo(page, 'caio', 'Caio');
  await balancar(page);
  await expect(page.getByTestId('balancou')).toContainText('1º lugar');

  const outro = await browser.newContext({ permissions: ['geolocation'], geolocation: geo(PONTO_B) });
  const tablet = await outro.newPage();
  await entrarNoJogo(tablet, 'caio', 'Caio', { novo: false });
  await expect(tablet.getByTestId('meus-pontos')).toHaveText('100 pts');
  await tablet.getByRole('button', { name: 'Ranking' }).click();
  await expect(tablet.getByTestId('minhas-balancadas')).toContainText('outro aparelho');
  await outro.close();
});

test('servidor fora: indicador, backoff e envio depois que volta', async ({ page, context }) => {
  await irPara(context, PONTO_A);
  await entrarNoJogo(page, 'davi', 'Davi');
  await page.route(/:(8085|9099)\//, (r) => r.abort());
  await balancar(page);
  await voltarAoRadar(page);
  await expect(conexao(page)).toContainText('Servidor fora', { timeout: 30_000 });
  await page.unroute(/:(8085|9099)\//);
  await expect(conexao(page)).toHaveText('Sincronizado', { timeout: 90_000 });
  expect(Object.keys(await entradasNoServidor('A'))).toHaveLength(1);
});

test('reenvio não muda nada e conflito entre aparelhos descarta o mais tarde', async ({ page, context, browser }) => {
  await irPara(context, PONTO_A);
  await entrarNoJogo(page, 'eva', 'Eva');

  // Segundo aparelho da mesma conta, também no ponto A.
  const outro = await browser.newContext({ permissions: ['geolocation'], geolocation: geo(PONTO_A) });
  const tablet = await outro.newPage();
  await entrarNoJogo(tablet, 'eva', 'Eva', { novo: false });

  await context.setOffline(true);
  await outro.setOffline(true);
  await balancar(page);
  await voltarAoRadar(page);
  await page.waitForTimeout(400);
  await balancar(tablet);
  await voltarAoRadar(tablet);

  await outro.setOffline(false);
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Ranking' }).click();
  await expect(page.getByTestId('minhas-balancadas')).toContainText('Descartada: conflito', { timeout: 30_000 });
  await expect(page.getByTestId('minhas-balancadas')).toContainText('1º · 100 pts');
  expect(Object.keys(await entradasNoServidor('A'))).toHaveLength(2);

  // Reenvio da mesma chave (RF-35): ranking igual.
  await page.getByRole('button', { name: 'Debug' }).click();
  await page.getByTestId('reenviar').click();
  await expect(page.getByText('Reenviada: o servidor tratou como no-op.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sua posição' })).toContainText('100');
  expect(Object.keys(await entradasNoServidor('A'))).toHaveLength(2);
  await outro.close();
});

test('fora do raio não deixa balançar; ponto escolhido mostra a pista (dica)', async ({ page, context }) => {
  await irPara(context, { lat: PONTO_A.lat + 0.0009, lng: PONTO_A.lng }); // ~100 m
  await entrarNoJogo(page, 'fabi', 'Fabi');
  await escolherPonto(page, 1);
  await expect(page.getByTestId('temperatura')).toContainText('Morno');
  await expect(page.getByTestId('balancar')).toBeDisabled();
  await expect(page.getByText('Dica do ponto 1')).toBeVisible();
});

test('acessibilidade das telas principais (axe)', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar com Google' }).waitFor();
  const login = await new AxeBuilder({ page }).analyze();
  expect(login.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  await irPara(context, PONTO_A);
  await entrarNoJogo(page, 'gabi', 'Gabi');
  const radar = await new AxeBuilder({ page }).analyze();
  expect(radar.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
});
