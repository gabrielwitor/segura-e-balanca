import { expect, test } from '@playwright/test';
import { PONTO_A, entrarNoJogo, escolherPonto, irPara, semear } from './apoio';

test.beforeEach(async () => {
  await semear();
});

test('aba Pontos: escolher põe o ponto na bússola; voltar ao mais perto desfaz', async ({ page, context }) => {
  await irPara(context, { lat: PONTO_A.lat + 0.0009, lng: PONTO_A.lng }); // ~100 m do 1, mais longe do 2
  await entrarNoJogo(page, 'lia', 'Lia');
  const cartao = page.getByRole('region', { name: 'Ponto na bússola' });
  await expect(cartao).toContainText('Ponto 1');
  await expect(cartao).toContainText('vale 100 pts');

  // Ponto 1 a ~100 m: dentro do alcance do mostrador (bola), sem borda acesa.
  await expect(page.getByTestId('borda-acesa')).toHaveCount(0);

  await escolherPonto(page, 2);
  await expect(cartao).toContainText('Ponto 2');
  // Ponto 2 a ~270 m: além dos 150 m do mostrador, a borda acende na direção dele.
  await expect(page.getByTestId('borda-acesa')).toBeVisible();
  await cartao.getByRole('button', { name: /Voltar ao/ }).click();
  await expect(cartao).toContainText('Ponto 1');

  // "Trocar" leva para a lista, com o ponto da bússola marcado.
  await cartao.getByRole('button', { name: /Trocar/ }).click();
  const lista = page.getByTestId('lista-pontos');
  await expect(lista.getByRole('button', { name: /^Ponto 1\b/ })).toHaveAttribute('aria-current', 'true');
  await expect(lista.getByRole('button').first()).toContainText('Ponto 1');
  await page.getByRole('button', { name: 'Vale mais' }).click();
  await expect(page.getByRole('button', { name: 'Vale mais' })).toHaveAttribute('aria-pressed', 'true');
});
