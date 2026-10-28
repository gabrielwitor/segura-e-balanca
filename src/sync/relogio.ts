import { ancoraDivergente, calcularAncora, horarioAncorado, type Ancora } from '@/dominio/tempo';
import type { FonteHorario } from '@/dominio/tipos';
import type { BancoLocal } from './db';
import type { Remoto } from './remoto';

/**
 * Seção 7.2: a âncora vive só na memória (performance.now() zera a cada recarga);
 * o desvio fica no IndexedDB para o relógio corrigido funcionar offline depois de reabrir.
 */
export class RelogioAncorado {
  private ancora: Ancora | null = null;
  private desvio = 0;

  constructor(
    private readonly db: BancoLocal,
    private readonly perf: () => number = () => performance.now(),
    private readonly agora: () => number = Date.now,
  ) {}

  async carregar(): Promise<void> {
    this.desvio = (await this.db.relogio.get('desvio'))?.desvio ?? 0;
  }

  /** Na entrada da partida e a cada reconexão. */
  async ancorar(remoto: Remoto, uid: string): Promise<void> {
    const t0 = this.perf();
    const servidor = await remoto.horaDoServidor(uid);
    const t1 = this.perf();
    const { ancora, desvio } = calcularAncora(servidor, t0, t1, this.agora());
    this.ancora = ancora;
    this.desvio = desvio;
    await this.db.relogio.put({ id: 'desvio', desvio, ancoradoEm: ancora.servidor });
  }

  /** Ao voltar de visibilitychange: se o aparelho dormiu, a âncora não serve mais. */
  conferir(): void {
    if (this.ancora && ancoraDivergente(this.ancora, this.desvio, this.perf(), this.agora())) this.ancora = null;
  }

  agoraNoServidor(): { t: number; fonte: FonteHorario } {
    return horarioAncorado(this.ancora, this.desvio, this.perf(), this.agora());
  }

  get ancorado(): boolean {
    return this.ancora != null;
  }
}
