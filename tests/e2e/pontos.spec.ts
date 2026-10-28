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

  await escolherPonto(page, 2);
  await expect(cartao).toContainText('Ponto 2');
  await expect(cartao).toContainText('Dica do ponto 2');
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
