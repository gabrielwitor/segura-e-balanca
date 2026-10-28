// RNF-14: todos os parâmetros ajustáveis do jogo moram aqui.

/** RF-17: depois disso o valor em cache vira "pontuação disponível". */
export const TTL_VALOR_MS = 15 * 60_000;

/** RF-11: faixas de temperatura, em metros. */
export const FAIXA_QUENTE_M = 50;
export const FAIXA_MORNO_M = 150;
/** Seção 7.3: histerese para a faixa não piscar na fronteira. */
export const HISTERESE_M = 10;
/** Janela da média móvel da tendência (seção 7.3). */
export const JANELA_TENDENCIA_MS = 10_000;
/** Variação mínima da média para dizer esquentando/esfriando. */
export const LIMIAR_TENDENCIA_M = 3;

/** RF-21: acima disso o GPS não é confiável para liberar a balançada. */
export const PRECISAO_MAX_M = 35;
export const RAIO_PADRAO_M = 25;

/** RF-22 / seção 7.4: gesto do balanço (referência: shake.js). */
export const BALANCO_LIMIAR_MS2 = 15;
/** Sacudidas exigidas por ponto: o admin configura em cada ponto (antes era fixo em 3). */
export const SACUDIDAS_PADRAO = 4;
export const SACUDIDAS_MIN = 2;
export const SACUDIDAS_MAX = 10;
export const BALANCO_JANELA_MS = 2500;
export const BALANCO_INTERVALO_MIN_MS = 120;
/** Ignora o tranco do próprio toque no botão: nada conta nos primeiros ms depois de armar. */
export const BALANCO_CARENCIA_MS = 300;

/** RNF-07: retentativa com espera exponencial. */
export const BACKOFF_BASE_MS = 2000;
export const BACKOFF_MAX_MS = 60_000;
export const BACKOFF_JITTER = 0.2;

/** RNF-08 / seção 6.1: heartbeat. */
export const HEARTBEAT_INTERVALO_MS = 60_000;
export const HEARTBEAT_TIMEOUT_MS = 5000;
/** Com o servidor indisponível, verifica mais vezes para perceber a volta (ainda só com o app visível). */
export const HEARTBEAT_RECUPERACAO_MS = 10_000;
/** Seção 6.2: timeout de cada envio. */
export const ENVIO_TIMEOUT_MS = 8000;

/** Seção 7.2: divergência entre âncora e relógio corrigido que invalida a âncora. */
export const DIVERGENCIA_ANCORA_MS = 2000;

/** RF-06 / RF-58: retenção da localização. */
export const RETENCAO_LOCALIZACAO_MS = 30 * 24 * 60 * 60_000;

/** RF-13: fração do valor-base que define o nível do blip. */
export const NIVEL_ALTO = 0.7;
export const NIVEL_MEDIO = 0.4;
