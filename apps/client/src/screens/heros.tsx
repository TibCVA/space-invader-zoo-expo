/**
 * Fiche de héros — l'écran `#/partie/heros/:uid` et `#/demo/heros`.
 *
 * Elle montre **tout** ce qu'un joueur doit savoir d'un héros : identité,
 * niveau et expérience, les quatre caractéristiques primaires majorées par les
 * artefacts, les valeurs dérivées calculées par le moteur (marche, vision,
 * mana, moral, fortune), les dix emplacements d'équipement plus le sac, les
 * compétences avec leur rang, les sorts rangés par école, et l'armée dans ses
 * sept emplacements.
 *
 * Aucune règle n'est calculée ici (non négociable n°4) : chaque nombre vient de
 * `@auvergne/engine` (`heroStats`, `heroProgress`, `wornArtifacts`,
 * `describeEffectList`, `stackPower`) ou du contenu.
 *
 * ## Ce qu'elle sait faire depuis peu, et pourquoi c'était grave
 *
 * Jusqu'ici la fiche ne faisait que **lire**. Le moteur accepte vingt
 * commandes ; le client en émettait quatre. Compté sur l'arbre du client, hors
 * tests, avant ce travail : `ChooseLevelUp 0`, `EquipArtifact 0`,
 * `UnequipArtifact 0`, `SwapArmy 0`.
 *
 * La plus coûteuse des trois absences est la montée de niveau. Un héros qui
 * monte reçoit deux propositions (`hero.pendingLevelUp`), et
 * `leveling.ts:288-290` **applique d'office la première** dès qu'un niveau
 * suivant tombe sur un choix non résolu. Comme aucun écran ne posait la
 * question, ce chemin de secours — celui dont le moteur dit lui-même « faute
 * de réponse » — était le seul par lequel un héros apprenait quoi que ce soit.
 * Le document maître §11 promet que le joueur « ne doit jamais être forcé
 * d'accepter une compétence inutile » ; il l'était à chaque niveau.
 *
 * Toutes les décisions (qui a le droit d'agir, quelles voies s'ouvrent, où un
 * artefact se porte, ce qu'un second clic sur une pile produit) vivent dans
 * `heros-actions.ts`, en fonctions pures tenues par des tests qui les
 * confrontent au moteur. Ce fichier ne fait que les rendre et appeler
 * `dispatch`, la seule porte de mutation.
 */

import { useState, type ReactElement } from 'react';
import {
  heroProgress,
  heroStats,
  primaryStats,
  stackPower,
  wornArtifacts,
  describeEffectList,
} from '@auvergne/engine';
import type { ArtifactSlot, GameState, HeroInstance, SkillId, SpellSchool } from '@auvergne/engine';
import { ARTIFACTS, CREATURES, HEROES, SKILLS, SPELLS } from '@auvergne/content';
import {
  Badge,
  Button,
  ConfirmBar,
  Divider,
  HeroPortrait,
  Icon,
  Panel,
  ProgressBar,
  Stat,
  rarityColors,
  schoolColors,
} from '@auvergne/ui';
import { dispatch, useAppState } from '../state/store.js';
import { Page } from './shell.js';
import { NOMS_EMPLACEMENTS, ORDRE_EMPLACEMENTS, calendrier, nombre, pluriel } from './format.js';
import {
  besaceDuHeros,
  choixDeNiveau,
  commandeDeNiveau,
  commandeDeRetrait,
  commandeDequipement,
  delogePar,
  echangeDePiles,
  mainSurLeHeros,
  rangeesDArmee,
} from './heros-actions.js';
import type { MainSurLeHeros, PileDesignee } from './heros-actions.js';
import './heros.css';

/* ─────────────────────────────── Outillage ──────────────────────────────── */

const ECOLES: readonly SpellSchool[] = ['braises', 'sources', 'brumes', 'racines'];

const NOMS_ECOLES: Readonly<Record<SpellSchool, string>> = {
  braises: 'Braises',
  sources: 'Sources',
  brumes: 'Brumes',
  racines: 'Racines',
};

/** Libellé de la spécialité, en français, sans logique de règles. */
function specialite(heroId: string): string {
  const def = HEROES[heroId];
  if (!def) return 'Spécialité inconnue';
  const s = def.specialty;
  switch (s.kind) {
    case 'creature':
      return `${CREATURES[s.creature]?.namePlural ?? s.creature} : +${s.perLevelBp / 100} % par niveau`;
    case 'spell':
      return `${SPELLS[s.spell]?.name ?? s.spell} : coût réduit, durée allongée`;
    case 'school':
      return `École des ${NOMS_ECOLES[s.school]} : coût réduit`;
    case 'skill':
      return `${SKILLS[s.skill]?.name ?? s.skill} : effet renforcé`;
    case 'resource':
      return `${s.perDay} de ${s.resource === 'filDor' ? "fil d'or" : s.resource} par jour`;
    case 'movement':
      return `+${s.bonus} points de marche par jour`;
    case 'siege':
      return 'Sièges : dégâts de machine majorés';
    case 'vision':
      return `+${s.bonus} cases de vision`;
    case 'weather':
      return 'Lit le temps deux jours à l’avance';
    case 'diplomacy':
      return 'Parlemente mieux avec les compagnies neutres';
    case 'build_discount':
      return 'Chantiers moins coûteux dans ses cités';
    default:
      return 'Spécialité propre';
  }
}

/* ──────────────────────────── Blocs de la fiche ─────────────────────────── */

function Identite({ hero }: { hero: HeroInstance }): ReactElement {
  const def = HEROES[hero.def];
  return (
    <Panel matter="parchemin" padding="normal" raised>
      <div className="fiche__identite">
        <HeroPortrait heroId={hero.def} size={196} frame="enluminure" showName={false} />
        <div>
          <h2 className="ecran__titre-carte">{def?.name ?? hero.def}</h2>
          <p className="fiche__classe">
            {def?.class ?? 'Héros'} · {def?.title ?? 'sans titre'}
          </p>
          {/* La devise du héros, sous son nom : sans effet de jeu, c'est le
              clin d'œil de la maison. Absente, rien ne s'affiche. */}
          {def?.devise ? (
            <p className="fiche__devise">«&#8239;{def.devise}&#8239;»</p>
          ) : null}
        </div>
        <div className="jeu-colonnes" style={{ justifyContent: 'center' }}>
          <Badge tone="or">Niveau {hero.level}</Badge>
          <Badge tone={hero.owner === 'P1' ? 'grenat' : 'sinople'}>Bannière {hero.owner}</Badge>
          {hero.inTown ? <Badge tone="neutre">En cité</Badge> : <Badge tone="neutre">En campagne</Badge>}
        </div>
        <p className="fiche__bio">{def?.bio ?? 'Sa chronique reste à écrire.'}</p>
        <p className="fiche__bio ecran__accent">
          <strong>Spécialité —</strong> {specialite(hero.def)}
        </p>
      </div>
    </Panel>
  );
}

/**
 * LE CHOIX DE NIVEAU — le panneau qui manquait tout entier.
 *
 * Il passe **avant** l'expérience et avant l'armée : c'est la seule chose de
 * la fiche qui se perd si on ne la voit pas. Un second niveau gagné dans le
 * même tour de jeu résout la proposition en attente sur son premier choix
 * (`leveling.ts:288-290`) et la question ne se repose jamais.
 *
 * Le choix est **définitif** — aucune commande du moteur ne défait une
 * compétence — donc il se confirme, au rythme de la maison : on désigne, on
 * relit ce qu'on gagne, on scelle. Le retrait d'un artefact ou le rangement
 * d'une pile, eux, se défont d'un clic et ne demandent rien.
 */
function MonteeDeNiveau({
  hero,
  main,
}: {
  hero: HeroInstance;
  main: MainSurLeHeros;
}): ReactElement | null {
  const [retenue, setRetenue] = useState<SkillId | null>(null);
  const choix = choixDeNiveau(hero);
  if (!choix) return null;

  const voie = retenue === null ? null : choix.voies.find((v) => v.skill === retenue);

  return (
    <Panel
      title="Une voie s’ouvre"
      subtitle={`${choix.primaire} +1 est déjà acquise ; la compétence, elle, se choisit.`}
      matter="parchemin"
      padding="normal"
      raised
    >
      {!main.ouverte ? <p className="ecran__note">{main.raison}</p> : null}

      <div className="fiche__voies">
        {choix.voies.map((v) => (
          <button
            key={v.skill}
            type="button"
            className="fiche__voie fiche__cliquable"
            disabled={!main.ouverte || retenue !== null}
            aria-pressed={retenue === v.skill}
            onClick={(): void => setRetenue(v.skill)}
          >
            <span className="fiche__icone">
              <Icon name={`competence_${v.skill}`} size={32} />
            </span>
            <span className="fiche__voie-corps">
              <span className="fiche__voie-titre">{v.titre}</span>
              <span className="fiche__ligne-detail">
                {v.effets.length > 0 ? v.effets.join(' · ') : (SKILLS[v.skill]?.description ?? '')}
              </span>
            </span>
            <Badge tone={v.rangActuel > 0 ? 'or' : 'sinople'}>
              {v.rangActuel > 0 ? 'Montée de rang' : 'Voie neuve'}
            </Badge>
          </button>
        ))}
      </div>

      {choix.voies.length === 1 ? (
        <p className="ecran__note">
          Le tirage n’a trouvé qu’une seule voie ouverte à ce héros : il n’y a pas de second choix
          à faire.
        </p>
      ) : null}

      {voie ? (
        <ConfirmBar
          className="fiche__confirmation"
          stage="confirmation"
          selection={voie.titre}
          preview={voie.effets.length > 0 ? voie.effets.join(' · ') : 'Aucun effet permanent.'}
          question="Sceller cette voie ? Une compétence apprise ne se désapprend pas."
          confirmLabel="Sceller"
          cancelLabel="Revenir"
          onConfirm={(): void => {
            setRetenue(null);
            dispatch(commandeDeNiveau(hero, voie.skill));
          }}
          onCancel={(): void => setRetenue(null)}
        />
      ) : null}
    </Panel>
  );
}

function Progression({ hero }: { hero: HeroInstance }): ReactElement {
  const p = heroProgress(hero);
  const dansNiveau = Math.max(0, p.xp - p.xpForLevel);
  const palier = Math.max(1, p.xpForNext - p.xpForLevel);
  return (
    <Panel title="Expérience" matter="parchemin" padding="normal">
      <ProgressBar
        label={`Progression vers le niveau ${p.level + 1}`}
        value={dansNiveau}
        max={palier}
        tone="or"
        caption={
          p.toNext > 0
            ? `${nombre(p.xp)} points · encore ${nombre(p.toNext)} avant le niveau ${p.level + 1}`
            : `${nombre(p.xp)} points · niveau maximal atteint`
        }
      />
      {p.pending ? (
        <p className="ecran__note ecran__accent">
          Une montée de niveau attend son choix de compétence.
        </p>
      ) : null}
    </Panel>
  );
}

function Caracteristiques({ state, hero }: { state: GameState; hero: HeroInstance }): ReactElement {
  const stats = heroStats(state, hero);
  const brutes = primaryStats(hero);
  return (
    <Panel title="Caractéristiques" matter="parchemin" padding="normal">
      <div className="fiche__stats">
        <Stat label="Vaillance" value={brutes.vaillance} icon={<Icon name="epee" size={22} />} tone="faveur" />
        <Stat label="Garde" value={brutes.garde} icon={<Icon name="bouclier" size={22} />} tone="faveur" />
        <Stat label="Mystique" value={brutes.mystique} icon={<Icon name="etoile" size={22} />} tone="neutre" />
        <Stat label="Savoir" value={brutes.savoir} icon={<Icon name="livre" size={22} />} tone="neutre" />
      </div>
      <Divider label="Valeurs dérivées" />
      <div className="fiche__stats">
        <Stat
          label="Marche du jour"
          value={`${nombre(hero.movement)} / ${nombre(stats.movementMax)}`}
          icon={<Icon name="pas" size={22} />}
        />
        <Stat
          label="Mana"
          value={`${nombre(hero.mana)} / ${nombre(stats.manaMax)}`}
          icon={<Icon name="goutte" size={22} />}
        />
        <Stat label="Vision" value={pluriel(stats.vision, 'case')} icon={<Icon name="oeil" size={22} />} />
        <Stat
          label="Moral"
          value={stats.morale >= 0 ? `+${stats.morale}` : `${stats.morale}`}
          icon={<Icon name="moral" size={22} />}
          tone={stats.morale >= 0 ? 'faveur' : 'defaveur'}
        />
        <Stat
          label="Fortune"
          value={stats.fortune >= 0 ? `+${stats.fortune}` : `${stats.fortune}`}
          icon={<Icon name="fortune" size={22} />}
          tone={stats.fortune >= 0 ? 'faveur' : 'defaveur'}
        />
        <Stat
          label="Puissance d’armée"
          value={nombre(stackPower(hero.army))}
          icon={<Icon name="combat" size={22} />}
          tone="or"
        />
      </div>
    </Panel>
  );
}

/**
 * Les dix emplacements et la besace, désormais manœuvrables.
 *
 * Porter et retirer sont réversibles d'un clic et ne coûtent rien : rien ne se
 * confirme. Ce qu'il faut en revanche montrer AVANT le geste, c'est ce qu'il
 * déloge — poser un anneau sur deux doigts déjà bagués renvoie une pièce en
 * besace, et le joueur doit le lire, pas le découvrir.
 */
function Equipement({ hero, main }: { hero: HeroInstance; main: MainSurLeHeros }): ReactElement {
  const portes = new Map(wornArtifacts(hero).map((w) => [w.slot, w]));
  const besace = besaceDuHeros(hero);

  return (
    <Panel
      title="Artefacts"
      subtitle={
        portes.size === 10
          ? 'Les dix emplacements sont garnis'
          : `${portes.size} emplacement${portes.size > 1 ? 's' : ''} garni${portes.size > 1 ? 's' : ''} sur dix`
      }
      matter="parchemin"
      padding="normal"
    >
      <div className="fiche__artefacts">
        {ORDRE_EMPLACEMENTS.map((slot: ArtifactSlot) => {
          const porte = portes.get(slot);
          const def = porte?.def ?? null;
          const teinte = def ? rarityColors[def.rarity] : undefined;
          const style = teinte ? ({ ['--teinte']: teinte } as Record<string, string>) : undefined;
          const corps = (
            <>
              <span className="fiche__icone">
                <Icon name={def ? `artefact_${def.id}` : 'coffre'} size={32} />
              </span>
              <span className="fiche__artefact-corps">
                <span className="fiche__emplacement">{NOMS_EMPLACEMENTS[slot]}</span>
                <span className="fiche__nom-artefact">
                  {def ? def.name : porte ? porte.id : 'Libre'}
                </span>
              </span>
            </>
          );

          /* Un emplacement vide n'a rien à rendre : il reste une case, pas un
             bouton qui ne ferait rien. */
          if (!porte || !main.ouverte) {
            return (
              <div
                key={slot}
                className={porte ? 'fiche__artefact' : 'fiche__artefact fiche__artefact--vide'}
                style={style}
                title={def ? describeEffectList(def.effects).join(' · ') : 'Emplacement libre'}
              >
                {corps}
              </div>
            );
          }

          return (
            <button
              key={slot}
              type="button"
              className="fiche__artefact fiche__cliquable"
              style={style}
              title={`Retirer ${def ? def.name : porte.id} et le remettre en besace`}
              aria-label={`Retirer ${def ? def.name : porte.id} de l’emplacement ${NOMS_EMPLACEMENTS[slot]}`}
              onClick={(): void => {
                dispatch(commandeDeRetrait(hero, slot));
              }}
            >
              {corps}
            </button>
          );
        })}
      </div>

      <Divider label={`Sac — ${besace.length} objet${besace.length > 1 ? 's' : ''}`} />
      {besace.length === 0 ? (
        <p className="ecran__note">Le sac est vide.</p>
      ) : (
        <ul className="jeu-liste-nue">
          {besace.map((piece) => (
            <li className="fiche__ligne" key={`${piece.id}-${piece.rang}`}>
              <span className="fiche__icone">
                <Icon name={`artefact_${piece.id}`} size={32} />
              </span>
              <span className="fiche__ligne-corps">
                <span className="fiche__ligne-titre">{piece.nom}</span>
                <span className="fiche__ligne-detail">
                  {piece.effets.length > 0
                    ? `${piece.rarete} · ${piece.effets.join(' · ')}`
                    : `${piece.rarete} · aucun effet permanent`}
                </span>
                {piece.refus ? <span className="fiche__refus">{piece.refus}</span> : null}
              </span>
              {main.ouverte && !piece.refus ? (
                <span className="fiche__poser">
                  {piece.emplacements.map((emplacement) => {
                    const delogee = delogePar(hero, emplacement.slot);
                    const nomDelogee = delogee ? (ARTIFACTS[delogee]?.name ?? delogee) : null;
                    return (
                      <Button
                        key={emplacement.slot}
                        size="compact"
                        variant={emplacement.slot === piece.cible ? 'principal' : 'secondaire'}
                        title={
                          nomDelogee
                            ? `${emplacement.nom} — ${nomDelogee} rejoint la besace`
                            : `${emplacement.nom} — emplacement libre`
                        }
                        aria-label={`Porter ${piece.nom} à l’emplacement ${emplacement.nom}${
                          nomDelogee ? ` ; ${nomDelogee} rejoint la besace` : ''
                        }`}
                        onClick={(): void => {
                          dispatch(commandeDequipement(hero, piece.id, emplacement.slot));
                        }}
                      >
                        {piece.emplacements.length === 1 ? 'Porter' : emplacement.nom}
                      </Button>
                    );
                  })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Competences({ hero }: { hero: HeroInstance }): ReactElement {
  const p = heroProgress(hero);
  return (
    <Panel
      title="Compétences"
      subtitle={`${p.skills.length} apprise${p.skills.length > 1 ? 's' : ''} sur huit possibles`}
      matter="parchemin"
      padding="normal"
    >
      <ul className="jeu-liste-nue">
        {p.skills.map((s) => {
          const def = SKILLS[s.skill];
          const effets = def ? describeEffectList(def.effects[s.rank - 1] ?? []) : [];
          return (
            <li className="fiche__ligne" key={s.skill}>
              <span className="fiche__icone">
                <Icon name={`competence_${s.skill}`} size={32} />
              </span>
              <span className="fiche__ligne-corps">
                <span className="fiche__ligne-titre">{s.name}</span>
                <span className="fiche__ligne-detail">
                  {effets.length > 0 ? effets.join(' · ') : (def?.description ?? '')}
                </span>
              </span>
              <Badge tone={s.rank === 3 ? 'or' : s.rank === 2 ? 'sinople' : 'neutre'}>{s.rankName}</Badge>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Grimoire({ hero }: { hero: HeroInstance }): ReactElement {
  const parEcole = new Map<SpellSchool, string[]>();
  for (const id of hero.spells) {
    const def = SPELLS[id];
    if (!def) continue;
    const liste = parEcole.get(def.school) ?? [];
    liste.push(id);
    parEcole.set(def.school, liste);
  }
  return (
    <Panel
      title="Grimoire"
      subtitle={`${hero.spells.length} sort${hero.spells.length > 1 ? 's' : ''} appris`}
      matter="parchemin"
      padding="normal"
    >
      {hero.spells.length === 0 ? (
        <p className="ecran__note">Ce héros n’a encore appris aucun sort.</p>
      ) : (
        ECOLES.filter((e) => (parEcole.get(e)?.length ?? 0) > 0).map((ecole) => (
          <div key={ecole}>
            <Divider label={`École des ${NOMS_ECOLES[ecole]}`} />
            <div className="fiche__grille">
              {(parEcole.get(ecole) ?? [])
                .slice()
                .sort()
                .map((id) => {
                  const def = SPELLS[id];
                  return (
                    <div
                      className="fiche__ligne ecran__carte-sort"
                      key={id}
                      style={{ ['--teinte']: schoolColors[ecole] } as Record<string, string>}
                    >
                      <span className="fiche__icone">
                        <Icon name={`sort_${id}`} size={32} />
                      </span>
                      <span className="fiche__ligne-corps">
                        <span className="fiche__ligne-titre">{def?.name ?? id}</span>
                        <span className="fiche__ligne-detail">
                          Niveau {def?.level ?? '?'} · {def?.cost ?? '?'} de mana
                        </span>
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        ))
      )}
    </Panel>
  );
}

/**
 * L'ARMÉE, RANGEABLE — sept emplacements, plus la garnison quand le héros est
 * chez lui.
 *
 * Le geste est celui de HMM3 réduit au tactile : on désigne une pile, on
 * désigne sa destination. Pas de glisser-déposer — sur un iPhone il se
 * confond avec le défilement de la page, et la fiche est plus haute qu'un
 * écran.
 *
 * Une pile part **entière** : `count` n'est jamais envoyé. C'est une limite
 * assumée (on ne peut pas scinder une pile depuis cet écran), et c'est aussi
 * ce qui met le joueur à l'abri du seul refus du moteur qu'il ne pourrait pas
 * anticiper — « on ne peut pas fractionner une pile sur un emplacement
 * occupé ».
 *
 * Le seul geste qu'on fait confirmer est celui qui laisse le héros sans une
 * seule troupe. Il se défait d'un clic, donc il n'est pas irréversible ; mais
 * un héros vidé ne peut plus ni attaquer ni se défendre, et l'oublier se paie
 * au premier contact.
 */
function Armees({
  state,
  hero,
  main,
}: {
  state: GameState;
  hero: HeroInstance;
  main: MainSurLeHeros;
}): ReactElement {
  const [retenue, setRetenue] = useState<PileDesignee | null>(null);
  const [aConfirmer, setAConfirmer] = useState<{ libelle: string; cible: PileDesignee } | null>(
    null,
  );
  const rangees = rangeesDArmee(state, hero);

  function oublier(): void {
    setRetenue(null);
    setAConfirmer(null);
  }

  function designer(cible: PileDesignee): void {
    if (!retenue) {
      setRetenue(cible);
      return;
    }
    const geste = echangeDePiles(rangees, retenue, cible);
    if (geste.quoi !== 'commande') {
      oublier();
      return;
    }
    if (geste.videLeHeros) {
      setAConfirmer({ libelle: geste.libelle, cible });
      return;
    }
    oublier();
    dispatch(geste.commande);
  }

  /* La confirmation rejoue la décision au moment du « oui » plutôt que de
     retenir la commande : entre les deux clics, un relais réseau ou un tour
     d'ordinateur a pu changer l'état sous nos pieds. */
  function confirmer(): void {
    if (!retenue || !aConfirmer) return;
    const geste = echangeDePiles(rangeesDArmee(state, hero), retenue, aConfirmer.cible);
    oublier();
    if (geste.quoi === 'commande') dispatch(geste.commande);
  }

  return (
    <Panel
      title="Armée"
      subtitle={
        rangees.length > 1
          ? 'Sept emplacements, et la garnison de la cité'
          : 'Sept emplacements'
      }
      matter="parchemin"
      padding="normal"
    >
      {rangees.map((rangee) => (
        <div className="fiche__rangee" key={`${rangee.ref.kind}-${rangee.ref.uid}`}>
          {rangees.length > 1 ? <Divider label={rangee.titre} /> : null}
          <div className="fiche__grille">
            {rangee.piles.map((pile, index) => {
              const def = pile ? CREATURES[pile.creature] : null;
              const estRetenue =
                retenue !== null &&
                retenue.ref.kind === rangee.ref.kind &&
                retenue.ref.uid === rangee.ref.uid &&
                retenue.slot === index;
              const corps = (
                <>
                  <span className="ecran__pile-numero">{index + 1}</span>
                  <span className="fiche__ligne-corps">
                    <span className="fiche__ligne-titre">
                      {def ? def.namePlural : 'Emplacement libre'}
                    </span>
                    <span className="fiche__ligne-detail">
                      {def && pile
                        ? `${nombre(pile.count)} · rang ${def.tier}${def.upgraded ? ' amélioré' : ''} · ${def.attack}/${def.defense} · ${def.hp} PV`
                        : 'Aucune troupe rangée ici.'}
                    </span>
                  </span>
                  {pile ? <Badge tone="or">{nombre(pile.count)}</Badge> : null}
                </>
              );
              const classes = [
                'fiche__ligne',
                'ecran__pile',
                pile ? '' : 'ecran__pile--vide',
                estRetenue ? 'fiche__cliquable--retenue' : '',
              ]
                .filter(Boolean)
                .join(' ');

              /* Sans la main, ou tant qu'aucune pile n'est retenue, une case
                 vide n'est pas une destination : elle reste un simple pavé. */
              if (!main.ouverte || (!pile && retenue === null)) {
                return (
                  <div className={classes} key={`${rangee.ref.uid}-${index}`}>
                    {corps}
                  </div>
                );
              }

              return (
                <button
                  type="button"
                  className={`${classes} fiche__cliquable`}
                  key={`${rangee.ref.uid}-${index}`}
                  aria-pressed={estRetenue}
                  aria-label={
                    retenue === null
                      ? `Prendre l’emplacement ${index + 1} de ${rangee.titre}`
                      : `Poser sur l’emplacement ${index + 1} de ${rangee.titre}`
                  }
                  onClick={(): void => designer({ ref: rangee.ref, slot: index })}
                >
                  {corps}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {main.ouverte ? (
        <p className="fiche__aide">
          <span className="fiche__aide-texte">
            {retenue === null
              ? 'Touchez une pile, puis sa destination : les piles s’échangent, se réunissent ou changent d’emplacement.'
              : `Emplacement ${retenue.slot + 1} retenu — touchez maintenant sa destination.`}
          </span>
          {retenue !== null ? (
            <Button size="compact" variant="fantome" onClick={oublier}>
              Reposer
            </Button>
          ) : null}
        </p>
      ) : (
        <p className="ecran__note">{main.raison}</p>
      )}

      {aConfirmer ? (
        <ConfirmBar
          className="fiche__confirmation"
          stage="confirmation"
          grave
          selection={aConfirmer.libelle}
          preview="Ce héros n’aura plus une seule troupe : il ne pourra ni attaquer ni se défendre."
          question="Le laisser partir les mains vides ?"
          confirmLabel="Confier la pile"
          cancelLabel="Garder la pile"
          onConfirm={confirmer}
          onCancel={oublier}
        />
      ) : null}
    </Panel>
  );
}

/* ─────────────────────────────── L'écran ────────────────────────────────── */

export interface FicheHerosProps {
  state: GameState;
  uid: string;
}

/** La fiche complète d'un héros. */
export function FicheHeros({ state, uid }: FicheHerosProps): ReactElement {
  /*
   * La fiche reçoit l'état à AFFICHER en propriété — `#/demo/heros` lui passe
   * un état composé à la main, étranger au magasin. Le magasin est lu à part,
   * et `mainSurLeHeros` compare les deux : on n'expédie une commande que sur
   * la partie effectivement chargée.
   */
  const app = useAppState();
  const main = mainSurLeHeros(state, app, uid);
  const hero = state.heroes[uid];

  if (!hero) {
    return (
      <Page titre="Fiche de héros">
        <Panel title="Héros introuvable" matter="parchemin" padding="normal">
          <p className="ecran__note">
            Aucun héros ne porte l’identifiant «&#8239;{uid}&#8239;» dans cette partie.
          </p>
        </Panel>
      </Page>
    );
  }
  const def = HEROES[hero.def];
  return (
    <Page
      titre={def ? `${def.name}, ${def.title}` : 'Fiche de héros'}
      note={calendrier(state.turn)}
    >
      {!main.ouverte ? (
        <p className="ecran__bandeau-avis">Fiche en lecture — {main.raison}</p>
      ) : null}
      <div className="fiche">
        <div className="fiche__colonne">
          <Identite hero={hero} />
          <MonteeDeNiveau hero={hero} main={main} />
          <Progression hero={hero} />
        </div>
        <div className="fiche__colonne">
          <Caracteristiques state={state} hero={hero} />
          <Armees state={state} hero={hero} main={main} />
          <Equipement hero={hero} main={main} />
          <Competences hero={hero} />
          <Grimoire hero={hero} />
        </div>
      </div>
    </Page>
  );
}
