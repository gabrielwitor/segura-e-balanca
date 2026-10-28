import { expect, test } from '@playwright/test';
import { PONTO_A, entrarNoJogo, irPara, sacudir, semear } from './apoio';

test.beforeEach(async ({ context }) => {
  await semear();
  await irPara(context, PONTO_A);
});

test('dicas em tela cheia levam ao treino, e balançar no treino libera o jogo', async ({ page }) => {
  await entrarNoJogo(page, 'novo', 'Novo', { dicas: 'manter' });
  await expect(page.getByRole('heading', { name: 'Siga a temperatura' })).toBeVisible();
  await page.getByRole('button', { name: 'Próxima' }).click();
  await expect(page.getByRole('heading', { name: 'Escolha um ponto' })).toBeVisible();
  await page.getByRole('button', { name: 'Próxima' }).click();
  await expect(page.getByRole('heading', { name: 'Segure e balance' })).toBeVisible();
  await page.getByRole('button', { name: 'Experimentar' }).click();

  const treino = page.getByTestId('treino');
  await expect(treino).toContainText('Sua vez');
  const botao = page.getByTestId('treinar');

  // Soltar antes de completar ensina a segurar até o fim.
  await botao.dispatchEvent('pointerdown');
  await sacudir(page, 2);
  await botao.dispatchEvent('pointerup');
  await expect(treino).toContainText('Soltou cedo');

  await botao.dispatchEvent('pointerdown');
  await sacudir(page);
  await expect(page.getByRole('heading', { name: 'Pegou o jeito!' })).toBeVisible();
  await page.getByRole('button', { name: 'Começar a jogar' }).click();
  await expect(page.getByTestId('temperatura')).toBeVisible();

  // Não aparece de novo.
  await page.reload();
  await expect(page.getByTestId('temperatura')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Experimentar' })).toHaveCount(0);
});

test('sem sensor de movimento, o treino não prende', async ({ page }) => {
  await entrarNoJogo(page, 'semsensor', 'Sem Sensor', { dicas: 'manter' });
  for (const passo of ['Próxima', 'Próxima', 'Experimentar']) await page.getByRole('button', { name: passo }).click();
  // Segura e nada chega do acelerômetro.
  await page.getByTestId('treinar').dispatchEvent('pointerdown');
  await expect(page.getByRole('heading', { name: 'Sem sensor de movimento' })).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: 'Pular treino' }).click();
  await expect(page.getByTestId('temperatura')).toBeVisible();
});
