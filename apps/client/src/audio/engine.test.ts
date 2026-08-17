/**
 * Test de bout en bout du moteur audio contre un `AudioContext` simulé.
 *
 * Vitest tourne sous Node : il n'y a pas de WebAudio. On en fabrique donc une
 * imitation fidèle sur les points qui comptent, et surtout **sévère** là où le
 * vrai WebAudio l'est :
 *
 *  - `exponentialRampToValueAtTime(0)` lève une exception dans les navigateurs.
 *    C'est l'erreur classique du son généré, et elle produit exactement le
 *    défaut qu'on veut éviter : une note qui coupe net.
 *  - un instant de planification négatif ou non fini lève également.
 *  - `stop()` avant `start()` lève.
 *
 * Le test exerce donc tous les timbres, tous les effets, toutes les ambiances
 * et plusieurs minutes de composition en temps accéléré, et vérifie qu'aucune
 * de ces fautes n'est commise.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/* Imitation de WebAudio                                               */
/* ------------------------------------------------------------------ */

interface Violation {
  kind: string;
  detail: string;
}

const violations: Violation[] = [];

function fail(kind: string, detail: string): void {
  violations.push({ kind, detail });
}

class FakeParam {
  value = 0;
  constructor(private readonly label: string, initial = 0) {
    this.value = initial;
  }
  private check(time: number, where: string): void {
    if (!Number.isFinite(time) || time < 0) {
      fail('temps invalide', `${this.label}.${where}(t=${time})`);
    }
  }
  setValueAtTime(v: number, t: number): FakeParam {
    this.check(t, 'setValueAtTime');
    if (!Number.isFinite(v)) fail('valeur invalide', `${this.label}.setValueAtTime(${v})`);
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): FakeParam {
    this.check(t, 'linearRampToValueAtTime');
    if (!Number.isFinite(v)) fail('valeur invalide', `${this.label}.linearRamp(${v})`);
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): FakeParam {
    this.check(t, 'exponentialRampToValueAtTime');
    // Le point critique : zéro est interdit par la spécification.
    if (!(v > 0)) fail('rampe exponentielle vers zéro', `${this.label}.exponentialRamp(${v})`);
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number, t: number): FakeParam {
    this.check(t, 'setTargetAtTime');
    this.value = v;
    return this;
  }
  cancelScheduledValues(t: number): FakeParam {
    this.check(t, 'cancelScheduledValues');
    return this;
  }
}

class FakeNode {
  readonly outputs: (FakeNode | FakeParam)[] = [];
  connected = 0;
  constructor(readonly kind: string) {}
  connect<T extends FakeNode | FakeParam>(target: T): T {
    if (!target) fail('connexion nulle', this.kind);
    this.outputs.push(target);
    this.connected += 1;
    return target;
  }
  disconnect(): void {
    this.outputs.length = 0;
  }
}

class FakeSource extends FakeNode {
  started = false;
  stopped = false;
  constructor(kind: string, private readonly clock: () => number) {
    super(kind);
  }
  start(when = 0, offset = 0): void {
    if (this.started) fail('double démarrage', this.kind);
    if (!Number.isFinite(when) || when < 0) fail('démarrage invalide', `${this.kind} t=${when}`);
    if (!Number.isFinite(offset) || offset < 0) fail('décalage invalide', `${this.kind} ${offset}`);
    this.started = true;
  }
  // Un `stop()` sans argument, ou dans le passé, est légal : la spécification
  // arrête alors la source immédiatement. Seules les valeurs impossibles lèvent.
  stop(when = 0): void {
    if (!this.started) fail('arrêt avant démarrage', this.kind);
    if (!Number.isFinite(when) || when < 0) fail('arrêt invalide', `${this.kind} t=${when}`);
    this.stopped = true;
  }
}

class FakeOscillator extends FakeSource {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeParam('oscillator.frequency', 440);
  readonly detune = new FakeParam('oscillator.detune', 0);
  setPeriodicWave(wave: unknown): void {
    if (!wave) fail('onde périodique nulle', 'oscillator');
  }
}

class FakeBufferSource extends FakeSource {
  buffer: FakeBuffer | null = null;
  loop = false;
  readonly playbackRate = new FakeParam('bufferSource.playbackRate', 1);
  override start(when = 0, offset = 0): void {
    if (!this.buffer) fail('source sans tampon', 'bufferSource');
    super.start(when, offset);
  }
}

class FakeBuffer {
  private readonly data: Float32Array[];
  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(i: number): Float32Array {
    const channel = this.data[i];
    if (!channel) throw new Error(`canal ${i} inexistant`);
    return channel;
  }
}

class FakeBiquad extends FakeNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeParam('biquad.frequency', 350);
  readonly Q = new FakeParam('biquad.Q', 1);
  readonly gain = new FakeParam('biquad.gain', 0);
  readonly detune = new FakeParam('biquad.detune', 0);
}

class FakeContext {
  currentTime = 0;
  readonly sampleRate = 48000;
  state: AudioContextState = 'suspended';
  readonly destination = new FakeNode('destination');
  createdNodes = 0;

  private track<T extends FakeNode>(node: T): T {
    this.createdNodes += 1;
    return node;
  }
  createGain(): FakeNode & { gain: FakeParam } {
    const n = this.track(new FakeNode('gain')) as FakeNode & { gain: FakeParam };
    n.gain = new FakeParam('gain.gain', 1);
    return n;
  }
  createOscillator(): FakeOscillator {
    return this.track(new FakeOscillator('oscillator', () => this.currentTime));
  }
  createBufferSource(): FakeBufferSource {
    return this.track(new FakeBufferSource('bufferSource', () => this.currentTime));
  }
  createBiquadFilter(): FakeBiquad {
    return this.track(new FakeBiquad('biquad'));
  }
  createStereoPanner(): FakeNode & { pan: FakeParam } {
    const n = this.track(new FakeNode('panner')) as FakeNode & { pan: FakeParam };
    n.pan = new FakeParam('panner.pan', 0);
    return n;
  }
  createDelay(max = 1): FakeNode & { delayTime: FakeParam } {
    const n = this.track(new FakeNode('delay')) as FakeNode & { delayTime: FakeParam };
    n.delayTime = new FakeParam('delay.delayTime', 0);
    if (!(max > 0)) fail('retard maximal invalide', `${max}`);
    return n;
  }
  createConvolver(): FakeNode & { buffer: FakeBuffer | null; normalize: boolean } {
    const n = this.track(new FakeNode('convolver')) as FakeNode & {
      buffer: FakeBuffer | null;
      normalize: boolean;
    };
    n.buffer = null;
    n.normalize = true;
    return n;
  }
  createDynamicsCompressor(): FakeNode & Record<string, FakeParam | string | number | (() => void)> {
    const n = this.track(new FakeNode('compressor')) as FakeNode &
      Record<string, FakeParam | string | number | (() => void)>;
    for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) {
      n[key] = new FakeParam(`compressor.${key}`, 0);
    }
    return n;
  }
  createBuffer(channels: number, length: number, rate: number): FakeBuffer {
    if (length <= 0) fail('tampon vide', `${length}`);
    return new FakeBuffer(channels, length, rate);
  }
  createPeriodicWave(real: Float32Array, imag: Float32Array): object {
    if (real.length !== imag.length) fail('onde périodique déséquilibrée', `${real.length}`);
    return { real, imag };
  }
  async resume(): Promise<void> {
    this.state = 'running';
  }
  async suspend(): Promise<void> {
    this.state = 'suspended';
  }
  async close(): Promise<void> {
    this.state = 'closed';
  }
  /** Avance l'horloge, comme le ferait la carte son. */
  advance(seconds: number): void {
    this.currentTime += seconds;
  }
}

/* ------------------------------------------------------------------ */
/* Installation                                                        */
/* ------------------------------------------------------------------ */

let ctx: FakeContext;

beforeEach(() => {
  violations.length = 0;
  ctx = new FakeContext();
  vi.useFakeTimers();
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = function AudioContextShim() {
    return ctx;
  } as unknown as typeof AudioContext;
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
});

function expectClean(): void {
  const summary = violations.map((v) => `${v.kind} — ${v.detail}`);
  expect(summary).toEqual([]);
}

/** Fait tourner l'horloge audio et les minuteurs de concert. */
function run(seconds: number, step = 0.05): void {
  const ticks = Math.round(seconds / step);
  for (let i = 0; i < ticks; i += 1) {
    ctx.advance(step);
    vi.advanceTimersByTime(step * 1000);
  }
}

/* ------------------------------------------------------------------ */

describe('graphe audio', () => {
  it('se construit avec compresseur, limiteur et réverbération par bus', async () => {
    const { createAudioGraph, DEFAULT_VOLUMES } = await import('./context.js');
    const graph = await createAudioGraph({ ...DEFAULT_VOLUMES });
    expect(graph).not.toBeNull();
    expect(graph?.limiter).toBeDefined();
    for (const bus of ['musique', 'effets', 'ambiance'] as const) {
      expect(graph?.dry[bus]).toBeDefined();
      expect(graph?.wet[bus]).toBeDefined();
      expect(graph?.volume[bus]).toBeDefined();
    }
    expectClean();
  });

  it('synthétise une réponse impulsionnelle stéréo normalisée et sans coupure', async () => {
    const { buildImpulseResponse } = await import('./context.js');
    const ir = buildImpulseResponse(ctx as unknown as BaseAudioContext, 1.2, 3) as unknown as FakeBuffer;
    expect(ir.numberOfChannels).toBe(2);
    const left = ir.getChannelData(0);
    let peak = 0;
    for (const v of left) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.2);
    expect(peak).toBeLessThanOrEqual(1);
    // Les deux extrémités sont fondues : aucun clic à l'entrée ni à la sortie.
    expect(Math.abs(left[0] as number)).toBeLessThan(1e-6);
    expect(Math.abs(left[left.length - 1] as number)).toBeLessThan(1e-6);
    // Les deux canaux sont décorrélés, sinon la réverbe est mono.
    const right = ir.getChannelData(1);
    let identical = 0;
    for (let i = 0; i < left.length; i += 97) if (left[i] === right[i]) identical += 1;
    expect(identical).toBeLessThan(left.length / 97 / 2);
  });

  it('convertit et mémorise les volumes', async () => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const { loadVolumes, saveVolumes, volumeToGain, STORAGE_KEY } = await import('./context.js');
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(100)).toBe(1);
    expect(volumeToGain(50)).toBeCloseTo(0.25, 6);
    saveVolumes({ musique: 10, effets: 20, ambiance: 30 });
    expect(store.has(STORAGE_KEY)).toBe(true);
    expect(loadVolumes()).toEqual({ musique: 10, effets: 20, ambiance: 30 });
    store.set(STORAGE_KEY, 'ceci n’est pas du JSON');
    expect(() => loadVolumes()).not.toThrow();
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  });
});

describe('lutherie', () => {
  it('joue les sept timbres sans faute de planification', async () => {
    const { createAudioGraph, DEFAULT_VOLUMES } = await import('./context.js');
    const { INSTRUMENT_NAMES, playNote, voiceBus } = await import('./instruments.js');
    const { midiToFreq } = await import('./theory.js');
    const graph = await createAudioGraph({ ...DEFAULT_VOLUMES });
    expect(graph).not.toBeNull();
    if (!graph) return;
    const bus = voiceBus(graph, 'musique');

    for (const instrument of INSTRUMENT_NAMES) {
      for (const midi of [36, 48, 60, 72, 84]) {
        for (const duration of [0.08, 0.4, 2.5]) {
          playNote(bus, instrument, {
            freq: midiToFreq(midi),
            time: graph.now() + 0.01,
            duration,
            velocity: 0.7,
            pan: -0.3,
            wet: 0.5,
            brightness: 0.5,
            seed: midi * 31 + duration * 7,
          });
        }
      }
    }
    expectClean();
  });

  it('tient et relâche un bourdon sans coupure', async () => {
    const { createAudioGraph, DEFAULT_VOLUMES } = await import('./context.js');
    const { startBourdon, voiceBus } = await import('./instruments.js');
    const graph = await createAudioGraph({ ...DEFAULT_VOLUMES });
    if (!graph) return;
    const drone = startBourdon(voiceBus(graph, 'musique'), { freq: 110, level: 0.6 });
    run(2);
    drone.setLevel(0.3);
    drone.setFreq(146.8);
    run(3);
    drone.stop(1200);
    run(2);
    // Un second arrêt ne doit rien casser.
    expect(() => drone.stop()).not.toThrow();
    expectClean();
  });

  it('met en cache les cordes pincées de Karplus-Strong', async () => {
    const { pluckBuffer } = await import('./instruments.js');
    const first = pluckBuffer(ctx as unknown as AudioContext, 220, 0.5, 1);
    const second = pluckBuffer(ctx as unknown as AudioContext, 220, 0.5, 1);
    expect(second).toBe(first);
    const data = (first as unknown as FakeBuffer).getChannelData(0);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.05);
    // La corde s'éteint : la fin du tampon est silencieuse.
    expect(Math.abs(data[data.length - 1] as number)).toBeLessThan(1e-6);
  });
});

describe('effets', () => {
  it('rend les dix-huit effets sans faute', async () => {
    const { createAudioGraph, DEFAULT_VOLUMES } = await import('./context.js');
    const { SfxPlayer, SFX_KEYS } = await import('./sfx.js');
    const graph = await createAudioGraph({ ...DEFAULT_VOLUMES });
    if (!graph) return;
    const player = new SfxPlayer(graph);
    for (const key of SFX_KEYS) {
      player.play(key);
      ctx.advance(0.05);
      vi.advanceTimersByTime(3000);
    }
    expectClean();
  });

  it('respecte le budget de douze voix simultanées', async () => {
    const { createAudioGraph, DEFAULT_VOLUMES } = await import('./context.js');
    const { SfxPlayer } = await import('./sfx.js');
    const graph = await createAudioGraph({ ...DEFAULT_VOLUMES });
    if (!graph) return;
    const player = new SfxPlayer(graph);
    // Cinquante déclenchements très rapprochés de clefs différentes.
    const keys = ['epee', 'impact', 'arc', 'mort', 'piece', 'pas_pierre'] as const;
    for (let i = 0; i < 50; i += 1) {
      ctx.advance(0.02);
      player.play(keys[i % keys.length] as (typeof keys)[number]);
    }
    expect(player.voices).toBeLessThanOrEqual(12);
    expectClean();
  });

  it('coûte moins d’une milliseconde par effet', async () => {
    // Horloge réelle : on mesure du temps de calcul, pas du temps simulé.
    vi.useRealTimers();
    const { createAudioGraph, DEFAULT_VOLUMES } = await import('./context.js');
    const { SfxPlayer, SFX_KEYS } = await import('./sfx.js');
    const graph = await createAudioGraph({ ...DEFAULT_VOLUMES });
    if (!graph) return;

    // Un lecteur neuf toutes les douze voix : sans cela le budget bloquerait
    // les appels suivants et la mesure ne porterait plus sur la synthèse.
    let player = new SfxPlayer(graph);
    const rounds = 240;
    const started = performance.now();
    for (let i = 0; i < rounds; i += 1) {
      if (i % 12 === 0) player = new SfxPlayer(graph);
      ctx.advance(0.03);
      player.play(SFX_KEYS[i % SFX_KEYS.length] as (typeof SFX_KEYS)[number]);
    }
    const perCall = (performance.now() - started) / rounds;
    expect(perCall).toBeLessThan(1);
    expectClean();
  });
});

describe('ambiances', () => {
  it('enchaîne les cinq nappes et le silence sans faute', async () => {
    const { createAudioGraph, DEFAULT_VOLUMES } = await import('./context.js');
    const { AmbienceController, AMBIENCE_KEYS } = await import('./ambience.js');
    const graph = await createAudioGraph({ ...DEFAULT_VOLUMES });
    if (!graph) return;
    const controller = new AmbienceController(graph);
    for (const key of AMBIENCE_KEYS) {
      controller.set(key, 600);
      expect(controller.key).toBe(key);
      run(4);
    }
    controller.suspend();
    run(2);
    controller.resume();
    run(2);
    controller.dispose();
    expectClean();
  });

  it('ignore une demande identique à la nappe en cours', async () => {
    const { createAudioGraph, DEFAULT_VOLUMES } = await import('./context.js');
    const { AmbienceController } = await import('./ambience.js');
    const graph = await createAudioGraph({ ...DEFAULT_VOLUMES });
    if (!graph) return;
    const controller = new AmbienceController(graph);
    controller.set('foret');
    const after = ctx.createdNodes;
    controller.set('foret');
    expect(ctx.createdNodes).toBe(after);
    controller.dispose();
  });
});

describe('compositeur', () => {
  it('joue les sept thèmes sur plusieurs sections sans faute', async () => {
    const { createAudioGraph, DEFAULT_VOLUMES } = await import('./context.js');
    const { Composer } = await import('./composer.js');
    const { THEME_KEYS } = await import('./themes.js');
    const graph = await createAudioGraph({ ...DEFAULT_VOLUMES });
    if (!graph) return;
    const composer = new Composer(graph);
    for (const key of THEME_KEYS) {
      composer.play(key, undefined, 400);
      expect(composer.current === key || composer.current === null).toBe(true);
      run(40, 0.1);
    }
    composer.stop(400);
    run(3);
    composer.dispose();
    expectClean();
  });

  it('applique la couleur de chacune des douze régions', async () => {
    const { createAudioGraph, DEFAULT_VOLUMES } = await import('./context.js');
    const { Composer } = await import('./composer.js');
    const { REGION_COLOURS } = await import('./themes.js');
    const graph = await createAudioGraph({ ...DEFAULT_VOLUMES });
    if (!graph) return;
    const composer = new Composer(graph);
    const regions = Object.keys(REGION_COLOURS) as (keyof typeof REGION_COLOURS)[];
    expect(regions).toHaveLength(12);
    composer.play('aventure', regions[0], 300);
    for (const region of regions) {
      composer.setRegion(region);
      run(14, 0.1);
    }
    composer.dispose();
    expectClean();
  });

  it('monte et redescend en intensité sans changer de thème', async () => {
    const { createAudioGraph, DEFAULT_VOLUMES } = await import('./context.js');
    const { Composer } = await import('./composer.js');
    const graph = await createAudioGraph({ ...DEFAULT_VOLUMES });
    if (!graph) return;
    const composer = new Composer(graph);
    composer.play('combat', 'chatellenie_cervieres', 300);
    for (const level of ['calme', 'tension', 'combat', 'tension', 'calme'] as const) {
      composer.setIntensity(level);
      expect(composer.intensityLevel).toBe(level);
      run(10, 0.1);
    }
    expect(composer.current).toBe('combat');
    composer.dispose();
    expectClean();
  });

  it('termine de lui-même un thème non bouclé', async () => {
    const { createAudioGraph, DEFAULT_VOLUMES } = await import('./context.js');
    const { Composer } = await import('./composer.js');
    const graph = await createAudioGraph({ ...DEFAULT_VOLUMES });
    if (!graph) return;
    const composer = new Composer(graph);
    composer.play('victoire', undefined, 300);
    run(120, 0.2);
    expect(composer.current).toBeNull();
    composer.dispose();
    expectClean();
  });

  it('enchaîne deux thèmes en fondu sans interruption', async () => {
    const { createAudioGraph, DEFAULT_VOLUMES } = await import('./context.js');
    const { Composer } = await import('./composer.js');
    const graph = await createAudioGraph({ ...DEFAULT_VOLUMES });
    if (!graph) return;
    const composer = new Composer(graph);
    composer.play('aventure', 'vallee_durolle', 400);
    run(12, 0.1);
    composer.play('combat', undefined, 400);
    expect(composer.current).toBe('combat');
    run(12, 0.1);
    composer.play('aventure', 'coeur_bois_noirs', 400);
    run(12, 0.1);
    composer.dispose();
    expectClean();
  });
});

describe('façade AudioEngine', () => {
  it('reste silencieuse et sans exception quand WebAudio est absent', async () => {
    delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
    vi.resetModules();
    const { AudioEngine } = await import('./index.js');
    const engine = AudioEngine.get();
    await expect(engine.init()).resolves.toBeUndefined();
    expect(engine.ready).toBe(false);
    expect(engine.silentMode).toBe(true);
    expect(() => engine.playTheme('aventure', 'vallee_durolle')).not.toThrow();
    expect(() => engine.sfx('clic')).not.toThrow();
    expect(() => engine.ambience('foret')).not.toThrow();
    expect(() => engine.stopTheme()).not.toThrow();
    expect(() => engine.setBus('musique', 40)).not.toThrow();
    expect(engine.theme).toBeNull();
    expect(engine.ambienceKey).toBe('aucune');
    await engine.dispose();
  });

  it('est un singleton et applique les consignes reçues avant init()', async () => {
    vi.resetModules();
    const { AudioEngine } = await import('./index.js');
    const engine = AudioEngine.get();
    expect(AudioEngine.get()).toBe(engine);

    // Consignes données avant le geste utilisateur.
    engine.playTheme('accueil');
    engine.ambience('vent');
    engine.setIntensity('tension');
    expect(engine.ready).toBe(false);

    await engine.init();
    expect(engine.ready).toBe(true);
    expect(engine.theme).toBe('accueil');
    expect(engine.ambienceKey).toBe('vent');
    run(6);
    expectClean();
    await engine.dispose();
  });

  it('règle et mémorise les volumes des trois bus', async () => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    vi.resetModules();
    const { AudioEngine, CLEF_STOCKAGE_AUDIO } = await import('./index.js');
    const engine = AudioEngine.get();
    await engine.init();
    engine.setBus('musique', 33);
    engine.setBus('effets', 120);
    engine.setBus('ambiance', -5);
    expect(engine.getVolumes()).toEqual({ musique: 33, effets: 100, ambiance: 0 });
    expect(store.get(CLEF_STOCKAGE_AUDIO)).toContain('33');
    await engine.dispose();
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  });

  it('se tait en arrière-plan et repart au retour', async () => {
    const listeners = new Map<string, () => void>();
    let visibility: DocumentVisibilityState = 'visible';
    (globalThis as unknown as { document: unknown }).document = {
      get visibilityState() {
        return visibility;
      },
      addEventListener: (name: string, fn: () => void) => void listeners.set(name, fn),
      removeEventListener: (name: string) => void listeners.delete(name),
    };
    vi.resetModules();
    const { AudioEngine } = await import('./index.js');
    const engine = AudioEngine.get();
    await engine.init();
    engine.playTheme('aventure');
    engine.ambience('foret');
    run(4);

    visibility = 'hidden';
    listeners.get('visibilitychange')?.();
    run(2);
    expect(ctx.state).toBe('suspended');
    // Aucun effet ne doit partir pendant que l'onglet est caché.
    expect(() => engine.sfx('epee')).not.toThrow();

    visibility = 'visible';
    listeners.get('visibilitychange')?.();
    await Promise.resolve();
    run(2);
    expect(ctx.state).toBe('running');
    expectClean();
    await engine.dispose();
    delete (globalThis as unknown as { document?: unknown }).document;
  });
});
