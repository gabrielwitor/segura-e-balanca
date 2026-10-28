import { APELIDO_MAX, APELIDO_MIN } from './constantes';

/** RF-02: comparação sem acento, caixa e espaços extras. Também é o id em `apelidos/`. */
export function normalizarApelido(apelido: string): string {
  return apelido
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function limparApelido(apelido: string): string {
  return apelido.replace(/\s+/g, ' ').trim();
}

/** Devolve a mensagem de erro, ou null se o apelido serve. */
export function validarApelido(apelido: string): string | null {
  const a = limparApelido(apelido);
  if (a.length < APELIDO_MIN) return `Use pelo menos ${APELIDO_MIN} caracteres.`;
  if (a.length > APELIDO_MAX) return `Use no máximo ${APELIDO_MAX} caracteres.`;
  if (!/^[\p{L}\p{N} .'_-]+$/u.test(a)) return 'Use só letras, números, espaço, ponto, hífen ou sublinhado.';
  return null;
}

/** Sugestão: primeiro nome do Google. */
export function sugerirApelido(nomeGoogle: string | null | undefined): string {
  const primeiro = (nomeGoogle ?? '').trim().split(/\s+/)[0] ?? '';
  return primeiro.slice(0, APELIDO_MAX);
}
