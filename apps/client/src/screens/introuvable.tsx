/**
 * Page introuvable — le repli du routeur.
 *
 * Jamais un écran vide : le fragment fautif est cité, et les routes réelles du
 * jeu sont proposées. Elle sert aussi de table des matières à la revue
 * visuelle (docs/03-ROUTES.md).
 */

import type { ReactElement } from 'react';
import { Button, Panel } from '@auvergne/ui';
import { navigate } from '../router.js';
import { Page } from './shell.js';

const PISTES: readonly { readonly fragment: string; readonly libelle: string }[] = [
  { fragment: '#/', libelle: 'Page d’accueil' },
  { fragment: '#/nouvelle-partie', libelle: 'Nouvelle partie' },
  { fragment: '#/charger', libelle: 'Emplacements de sauvegarde' },
  { fragment: '#/codex', libelle: 'Codex du Forez' },
  { fragment: '#/options', libelle: 'Options' },
  { fragment: '#/demo/carte', libelle: 'Démonstration — carte d’aventure' },
  { fragment: '#/demo/cite/granit', libelle: 'Démonstration — Châtellenie' },
  { fragment: '#/demo/cite/ermitage', libelle: 'Démonstration — Ermitage' },
  { fragment: '#/demo/combat', libelle: 'Démonstration — combat' },
  { fragment: '#/demo/heros', libelle: 'Démonstration — fiche de héros' },
  { fragment: '#/demo/royaume', libelle: 'Démonstration — royaume' },
  { fragment: '#/demo/sauvegardes', libelle: 'Démonstration — sauvegardes' },
  { fragment: '#/demo/galerie', libelle: 'Démonstration — galerie du design system' },
  { fragment: '#/demo/planche-art', libelle: 'Démonstration — planche de contact' },
];

export function EcranIntrouvable({ fragment }: { fragment: string }): ReactElement {
  return (
    <Page titre="Page introuvable">
      <Panel
        title="Ce chemin ne mène nulle part"
        subtitle={fragment || '#/'}
        matter="parchemin"
        padding="normal"
      >
        <p className="fiche__bio">
          Le fragment demandé ne correspond à aucun écran du jeu. Les muletiers du Forez diraient
          qu’il faut redescendre au carrefour&#8239;: voici les chemins qui existent vraiment.
        </p>
        <div className="jeu-colonnes">
          {PISTES.map((p) => (
            <Button key={p.fragment} variant="secondaire" onClick={(): void => navigate(p.fragment)}>
              {p.libelle}
            </Button>
          ))}
        </div>
      </Panel>
    </Page>
  );
}
