/**
 * Compositeur temps réel.
 *
 * Le compositeur ne lit pas une partition : il en écrit une, mesure par
 * mesure, à partir du cahier des charges d'un thème (`themes.ts`) et du
 * générateur modal déterministe (`theory.ts`).
 *
 * Principes :
 *  - **Planification à l'avance.** Un minuteur réveille le compositeur toutes
 *    les 40 ms ; il programme tout ce qui doit sonner dans les 400 ms qui
 *    suivent, à l'horloge exacte de l'`AudioContext`. Le rythme ne dépend donc
 *    jamais de la charge du navigateur.
 *  - **Sections.** Chaque thème enchaîne des sections (ouverture, chant,
 *    réponse, coda…), chacune avec sa cadence, sa transposition et son niveau.
 *  - **Intensité adaptative.** Trois paliers — calme, tension, combat — qui
 *    n'ajoutent ni ne retirent jamais une couche d'un coup : les niveaux
 *    glissent sur plusieurs secondes.
 *  - **Transitions.** Changer de thème est un fondu enchaîné entre deux
 *    exécutions indépendantes, chacune avec sa propre paire de gains. Rien
 *    n'est jamais coupé au milieu d'une note.
 */

import type { AudioGraph } from './context.js';
import {
  startBourdon,
  playNote,
  type Drone,
  type InstrumentName,
  type NoteSpec,
  type VoiceBus,
} from './instruments.js';
import {
  RHYTHMS,
  beatSeconds,
  chord,
  clampBpm,
  counterLine,
  degreeToMidi,
  generateMelody,
  hashSeed,
  midiToFreqAncient,
  openFifth,
  progression,
  type MelodyNote,
  type ModeName,
  type RhythmName,
} from './theory.js';
import {
  INTENSITY_RANK,
  regionColour,
  theme as themeDef,
  type Intensity,
  type LayerDef,
  type SectionDef,
  type ThemeDef,
  type ThemeKey,
} from './themes.js';
import type { RegionId } from '@auvergne/engine';

const MIN_GAIN = 0.0001;
/** Fenêtre de planification, en secondes. */
const LOOKAHEAD = 0.4;
/** Période du minuteur, en millisecondes. */
const TICK_MS = 40;
/** Constante de temps du glissement d'intensité, en secondes. */
const INTENSITY_GLIDE = 3.4;

/* ------------------------------------------------------------------ */
/* Événement planifié                                                  */
/* ------------------------------------------------------------------ */

interface ScheduledNote {
  /** Position en battues depuis le début de la section. */
  beat: number;
  duration: number;
  midi: number;
  velocity: number;
  instrument: InstrumentName;
  pan: number;
  wet: number;
  brightness: number;
  /** Index de la couche, pour appliquer son niveau au moment de jouer. */
  layer: number;
  seed: number;
}

/* ------------------------------------------------------------------ */
/* Exécution d'un thème                                                */
/* ------------------------------------------------------------------ */

/**
 * Une exécution : un thème, une région, un jeu de gains propres. Deux
 * exécutions peuvent coexister le temps d'un fondu enchaîné.
 */
class Performance {
  readonly key: ThemeKey;
  readonly def: ThemeDef;
  readonly bus: VoiceBus;

  private readonly graph: AudioGraph;
  private readonly dryGain: GainNode;
  private readonly wetGain: GainNode;

  private region: RegionId | undefined;
  private root: number;
  private mode: ModeName;
  private rhythm: RhythmName;
  private bpm: number;
  private brightnessBias = 0;
  private wetBias = 0;
  private feature: InstrumentName | null = null;

  /** Niveaux courants et visés de chaque couche, 0–1. */
  private readonly levels: number[];
  private readonly targets: number[];

  private sectionIndex = 0;
  private cycle = 0;
  private sectionStart = 0;
  private notes: ScheduledNote[] = [];
  private cursor = 0;
  private sectionBeats = 0;
  private bourdon: Drone | null = null;
  private ended = false;
  private fadingOut = false;
  /** Faux tant que les niveaux de couche n'ont pas reçu leur valeur initiale. */
  private primed = false;
  /** Une couleur régionale attend le prochain joint de section. */
  private regionPending = false;

  constructor(graph: AudioGraph, key: ThemeKey, region: RegionId | undefined, startTime: number) {
    this.graph = graph;
    this.key = key;
    this.def = themeDef(key);
    this.region = region;

    const { ctx } = graph;
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = MIN_GAIN;
    this.dryGain.connect(graph.dry.musique);
    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = MIN_GAIN;
    this.wetGain.connect(graph.wet.musique);
    this.bus = { ctx, dry: this.dryGain, wet: this.wetGain };

    this.root = this.def.root;
    this.mode = this.def.mode;
    this.rhythm = this.def.rhythm;
    this.bpm = clampBpm(this.def.bpm);
    this.levels = this.def.layers.map(() => 0);
    this.targets = this.def.layers.map(() => 0);
    this.applyRegion(region);

    this.sectionStart = startTime;
    this.buildSection();
  }

  get finished(): boolean {
    return this.ended;
  }

  /** Entrée en fondu. */
  fadeIn(fadeMs: number): void {
    const t = this.graph.now();
    const fade = Math.max(0.2, fadeMs / 1000);
    for (const g of [this.dryGain.gain, this.wetGain.gain]) {
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(MIN_GAIN, g.value), t);
      g.exponentialRampToValueAtTime(1, t + fade);
    }
  }

  /** Sortie en fondu : les notes déjà programmées finissent de sonner. */
  fadeOut(fadeMs: number): void {
    if (this.fadingOut) return;
    this.fadingOut = true;
    const t = this.graph.now();
    const fade = Math.max(0.25, fadeMs / 1000);
    for (const g of [this.dryGain.gain, this.wetGain.gain]) {
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(MIN_GAIN, g.value), t);
      g.exponentialRampToValueAtTime(MIN_GAIN, t + fade);
      g.linearRampToValueAtTime(0, t + fade + 0.1);
    }
    this.bourdon?.stop(fadeMs * 0.9);
    this.bourdon = null;
  }

  /** Libère les nœuds. À appeler après la fin du fondu de sortie. */
  dispose(): void {
    this.ended = true;
    this.bourdon?.stop(180);
    this.bourdon = null;
    try {
      this.dryGain.disconnect();
      this.wetGain.disconnect();
    } catch {
      /* déjà libéré */
    }
  }

  /**
   * Change la couleur régionale. La transposition, le mode et le tempo ne
   * prennent effet qu'au **joint de section suivant** : basculer de tonalité
   * au milieu d'une phrase s'entend immédiatement et trahit la machine.
   */
  setRegion(region: RegionId | undefined): void {
    if (region === this.region) return;
    this.region = region;
    this.regionPending = true;
  }

  /** Ajuste les niveaux visés des couches selon le palier d'intensité. */
  setIntensity(intensity: Intensity): void {
    const rank = INTENSITY_RANK[intensity];
    for (let i = 0; i < this.def.layers.length; i += 1) {
      const layer = this.def.layers[i] as LayerDef;
      const from = INTENSITY_RANK[layer.from];
      const until = layer.until ? INTENSITY_RANK[layer.until] : 9;
      this.targets[i] = rank >= from && rank <= until ? 1 : 0;
      // Au tout premier réglage, les couches sont déjà à leur place : un thème
      // ne doit pas mettre trois secondes à apparaître.
      if (!this.primed) this.levels[i] = this.targets[i] as number;
    }
    this.primed = true;
    // Le bourdon suit lui aussi, mais discrètement.
    if (this.bourdon && this.def.bourdon) {
      const boost = 1 + rank * 0.12;
      this.bourdon.setLevel(Math.min(1, this.def.bourdon.level * boost), 2600);
    }
  }

  /** Rapproche les niveaux courants de leurs cibles. */
  glide(dt: number): void {
    const k = 1 - Math.exp(-dt / INTENSITY_GLIDE);
    for (let i = 0; i < this.levels.length; i += 1) {
      const current = this.levels[i] as number;
      const target = this.targets[i] as number;
      this.levels[i] = current + (target - current) * k;
    }
  }

  /**
   * Programme tout ce qui doit sonner avant `until`.
   * Retourne `false` quand un thème non bouclé est arrivé à son terme.
   */
  schedule(until: number): boolean {
    if (this.ended || this.fadingOut) return true;
    const beat = beatSeconds(this.bpm);

    let guard = 0;
    while (guard < 4096) {
      guard += 1;
      // Notes restantes de la section courante.
      while (this.cursor < this.notes.length) {
        const note = this.notes[this.cursor] as ScheduledNote;
        const when = this.sectionStart + note.beat * beat;
        if (when > until) return true;
        this.emit(note, when, beat);
        this.cursor += 1;
      }

      // Section terminée : passer à la suivante.
      const sectionEnd = this.sectionStart + this.sectionBeats * beat;
      if (sectionEnd > until) return true;

      this.sectionIndex += 1;
      if (this.sectionIndex >= this.def.sections.length) {
        if (!this.def.loop) {
          this.ended = true;
          return false;
        }
        this.sectionIndex = 0;
        this.cycle += 1;
      }
      // Le joint de section est le seul endroit où la couleur régionale
      // change : le bourdon y glisse doucement vers sa nouvelle fondamentale.
      if (this.regionPending) {
        this.regionPending = false;
        this.applyRegion(this.region);
        this.bourdon?.setFreq(this.bourdonFreq(), 2400);
      }
      this.sectionStart = sectionEnd;
      this.buildSection();
    }
    return true;
  }

  /* ---------------------------------------------------------------- */

  private applyRegion(region: RegionId | undefined): void {
    const colour = regionColour(region);
    if (!colour) {
      this.root = this.def.root;
      this.mode = this.def.mode;
      this.rhythm = this.def.rhythm;
      this.bpm = clampBpm(this.def.bpm);
      this.brightnessBias = 0;
      this.wetBias = 0;
      this.feature = null;
      return;
    }
    // La transposition reste dans une octave autour de la finale du thème.
    let offset = colour.rootOffset;
    while (offset > 6) offset -= 12;
    while (offset < -6) offset += 12;
    this.root = this.def.root + offset;
    this.mode = colour.mode ?? this.def.mode;
    this.rhythm = colour.rhythm ?? this.def.rhythm;
    this.bpm = clampBpm(this.def.bpm + colour.bpmDelta);
    this.brightnessBias = colour.brightness;
    this.wetBias = colour.wet;
    this.feature = colour.feature;
  }

  private bourdonFreq(): number {
    const b = this.def.bourdon;
    if (!b) return midiToFreqAncient(this.root);
    return midiToFreqAncient(degreeToMidi(this.root, this.mode, b.degree) + 12 * b.octave);
  }

  /** Démarre le bourdon si le thème en prévoit un. */
  startBourdonIfNeeded(): void {
    const b = this.def.bourdon;
    if (!b || this.bourdon || this.ended) return;
    this.bourdon = startBourdon(this.bus, {
      freq: this.bourdonFreq(),
      time: this.graph.now() + 0.02,
      level: b.level,
      pan: -0.06,
      wet: 0.55 + this.wetBias * 0.5,
      seed: this.def.seed ^ 0x600d,
    });
  }

  /** Construit la liste d'événements de la section courante. */
  private buildSection(): void {
    const section = this.def.sections[this.sectionIndex] as SectionDef;
    const rhythmDef = RHYTHMS[this.rhythm];
    const beatsPerBar = rhythmDef.beatsPerBar;
    this.sectionBeats = section.bars * beatsPerBar;
    this.cursor = 0;

    const seed = hashSeed(
      `${this.def.seed}:${this.key}:${this.mode}:${this.rhythm}:${this.sectionIndex}:${this.cycle}:${this.region ?? 'aucune'}`,
    );
    const root = degreeToMidi(this.root, this.mode, section.shift);

    const melody: MelodyNote[] = section.melody
      ? generateMelody({
          seed,
          root,
          mode: this.mode,
          bars: section.bars,
          rhythm: this.rhythm,
          cadence: section.cadence,
          mobility: this.def.mobility,
          ornamentation: this.def.ornamentation,
        })
      : [];
    const counter = melody.length > 0 ? counterLine(melody, root, this.mode, seed) : [];
    const degrees = progression(seed ^ 0x2f6b45, this.mode, section.bars, section.cadence);

    const out: ScheduledNote[] = [];
    const level = section.level;

    for (let li = 0; li < this.def.layers.length; li += 1) {
      const layer = this.def.layers[li] as LayerDef;
      const featureBoost = this.feature === layer.instrument ? 1.35 : 1;
      const base = {
        instrument: layer.instrument,
        pan: layer.pan,
        wet: clamp(layer.wet + this.wetBias, 0, 1.2),
        brightness: clamp(layer.brightness + this.brightnessBias, 0, 1),
        layer: li,
      };
      const gain = layer.gain * level * featureBoost;
      const sparsity = Math.max(1, Math.round(layer.sparsity ?? 1));

      switch (layer.role) {
        case 'melodie': {
          for (let i = 0; i < melody.length; i += 1) {
            const n = melody[i] as MelodyNote;
            if (sparsity > 1 && i % sparsity !== 0) continue;
            out.push({
              ...base,
              beat: n.start,
              duration: n.duration,
              midi: n.midi + 12 * layer.octave,
              velocity: n.velocity * gain,
              seed: seed + i * 131,
            });
          }
          break;
        }
        case 'contrechant': {
          for (let i = 0; i < counter.length; i += 1) {
            const n = counter[i] as MelodyNote;
            if (sparsity > 1 && i % sparsity !== 0) continue;
            out.push({
              ...base,
              beat: n.start,
              duration: n.duration,
              midi: n.midi + 12 * layer.octave,
              velocity: n.velocity * gain,
              seed: seed + 7919 + i * 131,
            });
          }
          break;
        }
        case 'harmonie': {
          // Un accord tenu par mesure, en position large.
          for (let bar = 0; bar < section.bars; bar += 1) {
            if (bar % sparsity !== 0) continue;
            const degree = degrees[bar % degrees.length] as number;
            const tones = chord(root, this.mode, degree, 3);
            const span = beatsPerBar * sparsity;
            for (let k = 0; k < tones.length; k += 1) {
              out.push({
                ...base,
                pan: layer.pan + (k - 1) * 0.14,
                beat: bar * beatsPerBar,
                duration: span * 0.94,
                midi: (tones[k] as number) + 12 * layer.octave,
                velocity: gain * (k === 0 ? 0.72 : 0.5),
                seed: seed + 4409 + bar * 37 + k,
              });
            }
          }
          break;
        }
        case 'nappe': {
          // Quintes à vide tenues : la couleur d'organum.
          for (let bar = 0; bar < section.bars; bar += 1) {
            if (bar % sparsity !== 0) continue;
            const degree = degrees[bar % degrees.length] as number;
            const tones = openFifth(root, this.mode, degree);
            const span = beatsPerBar * sparsity;
            for (let k = 0; k < tones.length; k += 1) {
              out.push({
                ...base,
                pan: layer.pan + (k === 0 ? -0.1 : 0.12),
                beat: bar * beatsPerBar,
                duration: span * 0.92,
                midi: (tones[k] as number) + 12 * layer.octave,
                velocity: gain * (k === 0 ? 0.7 : 0.55),
                seed: seed + 6151 + bar * 53 + k,
              });
            }
          }
          break;
        }
        case 'percussion': {
          for (let bar = 0; bar < section.bars; bar += 1) {
            for (let k = 0; k < rhythmDef.drum.length; k += 1) {
              const stroke = rhythmDef.drum[k] as { at: number; force: number };
              // La dernière mesure s'allège : la cadence doit respirer.
              const tail = bar === section.bars - 1 ? 0.72 : 1;
              out.push({
                ...base,
                pan: layer.pan + (stroke.force > 0.7 ? 0 : k % 2 === 0 ? -0.16 : 0.16),
                beat: bar * beatsPerBar + stroke.at,
                duration: 0.1,
                // Frappe forte = centre de la peau (grave), frappe faible = bord.
                midi: root + 12 * layer.octave + (stroke.force > 0.7 ? 0 : 7),
                velocity: stroke.force * gain * tail,
                seed: seed + 9973 + bar * 17 + k,
              });
            }
          }
          break;
        }
        case 'ornement': {
          for (let i = 0; i < melody.length; i += 1) {
            if (i % sparsity !== 0) continue;
            const n = melody[i] as MelodyNote;
            out.push({
              ...base,
              beat: n.start,
              duration: Math.max(0.5, n.duration),
              midi: n.midi + 12 * layer.octave,
              velocity: n.velocity * gain * 0.8,
              seed: seed + 2069 + i * 97,
            });
          }
          break;
        }
        default:
          break;
      }
    }

    out.sort((a, b) => a.beat - b.beat);
    this.notes = out;
  }

  private emit(note: ScheduledNote, when: number, beat: number): void {
    const level = this.levels[note.layer] as number;
    if (level < 0.02) return;
    const velocity = note.velocity * level;
    if (velocity < 0.012) return;
    const spec: NoteSpec = {
      freq: midiToFreqAncient(note.midi),
      time: when,
      duration: Math.max(0.08, note.duration * beat),
      velocity: Math.min(1, velocity),
      pan: clamp(note.pan, -1, 1),
      wet: note.wet,
      brightness: note.brightness,
      seed: note.seed,
    };
    playNote(this.bus, note.instrument, spec);
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/* ------------------------------------------------------------------ */
/* Compositeur                                                         */
/* ------------------------------------------------------------------ */

export class Composer {
  private readonly graph: AudioGraph;
  private live: Performance | null = null;
  private outgoing: Performance[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private intensity: Intensity = 'calme';
  private running = false;

  constructor(graph: AudioGraph) {
    this.graph = graph;
  }

  /** Thème en cours, ou `null`. */
  get current(): ThemeKey | null {
    return this.live?.key ?? null;
  }

  get intensityLevel(): Intensity {
    return this.intensity;
  }

  /**
   * Lance un thème. Si un autre joue déjà, la bascule est un fondu enchaîné ;
   * relancer le même thème ne fait que mettre à jour la région.
   */
  play(key: ThemeKey, region?: RegionId, fadeMs = 2400): void {
    if (this.live && this.live.key === key && !this.live.finished) {
      this.live.setRegion(region);
      return;
    }
    const previous = this.live;
    if (previous) {
      previous.fadeOut(fadeMs * 1.1);
      this.outgoing.push(previous);
      const perf = previous;
      setTimeout(() => {
        perf.dispose();
        this.outgoing = this.outgoing.filter((p) => p !== perf);
      }, fadeMs * 1.1 + 500);
    }

    const start = this.graph.now() + 0.12;
    const performance = new Performance(this.graph, key, region, start);
    performance.setIntensity(this.intensity);
    performance.startBourdonIfNeeded();
    performance.fadeIn(fadeMs);
    this.live = performance;
    this.start();
  }

  /** Arrête la musique en douceur. */
  stop(fadeMs = 1600): void {
    const performance = this.live;
    this.live = null;
    if (performance) {
      performance.fadeOut(fadeMs);
      this.outgoing.push(performance);
      setTimeout(() => {
        performance.dispose();
        this.outgoing = this.outgoing.filter((p) => p !== performance);
        if (!this.live) this.pause();
      }, fadeMs + 600);
    } else {
      this.pause();
    }
  }

  /** Change le palier d'intensité. Le passage est progressif. */
  setIntensity(intensity: Intensity): void {
    if (this.intensity === intensity) return;
    this.intensity = intensity;
    this.live?.setIntensity(intensity);
  }

  /** Change la couleur régionale du thème en cours. */
  setRegion(region: RegionId | undefined): void {
    this.live?.setRegion(region);
  }

  /** Suspend la planification (onglet en arrière-plan). */
  suspend(): void {
    this.pause();
  }

  /** Reprend la planification là où elle s'était arrêtée. */
  resume(): void {
    if (this.live) this.start();
  }

  /** Libère tout immédiatement. */
  dispose(): void {
    this.pause();
    this.live?.dispose();
    this.live = null;
    for (const p of this.outgoing) p.dispose();
    this.outgoing = [];
  }

  /* ---------------------------------------------------------------- */

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTick = this.graph.now();
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private pause(): void {
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    const performance = this.live;
    if (!performance) {
      this.pause();
      return;
    }
    const now = this.graph.now();
    const dt = Math.max(0, Math.min(1, now - this.lastTick));
    this.lastTick = now;
    performance.glide(dt);
    const alive = performance.schedule(now + LOOKAHEAD);
    if (!alive) {
      // Thème non bouclé arrivé au bout : on laisse la queue sonner.
      this.live = null;
      performance.fadeOut(2600);
      this.outgoing.push(performance);
      setTimeout(() => {
        performance.dispose();
        this.outgoing = this.outgoing.filter((p) => p !== performance);
      }, 3400);
      this.pause();
    }
  }
}
