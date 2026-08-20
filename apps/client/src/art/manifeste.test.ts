import { describe, expect, it } from 'vitest';
import { BUILDINGS, FACTION_IDS, HEROES } from '@auvergne/content';
import { RESOURCE_KEYS } from '@auvergne/engine';

import { MATIERES_BASE, MATIERES_PAYS } from './matiere-sol.js';
import { MAP_ICONS } from './map-icons.js';
import { PROPS } from './props.js';
import { clefAssetBatiment } from '../town/masse.js';
import { PANORAMAS_INEMPLOYES, fondPeintDe } from '../battle/field.js';

/**
 * AUCUNE IMAGE LIVRÉE NE DOIT DORMIR — LA GARDE GÉNÉRALE.
 *
 * Ce piège a mordu **trois fois** dans ce dépôt, et il ne s'annonce jamais :
 *
 *   1. six pinceaux de terrain peints, livrés à la vague 1, n'ont été lus que
 *      par le champ de bataille pendant deux vagues d'images — le sol de la
 *      carte d'aventure, c'est-à-dire cent pour cent de l'écran, n'en employait
 *      aucun ;
 *   2. six panoramas de champ de bataille livrés à la vague 3 dormaient de
 *      même, et la catégorie `combat` n'existait même pas dans le type du
 *      chargeur ;
 *   3. les six matières de PAYS, une fois branchées, ne servaient toujours pas,
 *      parce que le repli sur la matière de base manquait.
 *
 * Chaque fois, rien n'a cassé : le repli procédural prend la place, la capture
 * paraît normale, et l'image payée reste sur le disque. C'est le mode de panne
 * le plus coûteux du pipeline, et le seul remède est un test qui le nomme.
 *
 * **Ce que ce test garde, exactement** : que chaque clef déclarée au manifeste
 * livré corresponde à une clef que le code sait réclamer. Il ne peut pas savoir
 * si l'image est BELLE — cela se juge sur capture — mais il sait dire si elle
 * est CHARGÉE. Les clefs se reconstruisent depuis les mêmes tables que le code
 * emploie, jamais depuis une liste recopiée : c'est la leçon du tableau de bord
 * qui mesurait l'espacement avec sa propre copie de la table.
 */

const MANIFESTES = import.meta.glob('../../public/img/manifeste.json', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

interface Entree {
  clef: string;
  fichier: string;
  categorie: string;
}

function entrees(): Entree[] {
  const [texte] = Object.values(MANIFESTES);
  if (texte === undefined) return [];
  return (JSON.parse(texte) as { entrees: Entree[] }).entrees;
}

/**
 * Toutes les clefs que le client sait réclamer, reconstruites depuis les tables
 * réelles. Une famille absente d'ici est une famille que personne ne charge.
 */
function clefsReclamees(): Set<string> {
  const c = new Set<string>();

  /* Sol de la carte d'aventure et pinceaux du champ de bataille. */
  for (const k of [...MATIERES_BASE, ...MATIERES_PAYS]) c.add(k);

  /* Panoramas de champ de bataille. `fondPeintDe` est la seule source. */
  for (const a of ['sapiniere', 'prairie', 'lande', 'rocher', 'humide', 'cour'] as const) {
    const f = fondPeintDe(a);
    if (f !== null) c.add(f);
  }

  /* Icônes de lieux, plus les jetons de ressource construits à la volée
     (`map-icons.ts` : `if (key.startsWith('ressource_'))`). */
  for (const k of Object.keys(MAP_ICONS)) c.add(k);
  for (const r of RESOURCE_KEYS) c.add(`ressource_${r}`);

  /* Décor semé : une clef par variante déclarée. Une variante livrée au-delà de
     ce que la table déclare ne serait JAMAIS tirée. */
  for (const [k, def] of Object.entries(PROPS)) {
    for (let v = 0; v < def.variantes; v += 1) c.add(`prop_${k}_${v}`);
  }

  /* Bâtiments de cité : la règle est celle de `masse.ts`, pas une copie. */
  for (const id of Object.keys(BUILDINGS)) {
    const k = clefAssetBatiment(id);
    if (k !== null) c.add(k);
  }

  /* Portraits de héros. */
  for (const h of Object.values(HEROES) as { portrait: string }[]) c.add(h.portrait);

  /* Panoramas de cité : trois heures, deux cadrages, par faction. */
  for (const f of FACTION_IDS) {
    for (const h of ['aube', 'midi', 'crepuscule']) {
      c.add(`cite_${f}_${h}`);
      c.add(`cite_${f}_${h}_portrait`);
    }
  }

  /* Fonds de la page d'accueil (`landing/backdrop.ts`). */
  c.add('accueil_paysage');
  c.add('accueil_portrait');

  /* Matières répétables de l'interface (`art/shading.ts`). */
  for (const m of ['granit', 'ecorce', 'ardoise', 'parchemin', 'cuir', 'filDor', 'cuivre', 'tissu']) {
    c.add(`matiere_${m}`);
  }

  return c;
}

describe('le manifeste livré et le code se répondent', () => {
  it('porte des entrées, sinon ce test ne garde rien', () => {
    expect(entrees().length, 'aucun manifeste livré').toBeGreaterThan(100);
  });

  it("ne laisse dormir AUCUNE image livrée", () => {
    /*
     * L'invariant central. Si Codex livre demain une image sous une clef que
     * personne ne réclame — une faute de frappe, une famille inconnue, une
     * variante au-delà de ce que la table déclare —, ce test la nomme.
     *
     * La SEULE échappatoire est `PANORAMAS_INEMPLOYES`, déclarée dans
     * `battle/field.ts` avec sa raison écrite en toutes lettres — et non dans
     * ce test, pour qu'elle vive à côté du code qui aurait dû employer l'image.
     * Une image livrée est une image payée : la faire taire demande de dire
     * pourquoi, à l'endroit où quelqu'un le lira.
     */
    const reclamees = clefsReclamees();
    const orphelines = entrees()
      .filter((e) => !reclamees.has(e.clef))
      .filter((e) => PANORAMAS_INEMPLOYES[e.clef] === undefined)
      .map((e) => `${e.categorie} · ${e.clef} (${e.fichier})`);
    expect(orphelines).toEqual([]);
  });

  it('ne déclare pas deux fois la même clef', () => {
    const vues = new Map<string, number>();
    for (const e of entrees()) vues.set(e.clef, (vues.get(e.clef) ?? 0) + 1);
    const doublons = [...vues].filter(([, n]) => n > 1).map(([k, n]) => `${k} × ${String(n)}`);
    expect(doublons).toEqual([]);
  });

  it("ne réclame aucun fichier hors de l'arborescence servie", () => {
    /* Le chargeur rejette déjà les chemins absolus, les remontées de dossier et
       les URL distantes — mais en silence, avec un simple avertissement. Ici on
       veut que le manifeste soit refusé à la relecture, pas au chargement. */
    for (const e of entrees()) {
      expect(e.fichier.startsWith('/'), e.clef).toBe(false);
      expect(e.fichier.includes('..'), e.clef).toBe(false);
      expect(/^[a-z]+:/i.test(e.fichier), e.clef).toBe(false);
    }
  });
});
