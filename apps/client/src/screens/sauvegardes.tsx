/**
 * Emplacements de sauvegarde — `#/charger` et `#/demo/sauvegardes`.
 *
 * Quinze emplacements : **trois automatiques** (le jeu y écrit tout seul) et
 * **douze manuels** (le joueur les nomme). Chaque emplacement porte sa
 * vignette du Forez, sa date locale, son résumé de calendrier et les bannières
 * en présence. Les emplacements libres ne sont pas cachés : un cadre pointillé
 * dit clairement qu'ils attendent une partie.
 *
 * L'écran ne connaît ni le réseau ni le stockage : il reçoit la liste, et
 * remonte les intentions du joueur par rappels.
 */

import { useEffect, useRef, type ReactElement } from 'react';
import type { SaveSlot } from '@auvergne/protocol';
import { Badge, Button, Divider, Panel } from '@auvergne/ui';
import { renderForezMinimap } from '../landing/index.js';
import { Page } from './shell.js';
import { dateCourte, nombre, pluriel } from './format.js';

/** Nombre d'emplacements exposés, par nature. */
export const EMPLACEMENTS_AUTO = 3;
export const EMPLACEMENTS_MANUELS = 12;

/* ────────────────────────────── La vignette ─────────────────────────────── */

/**
 * Vignette du Forez : le relief réel, peint une fois par session par
 * `renderForezMinimap()`, réduit ici et marqué d'une pastille par bannière.
 * Une sauvegarde peut porter sa propre image (`slot.thumbnail`) : elle a alors
 * la priorité.
 */
function Vignette({ slot }: { slot: SaveSlot }): ReactElement {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const L = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, L, H);
    try {
      const carte = renderForezMinimap();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(carte.canvas, 0, 0, carte.cols, carte.rows, 0, 0, L, H);
    } catch {
      /* Sans canvas, la vignette reste un aplat de parchemin bordé d'or :
         l'emplacement demeure lisible. */
      ctx.fillStyle = '#4A4E52';
      ctx.fillRect(0, 0, L, H);
    }
    /* Voile chaud d'enluminure, puis pastilles des bannières en présence. */
    const voile = ctx.createLinearGradient(0, 0, L, H);
    voile.addColorStop(0, 'rgba(255, 233, 194, 0.16)');
    voile.addColorStop(1, 'rgba(42, 50, 66, 0.34)');
    ctx.fillStyle = voile;
    ctx.fillRect(0, 0, L, H);
    slot.players.forEach((joueur, i) => {
      const x = 8 + i * 13;
      const y = H - 11;
      ctx.fillStyle = 'rgba(42, 50, 66, 0.55)';
      ctx.fillRect(x - 1, y - 1, 11, 11);
      ctx.fillStyle = joueur.color;
      ctx.fillRect(x, y, 9, 9);
      ctx.strokeStyle = 'rgba(201, 162, 39, 0.85)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, 8, 8);
    });
  }, [slot]);

  return (
    <span className="emplacement__vignette">
      <canvas ref={ref} width={96} height={156} aria-hidden="true" />
    </span>
  );
}

/* ─────────────────────────── Une carte d'emplacement ────────────────────── */

export interface ActionsEmplacement {
  onReprendre?: (slot: SaveSlot) => void;
  onEcraser?: (id: string) => void;
  onSupprimer?: (slot: SaveSlot) => void;
}

function CarteEmplacement({
  slot,
  actions,
  lectureSeule,
}: {
  slot: SaveSlot;
  actions: ActionsEmplacement;
  lectureSeule: boolean;
}): ReactElement {
  const jour = ((slot.turn - 1) % 7) + 1;
  return (
    <Panel matter="parchemin" padding="normal" raised className="emplacement">
      <div className="emplacement__corps">
        <Vignette slot={slot} />
        <div className="emplacement__texte">
          <div className="emplacement__entete">
            <h3 className="emplacement__nom">{slot.name}</h3>
            {slot.autosave ? (
              <Badge tone="azur" size="compact">
                Automatique
              </Badge>
            ) : null}
          </div>
          <p className="fiche__ligne-detail jeu-tabulaire">
            Semaine&#8239;{nombre(slot.week)}, jour&#8239;{jour} · tour&#8239;{nombre(slot.turn)}
          </p>
          <p className="emplacement__date">{dateCourte(slot.updatedAt)}</p>
          <div className="emplacement__bannieres">
            {slot.players.map((j, i) => (
              <span className="emplacement__banniere" key={`${j.name}-${i}`}>
                <span className="emplacement__pastille" style={{ backgroundColor: j.color }} />
                {j.name}
              </span>
            ))}
          </div>
          <p className="emplacement__empreinte jeu-tabulaire">Empreinte {slot.hash}</p>
        </div>
      </div>
      <div className="emplacement__actions">
        <Button
          variant="principal"
          onClick={(): void => actions.onReprendre?.(slot)}
          disabled={lectureSeule || !actions.onReprendre}
        >
          Reprendre
        </Button>
        {!slot.autosave ? (
          <Button
            variant="secondaire"
            onClick={(): void => actions.onEcraser?.(slot.id)}
            disabled={lectureSeule || !actions.onEcraser}
          >
            Écraser
          </Button>
        ) : null}
        <Button
          variant="fantome"
          onClick={(): void => actions.onSupprimer?.(slot)}
          disabled={lectureSeule || !actions.onSupprimer}
        >
          Effacer
        </Button>
      </div>
    </Panel>
  );
}

function EmplacementLibre({ index, auto }: { index: number; auto: boolean }): ReactElement {
  return (
    <div className="emplacement__vide">
      <span>
        {auto ? 'Emplacement automatique' : 'Emplacement'} n<sup>o</sup>&#8239;{index}
        <br />
        libre
      </span>
    </div>
  );
}

/* ─────────────────────────────── L'écran ────────────────────────────────── */

export interface EcranSauvegardesProps {
  /** emplacements connus, dans n'importe quel ordre */
  emplacements: readonly SaveSlot[];
  /** l'écran attend encore la réponse du serveur */
  chargement?: boolean;
  /** message d'information affiché en tête (serveur absent, quota…) */
  avis?: string | null;
  /** démonstration : les actions sont visibles mais inertes */
  lectureSeule?: boolean;
  actions?: ActionsEmplacement;
}

/** Grille des quinze emplacements : trois automatiques, douze manuels. */
export function EcranSauvegardes({
  emplacements,
  chargement = false,
  avis = null,
  lectureSeule = false,
  actions = {},
}: EcranSauvegardesProps): ReactElement {
  const tri = (a: SaveSlot, b: SaveSlot): number => (a.updatedAt < b.updatedAt ? 1 : -1);
  const autos = emplacements.filter((s) => s.autosave).slice().sort(tri).slice(0, EMPLACEMENTS_AUTO);
  const manuels = emplacements.filter((s) => !s.autosave).slice().sort(tri).slice(0, EMPLACEMENTS_MANUELS);

  return (
    <Page
      titre="Reprendre une partie"
      note={`${nombre(autos.length + manuels.length)} sur ${EMPLACEMENTS_AUTO + EMPLACEMENTS_MANUELS}`}
    >
      {avis ? (
        <p className="ecran__bandeau-avis" role="status">
          {avis}
        </p>
      ) : null}

      <Divider label="Sauvegardes automatiques" onDark />
      <p className="ecran__chapeau">
        Le jeu écrit ici tout seul, à chaque fin de tour. Trois générations sont conservées :
        la partie en cours et les deux précédentes.
      </p>
      <div className="emplacements">
        {Array.from({ length: EMPLACEMENTS_AUTO }, (_, i) => {
          const slot = autos[i];
          return slot ? (
            <CarteEmplacement key={slot.id} slot={slot} actions={actions} lectureSeule={lectureSeule} />
          ) : (
            <EmplacementLibre key={`auto-libre-${i}`} index={i + 1} auto />
          );
        })}
      </div>

      <Divider label="Emplacements manuels" onDark />
      <p className="ecran__chapeau">
        {chargement
          ? 'Le serveur est interrogé…'
          : `${pluriel(manuels.length, 'partie nommée', 'parties nommées')} sur douze emplacements.`}
      </p>
      <div className="emplacements">
        {Array.from({ length: EMPLACEMENTS_MANUELS }, (_, i) => {
          const slot = manuels[i];
          return slot ? (
            <CarteEmplacement key={slot.id} slot={slot} actions={actions} lectureSeule={lectureSeule} />
          ) : (
            <EmplacementLibre key={`manuel-libre-${i}`} index={i + 1} auto={false} />
          );
        })}
      </div>
    </Page>
  );
}
