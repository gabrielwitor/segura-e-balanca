import { expect, test } from '@playwright/test';
import { PONTO_A, balancar, conexao, entrarNoJogo, irPara, semear, voltarAoRadar } from './apoio';

test.beforeEach(async () => {
  await semear();
});

test('sair da conta volta para o login', async ({ page, context }) => {
  await irPara(context, PONTO_A);
  await entrarNoJogo(page, 'sai', 'Sai');
  await page.getByRole('button', { name: 'Ranking' }).click();
  await page.getByRole('button', { name: /Sair da conta/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible();
});

test('com balançada pendente, sair fica bloqueado', async ({ page, context }) => {
  await irPara(context, PONTO_A);
  await entrarNoJogo(page, 'pend', 'Pend');
  await context.setOffline(true);
  await expect(conexao(page)).toContainText('Sem rede');
  await balancar(page);
  await voltarAoRadar(page);
  await page.getByRole('button', { name: 'Ranking' }).click();
  await page.getByRole('button', { name: /Sair da conta/ }).click();
  const dialogo = page.getByRole('alertdialog');
  await expect(dialogo).toContainText('Sincronize antes de sair: 1 balançada não enviada');
  await expect(dialogo.getByRole('button', { name: 'Sair' })).toBeDisabled();
});
