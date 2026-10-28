/**
 * RF-23: feedback de som e vibração. Os sons são sintetizados aqui (Web Audio), sem arquivos:
 * não pesam no cache offline. Vibração é aditiva; o visual sempre basta sozinho.
 * O iOS não vibra pela web (sem Vibration API): lá o feedback é só som e visual.
 */

// ---------- Preferências (por aparelho)

const CHAVE = 'seb:feedback';
/** noSilencioso: no iPhone, toca mesmo com a chave de silencioso (mas pausa a música de outros apps). */
type Prefs = { som: boolean; vibracao: boolean; noSilencioso: boolean };
// O som é o feedback principal (o iPhone não vibra): por padrão toca mesmo no modo silencioso.
const PADRAO: Prefs = { som: true, vibracao: true, noSilencioso: true };

function lerPrefs(): Prefs {
  try {
    return { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) ?? '{}') };
  } catch {
    return { ...PADRAO };
  }
}

let prefs = lerPrefs();
const ouvintes = new Set<() => void>();

export const preferencias = {
  atual: () => prefs,
  definir(p: Partial<Prefs>) {
    prefs = { ...prefs, ...p };
    aplicarSessaoDeAudio();
    try {
      localStorage.setItem(CHAVE, JSON.stringify(prefs));
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
    ouvintes.forEach((cb) => cb());
  },
  inscrever(cb: () => void) {
    ouvintes.add(cb);
    return () => ouvintes.delete(cb);
  },
};

// ---------- Áudio

let audio: AudioContext | null = null;
let saidaGeral: AudioNode | null = null;

/** Compressor na saída: permite volume alto no alto-falante do celular sem distorcer. */
function saida(ctx: AudioContext): AudioNode {
  if (!saidaGeral) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 6;
    comp.ratio.value = 8;
    comp.attack.value = 0.002;
    comp.release.value = 0.12;
    comp.connect(ctx.destination);
    saidaGeral = comp;
  }
  return saidaGeral;
}

/**
 * Safari 16.4+: "ambient" respeita a chave de silencioso e mistura com a música de outros apps;
 * "playback" toca mesmo no silencioso, mas pausa a música (ajuste "Tocar no modo silencioso").
 */
function aplicarSessaoDeAudio(): void {
  const sessao = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (sessao) sessao.type = prefs.noSilencioso ? 'playback' : 'ambient';
}

/** Precisa rodar dentro de um gesto (iOS). */
export function destravarSom(): void {
  try {
    aplicarSessaoDeAudio();
    audio ??= new AudioContext();
    if (audio.state !== 'running') {
      void audio.resume();
      // O iOS só considera o áudio liberado depois de tocar algo dentro do gesto: 1 amostra muda.
      const mudo = audio.createBufferSource();
      mudo.buffer = audio.createBuffer(1, 1, 22050);
      mudo.connect(audio.destination);
      mudo.start(0);
    }
  } catch {
    audio = null;
  }
}

/**
 * Destrava o áudio no primeiro toque em qualquer lugar do app (não só no botão de balançar):
 * sem isso, quem reabre o app direto no radar não ouve o esquentou/esfriou nem o bipe.
 */
export function destravarNoPrimeiroToque(): void {
  const eventos = ['pointerdown', 'touchend', 'keydown'] as const;
  const tentar = () => {
    destravarSom();
    if (audio?.state === 'running') eventos.forEach((e) => document.removeEventListener(e, tentar, true));
  };
  eventos.forEach((e) => document.addEventListener(e, tentar, true));
}

export interface Diagnostico {
  som: 'ativo' | 'aguardando-toque' | 'sem-suporte';
}

export const vibracaoSuportada = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export function diagnostico(): Diagnostico {
  const som = typeof AudioContext === 'undefined' ? 'sem-suporte' : audio?.state === 'running' ? 'ativo' : 'aguardando-toque';
  return { som };
}

/**
 * Nota curta e brilhante, feita para alto-falante de celular (que reproduz mal abaixo de ~800 Hz):
 * triângulo + harmônicos, ataque rápido, decaimento de sino.
 */
function nota(freq: number, quando: number, dur = 0.35, volume = 0.7): void {
  if (!audio) return;
  const t = audio.currentTime + quando;
  const env = audio.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(volume, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  env.connect(saida(audio));
  for (const [mult, ganho, tipo] of [
    [1, 1, 'triangle'],
    [2, 0.35, 'sine'],
    [3, 0.15, 'sine'],
  ] as const) {
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = tipo;
    osc.frequency.value = freq * mult;
    g.gain.value = ganho;
    osc.connect(g).connect(env);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
}

/** Ruído filtrado subindo: o "whoosh" do envio. */
function whoosh(): void {
  if (!audio) return;
  const dur = 0.45;
  const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * dur), audio.sampleRate);
  const dados = buffer.getChannelData(0);
  for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
  const fonte = audio.createBufferSource();
  fonte.buffer = buffer;
  const filtro = audio.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.Q.value = 1.2;
  const t = audio.currentTime;
  filtro.frequency.setValueAtTime(400, t);
  filtro.frequency.exponentialRampToValueAtTime(3200, t + dur);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  fonte.connect(filtro).connect(g).connect(saida(audio));
  fonte.start(t);
}

// Uma oitava acima do usual: 1–2 kHz é onde alto-falante de celular rende.
const DO5 = 1046.5, MI5 = 1318.5, SOL5 = 1568, DO6 = 2093, MI6 = 2637, SOL6 = 3136;
/** Pentatônica de Dó para as sacudidas: sobe uma nota por sacudida, até 10. */
const ESCALA = [DO5, 1174.7, MI5, SOL5, 1760, DO6, 2349.3, MI6, SOL6, 3520];

function tocar(f: () => void): void {
  if (prefs.som) f();
}

// ---------- Vibração

/** Android (Vibration API). No iPhone não existe: não faz nada. */
function vibrar(padrao: number | number[]): void {
  if (prefs.vibracao && typeof navigator.vibrate === 'function') navigator.vibrate(padrao);
}

// ---------- Momentos do jogo

export const feedback = {
  /** Bipe do radar no quente (tipo detector de metal). */
  tickRadar() {
    tocar(() => nota(SOL5, 0, 0.07, 0.35));
    vibrar(40);
  },
  esquentou() {
    tocar(() => {
      nota(DO5, 0, 0.25, 0.55);
      nota(MI5, 0.1, 0.3, 0.55);
    });
    vibrar([70, 50, 70]);
  },
  esfriou() {
    tocar(() => {
      nota(MI5, 0, 0.25, 0.55);
      nota(DO5, 0.1, 0.3, 0.55);
    });
    vibrar(90);
  },
  entrouNaArea() {
    tocar(() => {
      nota(DO5, 0, 0.5);
      nota(MI5, 0.06, 0.5);
      nota(SOL5, 0.12, 0.6);
    });
    vibrar([150, 80, 150]);
  },
  /** Cada sacudida que conta: a nota sobe uma escala (pentatônica) a cada uma. */
  pico(n: number) {
    tocar(() => nota(ESCALA[Math.min(n, ESCALA.length) - 1] ?? DO5, 0, 0.22));
    vibrar(80);
  },
  balancou() {
    tocar(() => [DO5, MI5, SOL5, DO6].forEach((f, i) => nota(f, i * 0.08, 0.4)));
    vibrar([200, 100, 300]);
  },
  primeiroLugar() {
    tocar(() => {
      [SOL5, DO6, MI6].forEach((f, i) => nota(f, i * 0.1, 0.35));
      [DO6, MI6, SOL6].forEach((f) => nota(f, 0.34, 0.9, 0.5));
    });
    vibrar([150, 80, 150, 80, 450]);
  },
  guardado() {
    tocar(() => {
      nota(SOL5, 0, 0.3, 0.55);
      nota(MI5, 0.12, 0.4, 0.55);
    });
    vibrar(150);
  },
  naoContou() {
    tocar(() => nota(392, 0, 0.45, 0.5));
  },
  sincronizou() {
    tocar(whoosh);
  },
  balancoFraco() {
    vibrar([100, 60, 100]);
  },
  /** Ao começar a segurar o botão (Android). */
  armou() {
    vibrar(60);
  },
  /** Botão "Testar" dos ajustes: som e vibração dentro do mesmo toque. */
  testar() {
    destravarSom();
    tocar(() => [DO5, MI5, SOL5, DO6].forEach((f, i) => nota(f, i * 0.08, 0.4)));
    vibrar([200, 100, 300]);
  },
};
