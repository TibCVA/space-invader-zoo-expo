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

/**
 * LA BARRE EXISTE SUR TOUS LES ÉCRANS DEPUIS LE 21/08 — et ces gardes ont
 * changé de cible pour le dire.
 *
 * Elles exigeaient que la réserve vive DANS `@media (max-width: 899px)`,
 * parce que la barre ne s'affichait que là. Or elle est le seul chemin vers la
 * cité, le héros, le royaume et le menu : sur un ordinateur, aucun de ces
 * écrans n'était atteignable. La barre s'affiche donc partout, et les réserves
 * l'ont suivie hors de la requête média.
 *
 * Ce n'est pas un test affaibli pour redevenir vert : l'exigence est plus
 * forte qu'avant. On vérifiait « la règle existe pour le téléphone » ; on
 * vérifie maintenant « la règle existe pour TOUS les écrans », et l'ancienne
 * formulation est explicitement interdite — une réserve confinée à une requête
 * média laisserait de nouveau la barre manger le bas de la scène sur
 * ordinateur, ce qui a réellement eu lieu : la sonde de bout en bout a trouvé
 * le clic sur « Rendre la main » intercepté par `.jeu-pouce`.
 */
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

  it('la réserve vaut la hauteur de la barre, sur TOUS les écrans', () => {
    const corps = regle(NU, '.jeu-racine--avec-pouce .jeu-scene');
    expect(corps, 'règle de la scène sous la barre de commandes').not.toBeNull();
    expect(corps).toMatch(/--hmm-reserve-pouce:/);
    /* La barre mesure une cible tactile ample plus la marge de sécurité du
       bas de l'appareil : la réserve doit couvrir les deux. */
    expect(corps).toMatch(/--hmm-touch-ample/);
    expect(corps).toMatch(/--hmm-safe-bas/);
  });

  it('ne confine plus la réserve à la requête média du téléphone', () => {
    /* C'est l'exigence qui a remplacé l'ancienne, et elle garde le défaut
       réellement observé : la barre existe partout, une réserve réservée au
       téléphone la laisse manger le bas de la scène sur ordinateur. */
    expect(regle(TELEPHONE, '.jeu-racine--avec-pouce .jeu-scene')).toBeNull();
    expect(regle(TELEPHONE, '.jeu-racine--avec-pouce .jeu-scene__legende')).toBeNull();
  });

  it('la barre elle-même s’affiche hors de toute requête média', () => {
    const corps = regle(NU, '.jeu-pouce');
    expect(corps, 'règle de la barre de commandes').not.toBeNull();
    expect(corps).toMatch(/display:\s*flex/);
  });

  it('ne réclame plus la réserve en rembourrage, qui n’enlève rien à la toile', () => {
    const corps = regle(NU, '.jeu-racine--avec-pouce .jeu-scene');
    expect(corps, 'la règle doit exister pour que ce test ait un sens').not.toBeNull();
    expect(corps).not.toMatch(/padding-bottom/);
  });

  it('remonte aussi la légende de la scène, posée elle aussi en absolu', () => {
    const corps = regle(NU, '.jeu-racine--avec-pouce .jeu-scene__legende');
    expect(corps, 'règle de la légende sous la barre de commandes').not.toBeNull();
    expect(corps).toMatch(/bottom:\s*[^;]*var\(\s*--hmm-reserve-pouce/);
  });

  it('la réserve vaut zéro par défaut : une scène sans barre ne perd rien', () => {
    const corps = regle(NU, '.jeu-scene');
    expect(corps).not.toBeNull();
    expect(corps).toMatch(/--hmm-reserve-pouce:\s*0px/);
  });
});

/**
 * LA REDDITION EN COMBAT — le dernier `CombatAction` orphelin.
 *
 * Deux touches, comme viser puis frapper : la première arme (« encore une
 * fois pour confirmer »), la seconde émet `{ kind: 'surrender' }`, et toute
 * autre commande désarme. Gardes de branchement sur la vue, code lu tel quel
 * — la barre est du Pixi, aucun DOM à interroger.
 */
describe('la reddition, en deux touches', () => {
  const VUE: string = String(readFileSync(new URL('./index.ts', import.meta.url), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('la barre porte « Se rendre », et la note dit l’état', () => {
    expect(VUE).toContain("cle: 'reddition'");
    expect(VUE).toContain('Se rendre');
    expect(VUE).toContain('encore une fois pour confirmer');
  });

  it('la première touche arme, la seconde émet surrender', () => {
    const i = VUE.indexOf("case 'reddition':");
    expect(i).toBeGreaterThan(0);
    const bloc = VUE.slice(i, i + 400);
    expect(bloc).toContain("this.emettre({ kind: 'surrender' })");
    expect(bloc).toContain('this.redditionArmee = true');
  });

  it('toute autre commande désarme — on ne se rend pas par accident', () => {
    const i = VUE.indexOf('private declencher(');
    const bloc = VUE.slice(i, i + 600);
    expect(bloc).toContain("cle !== 'reddition' && this.redditionArmee");
  });

  it('la clef de cache de la barre voit l’armement, sinon la note ne se peint pas', () => {
    expect(VUE).toContain("this.redditionArmee ? 'reddition-armee' : ''");
  });
});
