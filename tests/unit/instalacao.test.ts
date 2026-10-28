import { describe, expect, it } from 'vitest';
import { plataforma } from '@/jogador/instalacao';

describe('plataforma (instalação da PWA)', () => {
  it('reconhece iPhone, Android e navegadores de app', () => {
    expect(plataforma('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1')).toBe('iphone');
    expect(plataforma('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36')).toBe('android');
    expect(plataforma('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 330.0')).toBe('navegador-de-app');
    expect(plataforma('Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/126.0 Mobile Safari/537.36')).toBe('navegador-de-app');
    expect(plataforma('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) [FBAN/FBIOS;FBAV/450.0]')).toBe('navegador-de-app');
  });
});
