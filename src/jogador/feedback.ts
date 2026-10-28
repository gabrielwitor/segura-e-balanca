let audio: AudioContext | null = null;

/** RF-23: som curto. Precisa ter sido "destravado" num gesto (iOS). */
export function destravarSom(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

export function tocarSucesso(): void {
  if (!audio) return;
  const t = audio.currentTime;
  for (const [i, f] of [660, 880, 1320].entries()) {
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = 'triangle';
    osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.09);
    g.gain.exponentialRampToValueAtTime(0.3, t + i * 0.09 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.18);
    osc.connect(g).connect(audio.destination);
    osc.start(t + i * 0.09);
    osc.stop(t + i * 0.09 + 0.2);
  }
}

/**
 * RF-23: vibração é aditiva. Android: Vibration API. iOS (Safari ≥ 17.4): alternar um
 * <input type="checkbox" switch> dá um toque háptico — truque não documentado (seção 9.2).
 */
export function vibrar(): void {
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate([80, 60, 160]);
    return;
  }
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
    /* o visual basta sozinho */
  }
}
