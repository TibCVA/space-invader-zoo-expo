/**
 * LA TOILE PIXI DOIT S'ARRÊTER AU-DESSUS DE LA BARRE DE POUCE.
 *
 * Défaut mesuré sur `shots/combat-audit/combat--iphone.png` et
 * `shots/combat-etat/combat--iphone.png` : la toile finissait à 784 pt, le
 * filet d'or de `.jeu-pouce` commençait juste après, et les six boutons
 * d'action, dessinés dans le bas de la scène, occupaient 786 à 838 pt. Aucun
 * n'était visible. Le `plan.md` déclarait pourtant le défaut corrigé.
 *
 * Le correctif d'alors posait la réserve en `padding-bottom` sur
 * `.jeu-scene`, en écrivant que « son bloc conteneur est la boîte de
 * rembourrage, si bien que ce padding réduit réellement la toile ». La
 * prémisse est juste et la conclusion inverse : le bloc conteneur d'un
 * élément absolument positionné EST la boîte de rembourrage, donc
 * `inset: 0` — c'est-à-dire `bottom: 0` — vise le bord bas de cette boîte,
 * PADDING COMPRIS. La toile s'étalait par-dessus la réserve. `overflow:
 * hidden` découpe lui aussi à cette même boîte : il ne rattrapait rien.
 *
 * Ce test lit la feuille de style, pas une capture : il ne peut pas mesurer
 * des pixels, mais il garde le mécanisme dont la géométrie dépend — la
 * réserve doit atteindre le `bottom` de l'élément absolu lui-même. Le versant
 * géométrie, lui, est gardé par `actions.test.ts`.
 */
import { describe, expect, it } from 'vitest';
/* La feuille se lit sur le disque : Vitest remplace tout import de `.css` par
   un module vide, `?raw` compris. `node:fs` n'est pas dans les types du
   client — le `tsconfig` s'y limite à `vite/client` — d'où l'exception. */
// @ts-expect-error — types Node absents du tsconfig du client, cf. ci-dessus
import { readFileSync } from 'node:fs';

const CSS: string = String(readFileSync(new URL('../styles.css', import.meta.url), 'utf8'));

/** Retire les commentaires : ils parlent de padding, le test ne doit pas. */
function sansCommentaires(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Extrait le corps du bloc `@media` dont l'entête contient `motif`. */
function blocMedia(css: string, motif: string): string {
  const debut = css.indexOf(motif);
  expect(debut, `bloc @media contenant « ${motif} »`).toBeGreaterThanOrEqual(0);
  const ouvrante = css.indexOf('{', debut);
  let profondeur = 0;
  for (let i = ouvrante; i < css.length; i += 1) {
    if (css[i] === '{') profondeur += 1;
    else if (css[i] === '}') {
      profondeur -= 1;
      if (profondeur === 0) return css.slice(ouvrante + 1, i);
    }
  }
  throw new Error(`bloc @media « ${motif} » non refermé`);
}

/** Corps de la première règle dont le sélecteur vaut exactement `selecteur`. */
function regle(css: string, selecteur: string): string | null {
  const rx = new RegExp(
    `(^|[};])\\s*${selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^{}]*)\\}`,
  );
  const m = rx.exec(css);
  return m ? m[2] : null;
}

const NU = sansCommentaires(CSS);
const TELEPHONE = blocMedia(NU, '@media (max-width: 899px)');

describe('réserve de la barre de pouce sur la scène accélérée', () => {
  it('la toile est bien un élément absolu en inset:0 — la prémisse du défaut', () => {
    const corps = regle(NU, '.jeu-scene__toile');
    expect(corps).not.toBeNull();
    expect(corps).toMatch(/position:\s*absolute/);
    expect(corps).toMatch(/inset:\s*0/);
  });

  it('la réserve atteint le bottom de la toile, pas seulement le padding de son parent', () => {
    const corps = regle(NU, '.jeu-scene__toile');
    expect(corps).not.toBeNull();
    /* `inset: 0` seul laisserait la toile courir jusqu'au bord bas de la
       boîte de rembourrage : il lui faut un `bottom` qui retranche la
       réserve, déclaré APRÈS `inset` pour le remporter dans la cascade. */
    const apresInset = /inset:\s*0[^;]*;([\s\S]*)$/.exec(corps ?? '');
    expect(apresInset, 'un bottom déclaré après inset').not.toBeNull();
    expect(apresInset?.[1]).toMatch(/bottom:\s*[^;]*var\(\s*--hmm-reserve-pouce/);
  });

  it('la requête média du téléphone donne à la réserve la hauteur de la barre', () => {
    const corps = regle(TELEPHONE, '.jeu-racine--avec-pouce .jeu-scene');
    expect(corps, 'règle de la scène sous la barre de pouce').not.toBeNull();
    expect(corps).toMatch(/--hmm-reserve-pouce:/);
    /* La barre mesure une cible tactile ample plus la marge de sécurité du
       bas de l'appareil : la réserve doit couvrir les deux. */
    expect(corps).toMatch(/--hmm-touch-ample/);
    expect(corps).toMatch(/--hmm-safe-bas/);
  });

  it('ne réclame plus la réserve en rembourrage, qui n’enlève rien à la toile', () => {
    const corps = regle(TELEPHONE, '.jeu-racine--avec-pouce .jeu-scene') ?? '';
    expect(corps).not.toMatch(/padding-bottom/);
  });

  it('remonte aussi la légende de la scène, posée elle aussi en absolu', () => {
    const corps = regle(TELEPHONE, '.jeu-racine--avec-pouce .jeu-scene__legende');
    expect(corps, 'règle de la légende sous la barre de pouce').not.toBeNull();
    expect(corps).toMatch(/bottom:\s*[^;]*var\(\s*--hmm-reserve-pouce/);
  });

  it('la réserve vaut zéro hors téléphone : rien n’est volé au grand écran', () => {
    const corps = regle(NU, '.jeu-scene');
    expect(corps).not.toBeNull();
    expect(corps).toMatch(/--hmm-reserve-pouce:\s*0px/);
  });
});
