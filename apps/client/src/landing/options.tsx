/**
 * Écran des options.
 *
 * Trois volumes (musique, effets, ambiance), la qualité graphique, l'échelle
 * de texte, le contraste renforcé, la réduction des animations, les motifs
 * d'accessibilité et la langue. Tout est appliqué **immédiatement** — pas de
 * bouton « valider » : le joueur entend et voit le résultat pendant qu'il
 * règle.
 *
 * Les volumes sont relayés au moteur audio par `audio-bridge`, qui protège
 * l'appel tant que `apps/client/src/audio` n'est pas livré. La persistance est
 * dans `localStorage` ; son échec n'interrompt jamais la partie.
 */

import { useCallback, useRef, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { Icon } from '@auvergne/ui';
import { appliquerVolumes, jouerEffet } from './audio-bridge.js';
import {
  DEFAULT_SETTINGS,
  applySettings,
  saveSettings,
  systemPrefersReducedMotion,
  type GameSettings,
} from './settings.js';
import type { SceneQuality } from './scene.js';

/* ─────────────────────────── Contrôles dessinés ─────────────────────────── */

interface CurseurProps {
  label: string;
  hint: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange(next: number): void;
  onCommit?(next: number): void;
}

/** Curseur de volume : rail de granit, gorge d'or, poignée à ferrure. */
function Curseur({
  label,
  hint,
  value,
  min = 0,
  max = 100,
  step = 1,
  suffix = ' %',
  onChange,
  onCommit,
}: CurseurProps): ReactElement {
  const ratio = ((value - min) / (max - min)) * 100;
  return (
    <label className="hmm-opt-curseur">
      <span className="hmm-opt-tete">
        <span className="hmm-opt-label">{label}</span>
        <span className="hmm-opt-valeur hmm-acc-tabulaire">
          {value}
          {suffix}
        </span>
      </span>
      <span className="hmm-opt-rail" style={{ '--remplissage': `${ratio}%` } as CSSProperties}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event): void => onChange(Number(event.target.value))}
          onPointerUp={(): void => onCommit?.(value)}
          onKeyUp={(): void => onCommit?.(value)}
        />
      </span>
      <span className="hmm-opt-hint">{hint}</span>
    </label>
  );
}

interface BasculeProps {
  label: string;
  hint: string;
  checked: boolean;
  onChange(next: boolean): void;
  forced?: string;
}

/** Bascule : deux états lisibles sans couleur, avec libellé explicite. */
function Bascule({ label, hint, checked, onChange, forced }: BasculeProps): ReactElement {
  return (
    <div className="hmm-opt-bascule">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`hmm-opt-interrupteur${checked ? ' est-actif' : ''}`}
        onClick={(): void => {
          jouerEffet('clic');
          onChange(!checked);
        }}
      >
        <span className="hmm-opt-glissiere">
          <span className="hmm-opt-pastille">
            <Icon name={checked ? 'valider' : 'fermer'} size={14} />
          </span>
        </span>
        <span className="hmm-opt-bascule-textes">
          <span className="hmm-opt-label">{label}</span>
          <span className="hmm-opt-hint">{forced ?? hint}</span>
        </span>
      </button>
    </div>
  );
}

interface ChoixProps<T extends string> {
  label: string;
  hint: string;
  value: T;
  options: readonly { id: T; name: string; text: string }[];
  onChange(next: T): void;
}

function Choix<T extends string>({ label, hint, value, options, onChange }: ChoixProps<T>): ReactElement {
  return (
    <fieldset className="hmm-acc-champ">
      <legend className="hmm-acc-legende">{label}</legend>
      <p className="hmm-acc-aide">{hint}</p>
      <div className="hmm-acc-segments" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={option.id === value}
            className={`hmm-acc-segment${option.id === value ? ' est-actif' : ''}`}
            onClick={(): void => {
              jouerEffet('clic');
              onChange(option.id);
            }}
          >
            <span className="hmm-acc-segment-nom">{option.name}</span>
            <span className="hmm-acc-segment-texte">{option.text}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const QUALITES: readonly { id: SceneQuality; name: string; text: string }[] = [
  { id: 'basse', name: 'Sobre', text: 'Sans particules ni grain. Pour les machines modestes et les batteries.' },
  { id: 'moyenne', name: 'Équilibrée', text: 'Brume, étincelles et grain, résolution mesurée.' },
  { id: 'haute', name: 'Peinte', text: 'Tous les plans, toutes les particules, résolution maximale.' },
];

const ECHELLES: readonly { id: string; name: string; text: string }[] = [
  { id: '85', name: 'Serrée', text: 'Plus de contenu à l’écran' },
  { id: '100', name: 'Normale', text: 'Réglage de référence' },
  { id: '115', name: 'Ample', text: 'Lecture confortable' },
  { id: '140', name: 'Très ample', text: 'Vision de loin, tablette au mur' },
];

/* ─────────────────────────────── L'écran ────────────────────────────────── */

export interface OptionsPageProps {
  settings: GameSettings;
  onChange(next: GameSettings): void;
  onBack(): void;
  /** Contenu additionnel, par exemple les réglages réseau. */
  children?: ReactNode;
}

/** Écran des options, appliqué en direct. */
export function OptionsPage({ settings, onChange, onBack, children }: OptionsPageProps): ReactElement {
  const dernierEcho = useRef(0);

  const mettreAJour = useCallback(
    (patch: Partial<GameSettings>, echo?: boolean): void => {
      const next = { ...settings, ...patch };
      onChange(next);
      applySettings(next);
      saveSettings(next);
      if (patch.musique !== undefined || patch.effets !== undefined || patch.ambiance !== undefined) {
        appliquerVolumes({ musique: next.musique, effets: next.effets, ambiance: next.ambiance });
      }
      if (echo === true) {
        const now = performance.now();
        if (now - dernierEcho.current > 180) {
          dernierEcho.current = now;
          jouerEffet('clic');
        }
      }
    },
    [onChange, settings],
  );

  const systeme = systemPrefersReducedMotion();

  return (
    <div className="hmm-acc-ecran hmm-opt">
      <header className="hmm-acc-ecran-tete">
        <button type="button" className="hmm-acc-retour" onClick={onBack}>
          <Icon name="chevron" size={18} />
          <span>Retour à l'accueil</span>
        </button>
        <h2 className="hmm-acc-ecran-titre">Options</h2>
        <p className="hmm-acc-ecran-sous-titre">
          Chaque réglage s'applique aussitôt et se souvient de lui-même d'une session à l'autre.
        </p>
      </header>

      <div className="hmm-opt-grille">
        <section className="hmm-acc-bloc" aria-labelledby="opt-son">
          <h3 className="hmm-acc-bloc-titre" id="opt-son">
            Le son
          </h3>
          <p className="hmm-acc-aide">
            Toute la musique est synthétisée à la volée : vielle à roue, flûte, tambour sur cadre, cloches. Aucun
            fichier sonore n'est chargé.
          </p>
          <Curseur
            label="Musique"
            hint="Thèmes de la maison, de la région et du combat"
            value={settings.musique}
            onChange={(v): void => mettreAJour({ musique: v })}
          />
          <Curseur
            label="Effets"
            hint="Armes, pas, forge, cloches, interface"
            value={settings.effets}
            onChange={(v): void => mettreAJour({ effets: v })}
            onCommit={(): void => jouerEffet('epee')}
          />
          <Curseur
            label="Ambiance"
            hint="Vent des futaies, rivières, foires, volées de cloches"
            value={settings.ambiance}
            onChange={(v): void => mettreAJour({ ambiance: v })}
          />
        </section>

        <section className="hmm-acc-bloc" aria-labelledby="opt-image">
          <h3 className="hmm-acc-bloc-titre" id="opt-image">
            L'image
          </h3>
          <Choix
            label="Qualité graphique"
            hint="La scène d'accueil et la carte s'ajustent d'elles-mêmes si l'appareil peine ; ce réglage fixe le plafond."
            value={settings.qualite}
            options={QUALITES}
            onChange={(v): void => mettreAJour({ qualite: v })}
          />
          <Bascule
            label="Réduire les animations"
            hint="Coupe la parallaxe, les particules et les transitions. La scène reste peinte, mais immobile."
            checked={settings.animationsReduites || systeme}
            forced={
              systeme
                ? 'Imposé par les réglages du système : votre appareil demande moins de mouvement.'
                : undefined
            }
            onChange={(v): void => mettreAJour({ animationsReduites: v })}
          />
        </section>

        <section className="hmm-acc-bloc" aria-labelledby="opt-lisibilite">
          <h3 className="hmm-acc-bloc-titre" id="opt-lisibilite">
            La lisibilité
          </h3>
          <Choix
            label="Échelle de texte"
            hint="Aucun texte indispensable ne descend sous quinze pixels, quelle que soit l'échelle."
            value={String(settings.echelleTexte)}
            options={ECHELLES}
            onChange={(v): void => mettreAJour({ echelleTexte: Number(v) })}
          />
          <Bascule
            label="Contraste renforcé"
            hint="Assombrit les fonds, épaissit les filets et les contours, sans changer la palette."
            checked={settings.contrasteRenforce}
            onChange={(v): void => mettreAJour({ contrasteRenforce: v })}
          />
          <Bascule
            label="Motifs de bannière"
            hint="L'appartenance passe par la couleur et par un motif — plein, chevrons, losanges, rayures, pois."
            checked={settings.motifsAccessibles}
            onChange={(v): void => mettreAJour({ motifsAccessibles: v })}
          />
        </section>

        <section className="hmm-acc-bloc" aria-labelledby="opt-langue">
          <h3 className="hmm-acc-bloc-titre" id="opt-langue">
            La langue
          </h3>
          <p className="hmm-acc-aide">
            Le jeu est écrit en français : textes, info-bulles, messages d'erreur et chroniques. Aucune autre
            langue n'est livrée à ce jour.
          </p>
          <div className="hmm-acc-segments" role="radiogroup" aria-label="Langue">
            <button type="button" role="radio" aria-checked={true} className="hmm-acc-segment est-actif">
              <span className="hmm-acc-segment-nom">Français</span>
              <span className="hmm-acc-segment-texte">Langue unique du Forez</span>
            </button>
          </div>
          <button
            type="button"
            className="hmm-opt-reinit"
            onClick={(): void => {
              jouerEffet('clic_lourd');
              mettreAJour({ ...DEFAULT_SETTINGS });
            }}
          >
            <Icon name="sablier" size={18} />
            <span>Revenir aux réglages d'origine</span>
          </button>
        </section>

        {children}
      </div>
    </div>
  );
}
