/**
 * Les quatre écrans hors partie : accueil, assistant de nouvelle partie,
 * codex, options.
 *
 * Ils vivent tous dans `apps/client/src/landing` (périmètre « Accueil ») ;
 * ce fichier ne fait que les **brancher sur le routeur** en gardant le décor
 * animé monté d'un écran à l'autre — c'est exactement ce que faisait
 * `LandingShell`, mais piloté par `location.hash` plutôt que par un état
 * interne, et avec la section du codex reprise de l'URL.
 */

import { useCallback, useState, type ReactElement } from 'react';
import type { GameSetup } from '@auvergne/engine';
import {
  CodexPage,
  LandingBackdrop,
  LandingPage,
  NewGamePage,
  OptionsPage,
  type GameSettings,
} from '../landing/index.js';
import { demarrerPartie } from '../state/store.js';
import { lireLocal, partieReprenable } from '../state/persistence.js';
import { navigate } from '../router.js';
import { EcranChargement, EcranPanne } from './shell.js';
import type { Progression } from '../boot.js';

/** Les quatre écrans que cette coquille sait montrer. */
export type EcranMenu = 'accueil' | 'nouvelle-partie' | 'codex' | 'options';

export interface EcranMenusProps {
  ecran: EcranMenu;
  /** section ouverte du codex, lue dans le fragment `#/codex/:section` */
  section?: string;
  settings: GameSettings;
  onSettings: (next: GameSettings) => void;
}

const ATTELAGE: Progression = {
  etape: 'moteur',
  valeur: 0.4,
  libelle: 'On lève la carte du Forez…',
};

/**
 * La coquille des menus. Elle reste montée tant que la route appartient aux
 * quatre écrans : le décor de la page d'accueil n'est jamais reconstruit, et
 * le passage d'un écran à l'autre est instantané.
 */
export function EcranMenus({ ecran, section, settings, onSettings }: EcranMenusProps): ReactElement {
  const [construction, setConstruction] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);

  const reprenable = partieReprenable();
  const resume = (): { name: string; turn: number; week: number } | undefined => {
    const save = lireLocal();
    if (!save) return undefined;
    return { name: save.slot.name, turn: save.slot.turn, week: save.slot.week };
  };

  const demarrer = useCallback((setup: GameSetup): void => {
    setConstruction(true);
    setErreur(null);
    void (async (): Promise<void> => {
      try {
        /* Une image est laissée au navigateur pour peindre l'écran de
           chargement avant la seconde de calcul de la carte. */
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        await demarrerPartie(setup);
        navigate({ name: 'partie' });
      } catch (cause) {
        setErreur(cause);
      } finally {
        setConstruction(false);
      }
    })();
  }, []);

  const reprendre = useCallback((): void => {
    navigate({ name: 'partie' });
  }, []);

  if (erreur !== null) {
    return <EcranPanne erreur={erreur} onReprendre={(): void => setErreur(null)} reprendreLibelle="Revenir au menu" />;
  }

  if (construction) {
    return <EcranChargement progression={ATTELAGE} titre="Le Forez se lève" citation={2} />;
  }

  return (
    <div className="hmm-acc">
      <LandingBackdrop settings={settings} />
      {ecran === 'accueil' ? (
        <LandingPage
          backdrop={false}
          hasSave={reprenable}
          settings={settings}
          version="1.0.0"
          saveSummary={resume()}
          onNewGame={(): void => navigate({ name: 'nouvelle-partie' })}
          onContinue={reprendre}
          onLoad={(): void => navigate({ name: 'charger' })}
          onCodex={(): void => navigate({ name: 'codex' })}
          onOptions={(): void => navigate({ name: 'options' })}
        />
      ) : null}
      {ecran === 'nouvelle-partie' ? (
        <NewGamePage onStart={demarrer} onBack={(): void => navigate({ name: 'accueil' })} />
      ) : null}
      {ecran === 'codex' ? (
        <CodexPage section={section} onBack={(): void => navigate({ name: 'accueil' })} />
      ) : null}
      {ecran === 'options' ? (
        <OptionsPage
          settings={settings}
          onChange={onSettings}
          onBack={(): void => navigate({ name: 'accueil' })}
        />
      ) : null}
    </div>
  );
}
