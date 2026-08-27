/**
 * LA GARNISON EN VIGNETTE — « quand on ouvre la ville, on doit directement
 * voir les troupes déjà créées dans une vignette permanente jolie »
 * (demande du propriétaire).
 *
 * C'est la barre de garnison de HMM3, posée sur le tableau de la cité :
 * chaque pile en DESSIN PEINT avec son effectif, la troupe du héros en
 * visite en seconde rangée. Permanente : elle ne dépend d'aucun onglet ;
 * seul le panneau de commandes passe par-dessus quand on l'ouvre.
 *
 * Aucune règle ici : les piles viennent de l'état, les images du même
 * `vignetteCreature` que l'onglet Recruter — ce qu'on voit est ce qu'on a.
 */
import { useEffect, useState, type ReactElement } from 'react';
import type { ArmyStack, CreatureId, GameState, TownState } from '@auvergne/engine';
import { CREATURES, HEROES } from '@auvergne/content';
import { vignetteCreature } from '../art/vignette.js';
import { nombre } from './format.js';

function ImageCreature({ id }: { id: CreatureId }): ReactElement {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    void vignetteCreature(id).then((src) => {
      if (vivant) setImage(src);
    });
    return () => {
      vivant = false;
    };
  }, [id]);
  return (
    <span className="garnison__image" aria-hidden="true">
      {image ? <img src={image} alt="" loading="lazy" decoding="async" /> : null}
    </span>
  );
}

function Rangee({
  titre,
  piles,
}: {
  titre: string;
  piles: readonly (ArmyStack | null)[];
}): ReactElement | null {
  const pleines = piles.filter((p): p is ArmyStack => p !== null && p.count > 0);
  if (pleines.length === 0) return null;
  return (
    <div className="garnison__rangee">
      <span className="garnison__titre">{titre}</span>
      <ul className="garnison__piles">
        {pleines.map((p, i) => (
          <li
            key={`${p.creature}-${String(i)}`}
            className="garnison__pile"
            title={CREATURES[p.creature]?.namePlural ?? p.creature}
          >
            <ImageCreature id={p.creature} />
            <span className="garnison__nombre jeu-tabulaire">{nombre(p.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface VignetteGarnisonProps {
  game: GameState;
  town: TownState;
}

/** La vignette permanente des troupes de la cité. */
export function VignetteGarnison({ game, town }: VignetteGarnisonProps): ReactElement {
  const visiteur = town.visitingHero ? game.heroes[town.visitingHero] : null;
  const gardeVide = town.garrison.every((p) => p === null || p.count <= 0);
  const visiteVide =
    !visiteur || visiteur.army.every((p) => p === null || p.count <= 0);
  return (
    <div className="garnison" aria-label="Troupes de la cité">
      {gardeVide && visiteVide ? (
        <p className="garnison__vide">Aucune troupe ne tient la place.</p>
      ) : null}
      <Rangee titre="Garnison" piles={town.garrison} />
      {visiteur ? (
        <Rangee
          titre={`${HEROES[visiteur.def]?.name ?? 'Héros'} en visite`}
          piles={visiteur.army}
        />
      ) : null}
    </div>
  );
}
