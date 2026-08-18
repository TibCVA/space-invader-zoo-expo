/**
 * `#/diagnostic` — ce que la machine du joueur sait faire, et ce qu'elle rate.
 *
 * Pourquoi cet écran existe. Le jeu est arrivé sur un iPhone où la carte
 * n'affichait rien du tout et la cité deux aplats. Ici, dans un conteneur sans
 * carte graphique et sans Safari, rien de tout cela ne se reproduit : Chromium
 * y rend en logiciel, et WebKit n'y est pas. On ne peut donc pas déboguer à
 * l'aveugle — il faut demander à l'appareil lui-même.
 *
 * Cette page ne dépend d'aucun des mécanismes qu'elle interroge : pas d'atlas,
 * pas de vue impérative, pas de partie chargée. Elle monte son propre petit
 * rendu, lui demande trois choses élémentaires, **relit les pixels obtenus** et
 * dit lesquelles ont réussi. Une capture d'écran de cette page suffit à savoir
 * si le défaut est dans le choix du moteur de rendu, dans les textures, dans
 * les filtres, ou ailleurs.
 *
 * Les épreuves, dans l'ordre où elles s'enchaînent — de la plus élémentaire à
 * la plus proche de ce que le jeu demande vraiment :
 *
 *  1. **un aplat** — le moteur sait-il remplir un triangle ? Si cela échoue,
 *     rien ne marchera ;
 *  2. **une texture** — sait-il téléverser une image et la dessiner ? C'est ce
 *     qui manque quand on voit des formes mais aucune matière ;
 *  3. **un filtre** — sait-il exécuter un programme de post-traitement ? La
 *     carte d'aventure en applique un sur toute la scène ; s'il échoue, elle
 *     est noire alors que les écrans sans filtre restent visibles.
 */

import { useEffect, useState, type ReactElement } from 'react';
import { Bandeau } from './shell.js';
import { rapportAssets } from '../art/assets.js';
import { obtenirAtlas, preferenceRendu, resolutionEcran } from '../boot.js';

/* ══════════════════════════════ Le relevé ════════════════════════════════ */

interface Epreuve {
  readonly nom: string;
  readonly reussie: boolean;
  readonly detail: string;
}

interface Releve {
  readonly moteur: string;
  readonly lignes: readonly (readonly [string, string])[];
  readonly epreuves: readonly Epreuve[];
  readonly panne: string | null;
}

/** Couleur d'un pixel, en hexadécimal, pour l'afficher tel quel. */
function hex(r: number, g: number, b: number): string {
  const n = (v: number): string => v.toString(16).padStart(2, '0');
  return `#${n(r)}${n(g)}${n(b)}`;
}

/**
 * Monte un rendu jetable, lui fait passer les trois épreuves, relit les pixels
 * et le détruit. Ne lève jamais : une panne est un résultat, pas une erreur.
 */
async function releverLaMachine(): Promise<Releve> {
  const lignes: [string, string][] = [];
  const epreuves: Epreuve[] = [];

  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  lignes.push(['Appareil', navigator.userAgent]);
  lignes.push(['Densité de pixels', String(dpr)]);
  lignes.push([
    'Fenêtre',
    `${String(Math.round(window.innerWidth))} × ${String(Math.round(window.innerHeight))} px`,
  ]);
  lignes.push(['WebGPU annoncé par le navigateur', 'gpu' in navigator ? 'oui' : 'non']);
  lignes.push(['Moteur que le jeu demande', preferenceRendu()]);
  lignes.push(['Résolution de rendu retenue', String(resolutionEcran())]);

  /* Ce que le navigateur consent à donner en WebGL, avant toute bibliothèque. */
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      lignes.push(['WebGL', c.getContext('webgl2') ? 'version 2' : 'version 1']);
      lignes.push(['Texture maximale', `${String(gl.getParameter(gl.MAX_TEXTURE_SIZE))} px`]);
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      if (info) {
        lignes.push(['Carte graphique', String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))]);
      }
    } else {
      lignes.push(['WebGL', 'indisponible']);
    }
  } catch (cause) {
    lignes.push(['WebGL', `refusé (${String(cause).slice(0, 80)})`]);
  }

  let moteur = 'non ouvert';
  let panne: string | null = null;

  try {
    const pixi = await import('pixi.js');
    const { Application, Graphics, RenderTexture, Sprite, Texture, Container, ColorMatrixFilter } = pixi;

    const app = new Application();
    await app.init({
      /* La même préférence que le jeu, sinon on éprouverait autre chose que lui. */
      preference: preferenceRendu(),
      antialias: false,
      backgroundAlpha: 1,
      background: 0x101418,
      resolution: 1,
      width: 120,
      height: 120,
    });
    moteur = (app.renderer as unknown as { name?: string }).name ?? 'inconnu';
    lignes.push(['Moteur retenu par PixiJS', moteur]);
    app.ticker.stop();

    /** Relit un pixel du canevas après un rendu. */
    const lire = (x: number, y: number): [number, number, number] => {
      const c = document.createElement('canvas');
      c.width = 120;
      c.height = 120;
      const ctx = c.getContext('2d');
      if (!ctx) return [0, 0, 0];
      ctx.drawImage(app.canvas as CanvasImageSource, 0, 0);
      const d = ctx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2]];
    };

    /* — 1. un aplat — */
    const carre = new Graphics().rect(10, 10, 100, 100).fill(0xc9a227);
    app.stage.addChild(carre);
    app.render();
    {
      const [r, g, b] = lire(60, 60);
      const attendu = r > 120 && g > 90 && b < 110;
      epreuves.push({
        nom: 'Remplir une forme',
        reussie: attendu,
        detail: `pixel central ${hex(r, g, b)}, attendu proche de #c9a227`,
      });
    }
    app.stage.removeChildren();

    /* — 2. une texture — */
    const damier = document.createElement('canvas');
    damier.width = 8;
    damier.height = 8;
    const dctx = damier.getContext('2d');
    if (dctx) {
      dctx.fillStyle = '#e8dcc0';
      dctx.fillRect(0, 0, 8, 8);
      dctx.fillStyle = '#6e1f2a';
      dctx.fillRect(0, 0, 4, 4);
      dctx.fillRect(4, 4, 4, 4);
    }
    const texture = Texture.from(damier);
    const sprite = new Sprite(texture);
    sprite.width = 120;
    sprite.height = 120;
    app.stage.addChild(sprite);
    app.render();
    {
      /* Le damier fait 8 px de côté et deux quadrants : étiré à 120, chaque
         quadrant couvre 60 px. On lit donc un point bien à l'intérieur de
         chacun — le quart sombre en haut à gauche, le quart clair en haut à
         droite — et l'on exige **les deux** : un seul point ne distinguerait
         pas une texture d'un aplat de la bonne couleur. */
      const [rs, gs, bs] = lire(20, 20);
      const [rc, gc, bc] = lire(96, 20);
      const sombreJuste = rs > 80 && rs < 150 && gs < 90 && bs < 90;
      const clairJuste = rc > 170 && gc > 150 && bc > 120;
      epreuves.push({
        nom: 'Dessiner une texture',
        reussie: sombreJuste && clairJuste,
        detail:
          `case sombre ${hex(rs, gs, bs)} (attendue proche de #6e1f2a), ` +
          `case claire ${hex(rc, gc, bc)} (attendue proche de #e8dcc0)`,
      });
    }
    app.stage.removeChildren();

    /* — 3. un filtre — */
    try {
      const fond = new Container();
      const plein = new Graphics().rect(0, 0, 120, 120).fill(0x808080);
      fond.addChild(plein);
      const filtre = new ColorMatrixFilter();
      filtre.tint(0xff0000, false);
      fond.filters = [filtre];
      app.stage.addChild(fond);
      app.render();
      const [r, g, b] = lire(60, 60);
      /* Une teinte rouge posée sur un gris moyen doit laisser du rouge et
         presque plus de bleu. Si le filtre n'a pas tourné, on relit le gris. */
      const teinte = r > g + 24 && r > b + 24;
      epreuves.push({
        nom: 'Exécuter un filtre',
        reussie: teinte,
        detail: teinte
          ? `teinte appliquée ${hex(r, g, b)}`
          : `pixel ${hex(r, g, b)} — le filtre n'a rien changé, le gris est resté gris`,
      });
      app.stage.removeChildren();
    } catch (cause) {
      epreuves.push({
        nom: 'Exécuter un filtre',
        reussie: false,
        detail: `refusé : ${String(cause).slice(0, 120)}`,
      });
    }

    /* — 4. une grande page d'atlas — */
    /* Les pages de l'atlas font 2048 px. Sur un téléphone, c'est la première
       allocation qui peut être refusée en silence : on la demande ici, seule,
       pour savoir si le mur est là. */
    try {
      const cible = RenderTexture.create({ width: 2048, height: 2048, resolution: 1 });
      const marque = new Graphics().rect(0, 0, 2048, 2048).fill(0x3f7d4a);
      app.renderer.render({ container: marque, target: cible, clear: true });
      marque.destroy();
      const relu = app.renderer.extract.pixels(cible);
      const px = relu.pixels;
      const vert = px[1] > 80 && px[0] < 120;
      cible.destroy(true);
      epreuves.push({
        nom: 'Peindre une page de 2048 px',
        reussie: vert,
        detail: vert
          ? 'la page est allouée et relue'
          : `page allouée mais relue en ${hex(px[0], px[1], px[2])} au lieu d'un vert`,
      });
    } catch (cause) {
      epreuves.push({
        nom: 'Peindre une page de 2048 px',
        reussie: false,
        detail: `refusée : ${String(cause).slice(0, 140)}`,
      });
    }

    app.destroy(true, { children: true });
  } catch (cause) {
    panne = String(cause).slice(0, 300);
  }

  /* — 5. l'atlas complet, celui dont la carte ne peut pas se passer — */
  /* C'est le seul mécanisme lourd que cette page ne testait pas, et c'est
     précisément celui dont dépendent la carte, les cités et le combat. Sur un
     appareil où les quatre épreuves ci-dessus passent et où la carte reste
     vide, c'est ici que la réponse se trouve. */
  const debutAtlas = Date.now();
  try {
    const atlas = await obtenirAtlas();
    const duree = Date.now() - debutAtlas;
    const stats = atlas.stats;
    epreuves.push({
      nom: 'Construire la planche d’art',
      reussie: stats.entrees > 0 && stats.pages > 0,
      detail: `${String(stats.entrees)} vignettes sur ${String(stats.pages)} page(s), en ${String(duree)} ms`,
    });
  } catch (cause) {
    epreuves.push({
      nom: 'Construire la planche d’art',
      reussie: false,
      detail: `échouée après ${String(Date.now() - debutAtlas)} ms : ${String(cause).slice(0, 160)}`,
    });
  }

  /* Les images générées : combien sont arrivées, et pourquoi les autres non. */
  const assets = rapportAssets();
  if (assets) {
    lignes.push(['Images peintes chargées', `${String(assets.charges)} en ${String(assets.dureeMs)} ms`]);
    if (assets.ignores.length > 0) {
      lignes.push([
        'Images abandonnées',
        assets.ignores
          .slice(0, 6)
          .map((i) => `${i.clef} (${i.raison})`)
          .join(' · '),
      ]);
    }
  } else {
    lignes.push(['Images peintes', 'aucun relevé — le chargement n’a pas encore eu lieu']);
  }

  return { moteur, lignes, epreuves, panne };
}

/* ═══════════════════════════════ L'écran ═════════════════════════════════ */

export function EcranDiagnostic(): ReactElement {
  const [releve, setReleve] = useState<Releve | null>(null);

  useEffect(() => {
    let vivant = true;
    void releverLaMachine().then((r) => {
      if (vivant) setReleve(r);
    });
    return () => {
      vivant = false;
    };
  }, []);

  const echecs = releve ? releve.epreuves.filter((e) => !e.reussie) : [];

  return (
    <>
      <Bandeau titre="Diagnostic" note="À montrer en capture d’écran" />
      <div className="jeu-page diagnostic">
        <p className="ecran__note">
          Cette page interroge votre appareil directement. Elle n’a besoin ni d’une partie chargée,
          ni de l’atlas : si le jeu ne s’affiche pas, elle, elle s’affiche.
        </p>

        {releve === null ? (
          <p className="ecran__note">On interroge la machine…</p>
        ) : (
          <>
            {releve.panne ? (
              <p className="ecran__note" role="alert">
                <strong>Le moteur de rendu n’a pas pu s’ouvrir.</strong> {releve.panne}
              </p>
            ) : null}

            <h3 className="ecran__titre-carte diagnostic__titre">Les épreuves</h3>
            <ul className="diagnostic__epreuves">
              {releve.epreuves.map((e) => (
                <li key={e.nom} className={e.reussie ? 'diagnostic__ok' : 'diagnostic__echec'}>
                  <strong>
                    {e.reussie ? '✓' : '✗'} {e.nom}
                  </strong>
                  <span>{e.detail}</span>
                </li>
              ))}
            </ul>

            {echecs.length > 0 ? (
              <p className="ecran__note" role="status">
                <strong>Lecture.</strong>{' '}
                {echecs.some((e) => e.nom === 'Remplir une forme')
                  ? 'Le moteur ne dessine rien du tout : c’est le choix du moteur de rendu qui est en cause.'
                  : echecs.some((e) => e.nom === 'Dessiner une texture')
                    ? 'Les formes passent mais les textures non : les créatures, les décors et les fonds peints manqueront.'
                    : echecs.some((e) => e.nom === 'Exécuter un filtre')
                      ? 'Les formes et les textures passent, mais pas les filtres : la carte d’aventure, qui en applique un sur toute la scène, restera vide alors que les autres écrans s’affichent.'
                      : echecs.some((e) => e.nom.startsWith('Peindre une page'))
                        ? 'Le dessin élémentaire passe, mais pas une page de 2048 px : l’appareil refuse les grandes textures, et la planche d’art ne peut pas être assemblée.'
                        : 'Tout le dessin élémentaire passe, mais la planche d’art ne se construit pas : c’est elle qui manque à la carte, aux cités et au combat.'}
              </p>
            ) : null}

            <h3 className="ecran__titre-carte diagnostic__titre">Ce que dit l’appareil</h3>
            <dl className="diagnostic__releve">
              {releve.lignes.map(([cle, valeur]) => (
                <div key={cle}>
                  <dt>{cle}</dt>
                  <dd>{valeur}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
    </>
  );
}
