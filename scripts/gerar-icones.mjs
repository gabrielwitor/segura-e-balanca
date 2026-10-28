// Gera os ícones PNG do manifest a partir de public/icone.svg (rodar quando o ícone mudar):
//   node scripts/gerar-icones.mjs
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync('public/icone.svg', 'utf8');
// Sem cantos arredondados: o Android (maskable) e o iOS recortam o ícone com a máscara deles.
const cheio = svg.replace(/ rx="\d+"/, '');

const SAIDAS = [
  { arquivo: 'public/icone-192.png', tam: 192, svg },
  { arquivo: 'public/icone-512.png', tam: 512, svg },
  { arquivo: 'public/icone-maskable-512.png', tam: 512, svg: cheio },
  { arquivo: 'public/apple-touch-icon.png', tam: 180, svg: cheio },
];

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
for (const { arquivo, tam, svg: s } of SAIDAS) {
  await pagina.setViewportSize({ width: tam, height: tam });
  await pagina.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${tam}px;height:${tam}px}</style>${s}`);
  await pagina.screenshot({ path: arquivo, omitBackground: true });
}
await navegador.close();
