import { expect, test } from '@playwright/test';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ambiente, semear } from './apoio';

/** Entra no /admin e se promove a admin pelo emulador (o painel mostra o UID na tela de "sem acesso"). */
async function entrarComoAdmin(page: import('@playwright/test').Page) {
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Entrar com Google' }).waitFor();
  await page.evaluate(() => (window as unknown as { __seb: { entrar: (a: string, b: string, c: string) => Promise<void> } }).__seb.entrar('chefe', 'Chefe', 'chefe@teste.dev'));
  const caminho = await page.locator('code').filter({ hasText: 'admins/' }).textContent();
  const env = await ambiente();
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), caminho!), {}));
  await page.reload();
  await expect(page.getByText('Todos os pontos')).toBeVisible();
}

// Painel do admin no desktop (tela 5), em qualquer projeto do Playwright.
test.use({ viewport: { width: 1400, height: 900 }, isMobile: false, hasTouch: false });

test.beforeEach(async () => {
  await semear();
});

test('em rascunho, excluir um ponto apaga a fila e renumera os seguintes', async ({ page }) => {
  const env = await ambiente();
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'partidas/p1'), { estado: 'rascunho' }));
  await entrarComoAdmin(page);

  await page.getByRole('button', { name: /^Ponto 1/ }).click();
  await page.getByRole('button', { name: 'Excluir ponto' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir' }).click();

  const lista = page.getByRole('region', { name: 'Todos os pontos' });
  await expect(lista.getByRole('button')).toHaveCount(1);
  await expect(lista).toContainText('Ponto 1');

  // A tela atualiza antes do servidor confirmar o lote: espera o servidor.
  const noServidor = async () => {
    let r = {};
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      r = {
        pontoA: (await getDoc(doc(db, 'pontos/A'))).exists(),
        filaA: (await getDoc(doc(db, 'partidas/p1/filas/A'))).exists(),
        numeroB: (await getDoc(doc(db, 'pontos/B'))).get('numero'),
      };
    });
    return r;
  };
  await expect.poll(noServidor).toEqual({ pontoA: false, filaA: false, numeroB: 1 });
});

test('com a partida ativa, só desativa', async ({ page }) => {
  await entrarComoAdmin(page);
  await page.getByRole('button', { name: /^Ponto 1/ }).click();
  await expect(page.getByRole('button', { name: 'Desativar ponto' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Excluir ponto' })).toHaveCount(0);
});
