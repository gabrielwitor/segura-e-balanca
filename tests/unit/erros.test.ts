import { describe, expect, it } from 'vitest';
import { traduzirErro } from '@/firebase/erros';

describe('tradução de erros do Firestore', () => {
  it('usa o code, sem depender de instanceof', () => {
    const e = Object.assign(new Error('PERMISSION_DENIED: x'), { code: 'permission-denied' });
    expect(traduzirErro(e).codigo).toBe('permission-denied');
    expect(traduzirErro({ code: 'unavailable' }).codigo).toBe('unavailable');
    expect(traduzirErro({ code: 'deadline-exceeded' }).codigo).toBe('timeout');
    expect(traduzirErro(new Error('x')).codigo).toBe('outro');
  });
});
