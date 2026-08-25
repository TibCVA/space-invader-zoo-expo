/**
 * LE PANNEAU DE LA CITÉ — bâtir et recruter.
 *
 * L'écran de cité était une belle peinture sur laquelle on ne pouvait rien
 * faire : `BuildInTown` et `RecruitCreatures` n'étaient émises par aucun chemin
 * de l'interface. Le raisonnement, les mesures et toutes les décisions sont
 * dans `cite-offres.ts` — ce fichier-ci ne fait que les mettre en page.
 *
 * Deux onglets plutôt qu'un clic sur la maquette : sur un iPhone, viser un
 * emplacement de bâtiment large de trente pixels dans un tableau en perspective
 * n'est pas un geste, c'est une loterie. Les emplacements restent cliquables —
 * ils ouvrent le même panneau — mais ils ne sont plus le SEUL chemin.
 */

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { BuildingId, CreatureId, GameState, HeroId, ResourceKey, TownState } from '@auvergne/engine';
import { Button, HeroAvatar, Panel } from '@auvergne/ui';
import { dispatch } from '../state/store.js';
import { vignetteCreature } from '../art/vignette.js';
import { nombre } from './format.js';
import {
  destinataireRecrues,
  offresAmelioration,
  offresBatiments,
  offresRecrues,
  apercuEchange,
  marcheOuvert,
  minimumUtile,
  taverneDe,
  type OffreAmelioration,
  type OffreBatiment,
  type OffreRecrue,
  type OffreTaverne,
} from './cite-offres.js';

const NOMS_RESSOURCES: Readonly<Record<string, string>> = {
  ecus: 'écus',
  bois: 'bois',
  granit: 'granit',
  fer: 'fer',
  sel: 'sel',
  essence: 'essence',
  filDor: 'fil d’or',
};

/** « 2 500 écus · 10 bois » — le coût en toutes lettres, jamais en icônes seules. */
function ecrireCout(cout: Partial<Record<string, number>>): string {
  const morceaux: string[] = [];
  for (const [clef, valeur] of Object.entries(cout)) {
    if (!valeur) continue;
    morceaux.push(`${nombre(valeur)} ${NOMS_RESSOURCES[clef] ?? clef}`);
  }
  return morceaux.length ? morceaux.join(' · ') : 'gratuit';
}

function LigneBatiment({ offre, town }: { offre: OffreBatiment; town: TownState }): ReactElement {
  return (
    <li className="cite-cmd__ligne cite-cmd__ligne--bati">
      <div className="cite-cmd__texte">
        <p className="cite-cmd__nom">{offre.nom}</p>
        <p className="cite-cmd__detail">{ecrireCout(offre.cout)}</p>
        {/* Le refus du moteur est affiché tel quel : il est déjà en français et
            il dit précisément ce qui manque. Le reformuler ici le ferait mentir
            le jour où une règle change. */}
        {offre.refus ? <p className="cite-cmd__refus">{offre.refus}</p> : null}
      </div>
      <Button
        variant={offre.possible ? 'principal' : 'fantome'}
        disabled={!offre.possible}
        onClick={(): void => {
          dispatch({ type: 'BuildInTown', town: town.uid, building: offre.id as BuildingId });
        }}
      >
        Bâtir
      </Button>
    </li>
  );
}

/**
 * La vignette de la créature, extraite de l'atlas.
 *
 * Elle arrive après coup : l'extraction demande le rendu partagé, qui n'est
 * prêt qu'une fois la scène montée. On réserve donc sa place tout de suite —
 * un cadre vide plutôt qu'une ligne qui saute quand l'image arrive.
 */
function VignetteRecrue({ id }: { id: CreatureId }): ReactElement {
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
    <span className="cite-cmd__vignette" aria-hidden="true">
      {image ? <img src={image} alt="" loading="lazy" decoding="async" /> : null}
    </span>
  );
}

function LigneRecrue({ offre, town }: { offre: OffreRecrue; town: TownState }): ReactElement {
  const [nb, setNb] = useState(0);
  /* La quantité par défaut est le maximum abordable : c'est le geste de HMM3,
     où l'on prend toute la portée de la semaine neuf fois sur dix. Le joueur
     peut redescendre ; il n'a rien à faire pour le cas courant. */
  const voulu = nb === 0 ? offre.abordables : Math.min(nb, offre.abordables);
  const vers = destinataireRecrues(town);

  return (
    <li className="cite-cmd__ligne">
      <VignetteRecrue id={offre.id} />
      <div className="cite-cmd__texte">
        <p className="cite-cmd__nom">
          {offre.nomPluriel} <span className="cite-cmd__rang">rang {offre.rang}</span>
        </p>
        <p className="cite-cmd__detail">
          {offre.disponibles} disponible{offre.disponibles > 1 ? 's' : ''} ·{' '}
          {ecrireCout(offre.coutUnitaire)} l’unité
        </p>
        {/* Ce qu'on achète, en quatre nombres, et d'où elles sortent. Sans
            cela, la liste ne dit ni ce que vaut la bête, ni quel bâtiment l'a
            fait naître — les deux manques signalés par le propriétaire. */}
        {/* Des mots, pas des pictogrammes : ⚔ ⛨ ♥ ↦ ne sont pas dans les fontes
            du jeu et se rendaient en glyphes de secours, illisibles à onze
            pixels. Trois lettres tiennent la même place et ne dépendent de
            rien. */}
        <p className="cite-cmd__stats jeu-tabulaire">
          <span title="Attaque">Att {offre.attaque}</span>
          <span title="Défense">Déf {offre.defense}</span>
          <span title="Points de vie">PV {offre.vie}</span>
          <span title="Dégâts par créature">
            Dég {offre.degats.min}–{offre.degats.max}
          </span>
          <span title="Vitesse sur le champ de bataille">Vit {offre.vitesse}</span>
        </p>
        {offre.demeure ? <p className="cite-cmd__demeure">{offre.demeure}</p> : null}
        {offre.disponibles > 0 && offre.abordables === 0 ? (
          <p className="cite-cmd__refus">Le trésor ne suffit pas pour une seule recrue.</p>
        ) : null}
      </div>
      <div className="cite-cmd__prise">
        <label className="hmm-invisible" htmlFor={`recrue-${offre.id}`}>
          Nombre de {offre.nomPluriel} à recruter
        </label>
        <input
          id={`recrue-${offre.id}`}
          className="cite-cmd__nombre jeu-tabulaire"
          type="number"
          min={0}
          max={offre.abordables}
          value={voulu}
          disabled={offre.abordables === 0}
          onChange={(e): void => setNb(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        />
        <Button
          variant="principal"
          disabled={offre.abordables === 0 || voulu <= 0}
          onClick={(): void => {
            dispatch({
              type: 'RecruitCreatures',
              town: town.uid,
              creature: offre.id as CreatureId,
              count: voulu,
              ...(vers ? { toHero: vers } : {}),
            });
            setNb(0);
          }}
        >
          Recruter
        </Button>
      </div>
    </li>
  );
}

/**
 * UNE PROMOTION — la ligne « Manants → Francs-Manants » de l'onglet Recruter.
 *
 * Mesuré avant le correctif : `UpgradeCreatures` n'était émis nulle part. Les
 * bâtiments d'amélioration se levaient, et les créatures restaient au rang de
 * base pour toujours — dans HMM3, promouvoir sa semaine de recrues est un
 * rendez-vous hebdomadaire.
 *
 * La vignette montre la bête AMÉLIORÉE : c'est elle qu'on achète. Le nombre
 * par défaut est le maximum abordable, comme au recrutement.
 */
function LignePromotion({ offre, town }: { offre: OffreAmelioration; town: TownState }): ReactElement {
  const [nb, setNb] = useState(0);
  const voulu = nb === 0 ? offre.abordables : Math.min(nb, offre.abordables);

  return (
    <li className="cite-cmd__ligne">
      <VignetteRecrue id={offre.vers} />
      <div className="cite-cmd__texte">
        <p className="cite-cmd__nom">
          {offre.nomDe} <span className="cite-cmd__vers-fleche">→</span> {offre.nomVers}
        </p>
        <p className="cite-cmd__detail">
          {offre.presentes} présente{offre.presentes > 1 ? 's' : ''} à la cité ·{' '}
          {ecrireCout(offre.coutUnitaire)} l’unité
        </p>
        {offre.gain ? <p className="cite-cmd__stats jeu-tabulaire">{offre.gain}</p> : null}
        {offre.abordables === 0 ? (
          <p className="cite-cmd__refus">Le trésor ne suffit pas pour une seule promotion.</p>
        ) : null}
      </div>
      <div className="cite-cmd__prise">
        <label className="hmm-invisible" htmlFor={`promotion-${offre.de}`}>
          Nombre de {offre.nomDe} à élever
        </label>
        <input
          id={`promotion-${offre.de}`}
          className="cite-cmd__nombre jeu-tabulaire"
          type="number"
          min={0}
          max={offre.abordables}
          value={voulu}
          disabled={offre.abordables === 0}
          onChange={(e): void => setNb(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        />
        <Button
          variant="principal"
          disabled={offre.abordables === 0 || voulu <= 0}
          onClick={(): void => {
            dispatch({
              type: 'UpgradeCreatures',
              town: town.uid,
              from: offre.de,
              count: voulu,
            });
            setNb(0);
          }}
        >
          Élever
        </Button>
      </div>
    </li>
  );
}

/**
 * UN CAPITAINE DE PASSAGE — la ligne de l'onglet Auberge.
 *
 * Le portrait est celui de la fiche (`HeroAvatar`, même source que le salon) ;
 * la ligne dit sa classe, sa spécialité, ses quatre caractéristiques et la
 * troupe qu'il amène — ce que HMM3 montre dans sa taverne, dans le même
 * ordre : on choisit d'abord un métier, ensuite une escorte.
 */
function LigneTaverne({
  offre,
  town,
  refus,
}: {
  offre: OffreTaverne;
  town: TownState;
  refus: string | null;
}): ReactElement {
  return (
    <li className="cite-cmd__ligne">
      <span className="cite-cmd__vignette" aria-hidden="true">
        <HeroAvatar heroId={offre.id} size={64} />
      </span>
      <div className="cite-cmd__texte">
        <p className="cite-cmd__nom">
          {offre.nom} <span className="cite-cmd__rang">{offre.classe}</span>
        </p>
        <p className="cite-cmd__detail">{offre.titre}</p>
        <p className="cite-cmd__stats jeu-tabulaire">{offre.caracteristiques}</p>
        {offre.armee ? <p className="cite-cmd__demeure">Arrive avec {offre.armee}</p> : null}
      </div>
      <div className="cite-cmd__prise">
        <Button
          variant="principal"
          disabled={refus !== null}
          onClick={(): void => {
            dispatch({ type: 'HireHero', town: town.uid, hero: offre.id as HeroId });
          }}
        >
          Engager
        </Button>
      </div>
    </li>
  );
}

/** Les sept ressources, dans l'ordre du bandeau. */
const RESSOURCES: readonly ResourceKey[] = [
  'ecus',
  'bois',
  'granit',
  'fer',
  'sel',
  'essence',
  'filDor',
];

/**
 * LE COMPTOIR DU MARCHÉ — `TradeResources` n'était émis nulle part.
 *
 * Une bannière riche en bois et pauvre en fer restait bloquée devant sa
 * forge : dans HMM3 le marché est la soupape de toute l'économie. Deux
 * choix, une quantité, et l'aperçu du change AVANT de céder quoi que ce
 * soit — chaque aperçu est un appel à `tradeOutcome`, la fonction même que
 * le moteur consulte, donc ce qui s'affiche est ce qui se paie.
 */
function ComptoirMarche({ game, town }: { game: GameState; town: TownState }): ReactElement {
  const [cede, setCede] = useState<ResourceKey>('bois');
  const [recoit, setRecoit] = useState<ResourceKey>('ecus');
  const [brut, setBrut] = useState('');
  const joueur = town.owner;

  if (!joueur) return <p className="cite-cmd__vide">Cette cité n’a pas de bannière.</p>;

  const bourse = game.players[joueur].resources[cede] | 0;
  const appel = minimumUtile(game, joueur, cede, recoit);
  const quantite = brut.trim() === '' ? (appel ?? 0) : Math.max(0, Math.trunc(Number(brut) || 0));
  const apercu = quantite > 0 ? apercuEchange(game, joueur, cede, quantite, recoit) : null;

  return (
    <>
      <p className="cite-cmd__vers">
        On cède d’une main, on reçoit de l’autre — le change s’affiche avant de conclure.
      </p>
      <div className="cite-cmd__marche">
        <label className="cite-cmd__marche-choix">
          Céder
          <select
            className="cite-cmd__choix"
            value={cede}
            onChange={(e): void => setCede(e.target.value as ResourceKey)}
          >
            {RESSOURCES.map((r) => (
              <option key={r} value={r}>
                {NOMS_RESSOURCES[r] ?? r}
              </option>
            ))}
          </select>
        </label>
        <label className="cite-cmd__marche-choix">
          Quantité
          <input
            className="cite-cmd__nombre jeu-tabulaire"
            type="text"
            inputMode="numeric"
            value={quantite === 0 ? '' : String(quantite)}
            aria-label={`Quantité de ${NOMS_RESSOURCES[cede] ?? cede} à céder, sur ${nombre(bourse)}`}
            onChange={(e): void => setBrut(e.target.value)}
          />
        </label>
        <label className="cite-cmd__marche-choix">
          Recevoir
          <select
            className="cite-cmd__choix"
            value={recoit}
            onChange={(e): void => setRecoit(e.target.value as ResourceKey)}
          >
            {RESSOURCES.map((r) => (
              <option key={r} value={r}>
                {NOMS_RESSOURCES[r] ?? r}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="cite-cmd__detail">
        Réserves : {nombre(bourse)} {NOMS_RESSOURCES[cede] ?? cede}
        {appel !== null
          ? ` · à partir de ${nombre(appel)} ${NOMS_RESSOURCES[cede] ?? cede} cédé${appel > 1 ? 's' : ''}`
          : ''}
      </p>
      {apercu ? (
        apercu.ok ? (
          <p className="cite-cmd__stats jeu-tabulaire">
            {nombre(quantite)} {NOMS_RESSOURCES[cede] ?? cede} → {nombre(apercu.recu)}{' '}
            {NOMS_RESSOURCES[recoit] ?? recoit}
          </p>
        ) : (
          <p className="cite-cmd__refus">{apercu.raison}</p>
        )
      ) : null}
      <div className="cite-cmd__prise">
        <Button
          variant="principal"
          disabled={!apercu || !apercu.ok}
          onClick={(): void => {
            dispatch({
              type: 'TradeResources',
              give: cede,
              giveAmount: quantite,
              take: recoit,
            });
            setBrut('');
          }}
        >
          Conclure l’échange
        </Button>
      </div>
    </>
  );
}

export interface PanneauCiteProps {
  game: GameState;
  town: TownState;
  /**
   * L'onglet à ouvrir. Toucher une DEMEURE ouvre « Recruter », toucher un
   * emplacement vide ouvre « Bâtir » : le panneau répond à ce qu'on a désigné
   * plutôt que de commencer toujours au même endroit, ce qui obligeait à
   * changer d'onglet à la main une fois sur deux.
   */
  ongletInitial?: 'batir' | 'recruter';
  onFermer(): void;
  /**
   * Ressortir sur la carte, SANS refermer d'abord.
   *
   * Plainte du propriétaire : « la navigation entre bâtiments et sortie et
   * recrutement est pas fluide ». Le panneau remplaçait la barre où vivait
   * « Quitter la cité » : une fois dedans, sortir demandait de fermer, puis de
   * viser un second bouton. L'épreuve de bout en bout le mesure — elle
   * cherchait la sortie pendant vingt secondes sans la trouver, sur les deux
   * appareils. La sortie est maintenant toujours là.
   */
  onQuitter(): void;
}

/** Le panneau, posé par-dessus la peinture de la cité. */
export function PanneauCite({
  game,
  town,
  ongletInitial = 'batir',
  onFermer,
  onQuitter,
}: PanneauCiteProps): ReactElement {
  const [onglet, setOnglet] = useState<'batir' | 'recruter' | 'taverne' | 'marche'>(ongletInitial);
  /* Un nouveau geste sur la maquette rouvre le panneau sur l'onglet demandé,
     même s'il était déjà ouvert sur l'autre. */
  useEffect(() => setOnglet(ongletInitial), [ongletInitial]);
  const batiments = useMemo(() => offresBatiments(game, town), [game, town]);
  const recrues = useMemo(() => offresRecrues(game, town), [game, town]);
  const promotions = useMemo(() => offresAmelioration(game, town), [game, town]);
  const taverne = useMemo(() => taverneDe(game, town), [game, town]);
  const marche = marcheOuvert(town);
  const vers = destinataireRecrues(town);

  return (
    <div className="cite-cmd">
      <Panel matter="parchemin" padding="normal">
        <div className="cite-cmd__tete">
          <div className="cite-cmd__onglets" role="tablist" aria-label="Commandes de la cité">
            <Button
              variant={onglet === 'batir' ? 'principal' : 'secondaire'}
              onClick={(): void => setOnglet('batir')}
            >
              Bâtir
            </Button>
            <Button
              variant={onglet === 'recruter' ? 'principal' : 'secondaire'}
              onClick={(): void => setOnglet('recruter')}
            >
              Recruter
            </Button>
            {taverne.ouverte ? (
              <Button
                variant={onglet === 'taverne' ? 'principal' : 'secondaire'}
                onClick={(): void => setOnglet('taverne')}
              >
                Auberge
              </Button>
            ) : null}
            {marche ? (
              <Button
                variant={onglet === 'marche' ? 'principal' : 'secondaire'}
                onClick={(): void => setOnglet('marche')}
              >
                Marché
              </Button>
            ) : null}
          </div>
          <div className="cite-cmd__issues">
            <Button variant="fantome" onClick={onFermer}>
              Fermer
            </Button>
            <Button variant="secondaire" onClick={onQuitter}>
              Quitter la cité
            </Button>
          </div>
        </div>

        {onglet === 'marche' && marche ? (
          <ComptoirMarche game={game} town={town} />
        ) : onglet === 'taverne' && taverne.ouverte ? (
          <>
            <p className="cite-cmd__vers">
              {taverne.refus ??
                `Engager un capitaine coûte ${nombre(taverne.cout)} écus : il arrive avec sa troupe et prend la cité pour quartier.`}
            </p>
            {taverne.offres.length === 0 ? (
              <p className="cite-cmd__vide">
                Personne ne se présente à l’auberge aujourd’hui : repassez demain.
              </p>
            ) : (
              <ul className="cite-cmd__liste">
                {taverne.offres.map((o) => (
                  <LigneTaverne key={o.id} offre={o} town={town} refus={taverne.refus} />
                ))}
              </ul>
            )}
          </>
        ) : onglet === 'batir' ? (
          batiments.length === 0 ? (
            <p className="cite-cmd__vide">Tout est levé à {town.name}.</p>
          ) : (
            <ul className="cite-cmd__liste">
              {batiments.map((o) => (
                <LigneBatiment key={o.id} offre={o} town={town} />
              ))}
            </ul>
          )
        ) : recrues.length === 0 ? (
          <p className="cite-cmd__vide">
            Aucune demeure n’est encore levée : bâtissez-en une pour recruter.
          </p>
        ) : (
          <>
            {/* Où vont les recrues est écrit AVANT la liste : c'est la question
                qu'on se pose en recrutant, et la découvrir après coup coûte un
                aller-retour par la garnison. */}
            <p className="cite-cmd__vers">
              {vers
                ? 'Les recrues rejoignent le héros présent dans la cité.'
                : 'Aucun héros dans la cité : les recrues tiennent la garnison.'}
            </p>
            <ul className="cite-cmd__liste">
              {recrues.map((o) => (
                <LigneRecrue key={o.id} offre={o} town={town} />
              ))}
            </ul>
            {promotions.length > 0 ? (
              <>
                <p className="cite-cmd__vers cite-cmd__section">
                  Élever les créatures présentes à la cité :
                </p>
                <ul className="cite-cmd__liste">
                  {promotions.map((o) => (
                    <LignePromotion key={o.de} offre={o} town={town} />
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </Panel>
    </div>
  );
}
