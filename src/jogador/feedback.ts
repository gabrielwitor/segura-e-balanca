/**
 * RF-23: feedback de som e vibração. Os sons são sintetizados aqui (Web Audio), sem arquivos:
 * não pesam no cache offline. Vibração é aditiva; o visual sempre basta sozinho.
 */

// ---------- Preferências (por aparelho)

const CHAVE = 'seb:feedback';
type Prefs = { som: boolean; vibracao: boolean };

function lerPrefs(): Prefs {
  try {
    return { som: true, vibracao: true, ...JSON.parse(localStorage.getItem(CHAVE) ?? '{}') };
  } catch {
    return { som: true, vibracao: true };
  }
}

let prefs = lerPrefs();
const ouvintes = new Set<() => void>();

export const preferencias = {
  atual: () => prefs,
  definir(p: Partial<Prefs>) {
    prefs = { ...prefs, ...p };
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

/** Precisa rodar dentro de um gesto (iOS). Respeita o modo silencioso do iPhone (Safari 16.4+). */
export function destravarSom(): void {
  try {
    const sessao = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (sessao) sessao.type = 'ambient';
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

/** Nota com timbre de marimba: ataque curto, decaimento rápido, um harmônico suave. */
function nota(freq: number, quando: number, dur = 0.35, volume = 0.22): void {
  if (!audio) return;
  const t = audio.currentTime + quando;
  const saida = audio.createGain();
  saida.gain.setValueAtTime(0.0001, t);
  saida.gain.exponentialRampToValueAtTime(volume, t + 0.008);
  saida.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  saida.connect(audio.destination);
  for (const [mult, ganho, tipo] of [
    [1, 1, 'sine'],
    [4, 0.12, 'sine'],
    [2, 0.08, 'triangle'],
  ] as const) {
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = tipo;
    osc.frequency.value = freq * mult;
    g.gain.value = ganho;
    osc.connect(g).connect(saida);
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
  g.gain.exponentialRampToValueAtTime(0.08, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  fonte.connect(filtro).connect(g).connect(audio.destination);
  fonte.start(t);
}

const DO5 = 523.25, MI5 = 659.25, SOL5 = 783.99, DO6 = 1046.5, MI6 = 1318.5, SOL6 = 1568;

function tocar(f: () => void): void {
  if (prefs.som) f();
}

// ---------- Vibração

let ultimoToqueIos = 0;

function vibrar(padrao: number | number[]): void {
  if (!prefs.vibracao) return;
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(padrao);
    return;
  }
  // iOS ≥ 17.4: alternar um <input switch> dá um toque háptico (não documentado; seção 9.2).
  const agora = performance.now();
  if (agora - ultimoToqueIos < 80) return;
  ultimoToqueIos = agora;
  try {
    const label = document.createElement('label');
    label.ariaHidden = 'true';
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.body.appendChild(label);
    label.click();
    label.remove();
  } catch {
    /* o visual basta */
  }
}

// ---------- Momentos do jogo

export const feedback = {
  /** Bipe do radar no quente (tipo detector de metal). */
  tickRadar() {
    tocar(() => nota(SOL6, 0, 0.08, 0.07));
    vibrar(12);
  },
  esquentou() {
    tocar(() => {
      nota(DO5, 0, 0.25, 0.15);
      nota(MI5, 0.1, 0.3, 0.15);
    });
    vibrar(20);
  },
  esfriou() {
    tocar(() => {
      nota(MI5, 0, 0.25, 0.12);
      nota(DO5, 0.1, 0.3, 0.12);
    });
    vibrar(20);
  },
  entrouNaArea() {
    tocar(() => {
      nota(DO5, 0, 0.5);
      nota(MI5, 0.06, 0.5);
      nota(SOL5, 0.12, 0.6);
    });
    vibrar([40, 60, 40]);
  },
  /** Cada sacudida que conta: uma nota subindo (1, 2, 3). */
  pico(n: number) {
    tocar(() => nota([DO5, MI5, SOL5][Math.min(n, 3) - 1] ?? DO5, 0, 0.22));
    vibrar(30);
  },
  balancou() {
    tocar(() => [DO5, MI5, SOL5, DO6].forEach((f, i) => nota(f, i * 0.08, 0.4)));
    vibrar([80, 60, 160]);
  },
  primeiroLugar() {
    tocar(() => {
      [SOL5, DO6, MI6].forEach((f, i) => nota(f, i * 0.1, 0.35));
      [DO6, MI6, SOL6].forEach((f) => nota(f, 0.34, 0.9, 0.16));
    });
    vibrar([60, 40, 60, 40, 220]);
  },
  guardado() {
    tocar(() => {
      nota(SOL5, 0, 0.3, 0.14);
      nota(MI5, 0.12, 0.4, 0.14);
    });
    vibrar(60);
  },
  naoContou() {
    tocar(() => nota(196, 0, 0.45, 0.16));
  },
  sincronizou() {
    tocar(whoosh);
  },
  balancoFraco() {
    vibrar([30, 40, 30]);
  },
};
