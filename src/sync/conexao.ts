import { HEARTBEAT_INTERVALO_MS, HEARTBEAT_RECUPERACAO_MS, HEARTBEAT_TIMEOUT_MS } from '@/dominio/constantes';
import type { EstadoConexao } from '@/dominio/tipos';
import { comTimeout, type PortaDeConexao } from './saida';

export interface AmbienteDeConexao {
  online(): boolean;
  visivel(): boolean;
  aoMudarRede(cb: () => void): () => void;
  aoMudarVisibilidade(cb: () => void): () => void;
}

export const ambienteDoNavegador: AmbienteDeConexao = {
  online: () => navigator.onLine,
  visivel: () => document.visibilityState === 'visible',
  aoMudarRede(cb) {
    window.addEventListener('online', cb);
    window.addEventListener('offline', cb);
    return () => {
      window.removeEventListener('online', cb);
      window.removeEventListener('offline', cb);
    };
  },
  aoMudarVisibilidade(cb) {
    document.addEventListener('visibilitychange', cb);
    return () => document.removeEventListener('visibilitychange', cb);
  },
};

/**
 * Seção 6.1: navigator.onLine só diz se há rede. O heartbeat diz se o servidor responde.
 * Online → Sem rede | Servidor indisponível.
 */
export class MonitorDeConexao implements PortaDeConexao {
  private atual: EstadoConexao;
  private ouvintes = new Set<(e: EstadoConexao) => void>();
  private aoVoltar = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private cancelamentos: (() => void)[] = [];
  private emCurso: Promise<EstadoConexao> | null = null;

  constructor(
    private readonly heartbeatRemoto: () => Promise<void>,
    private readonly amb: AmbienteDeConexao = ambienteDoNavegador,
    private readonly intervaloMs = HEARTBEAT_INTERVALO_MS,
    private readonly timeoutMs = HEARTBEAT_TIMEOUT_MS,
    private readonly recuperacaoMs = HEARTBEAT_RECUPERACAO_MS,
  ) {
    // Começa otimista se há rede; o primeiro heartbeat confirma.
    this.atual = amb.online() ? 'online' : 'sem-rede';
  }

  iniciar(): void {
    this.cancelamentos.push(
      this.amb.aoMudarRede(() => {
        if (!this.amb.online()) this.definir('sem-rede');
        else void this.heartbeat();
      }),
      this.amb.aoMudarVisibilidade(() => {
        if (this.amb.visivel()) {
          void this.heartbeat();
          this.ligarTimer();
        } else this.desligarTimer(); // RNF-10: nada de heartbeat com a aba escondida
      }),
    );
    if (this.amb.visivel()) this.ligarTimer();
    void this.heartbeat();
  }

  parar(): void {
    this.desligarTimer();
    this.cancelamentos.forEach((c) => c());
    this.cancelamentos = [];
  }

  estado(): EstadoConexao {
    return this.atual;
  }

  inscrever(cb: (e: EstadoConexao) => void): () => void {
    this.ouvintes.add(cb);
    return () => this.ouvintes.delete(cb);
  }

  /** Chamado a cada transição para Online (gatilho do sync e da reancoragem). */
  aoReconectar(cb: () => void): () => void {
    this.aoVoltar.add(cb);
    return () => this.aoVoltar.delete(cb);
  }

  marcarServidorIndisponivel(): void {
    if (!this.amb.online()) this.definir('sem-rede');
    else this.definir('servidor-indisponivel');
  }

  marcarServidorRespondendo(): void {
    if (this.amb.online()) this.definir('online');
  }

  heartbeat(): Promise<EstadoConexao> {
    if (!this.amb.online()) {
      this.definir('sem-rede');
      return Promise.resolve(this.atual);
    }
    // Quem chama durante um heartbeat em curso espera o mesmo resultado.
    this.emCurso ??= comTimeout(this.timeoutMs, this.heartbeatRemoto())
      .then(
        () => this.marcarServidorRespondendo(),
        () => this.marcarServidorIndisponivel(),
      )
      .then(() => {
        this.emCurso = null;
        return this.atual;
      });
    return this.emCurso;
  }

  private definir(novo: EstadoConexao): void {
    if (novo === this.atual) return;
    this.atual = novo;
    // O ritmo do heartbeat depende do estado: religa o timer se ele estava ligado.
    if (this.timer) {
      this.desligarTimer();
      this.ligarTimer();
    }
    this.ouvintes.forEach((cb) => cb(novo));
    if (novo === 'online') this.aoVoltar.forEach((cb) => cb());
  }

  private ligarTimer(): void {
    if (this.timer) return;
    const ms = this.atual === 'servidor-indisponivel' ? this.recuperacaoMs : this.intervaloMs;
    this.timer = setInterval(() => void this.heartbeat(), ms);
  }

  private desligarTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
