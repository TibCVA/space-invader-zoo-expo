/**
 * `#/en-ligne` — la salle des cousins.
 *
 * Trois choses, et rien d'autre : **créer** une partie, **rejoindre** par un
 * code dicté au téléphone, et retrouver **mes parties en cours** — celles où
 * c'est mon tour d'abord, en évidence.
 *
 * L'écran reprend la matière de l'assistant de nouvelle partie : parchemin sur
 * granit, titres en Cinzel, récit en EB Garamond, plaques `hmm-acc-segment`.
 * Aucune surface administrative, aucun gris d'application de gestion.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { bandeauMonTour, libelleAttente } from '@auvergne/protocol';
import type { MyPartiesPayload, MyPartyEntry } from '@auvergne/protocol';
import { Badge, HeroAvatar, Icon } from '@auvergne/ui';
import { navigate } from '../router.js';
import { jouerEffet } from '../landing/audio-bridge.js';
import { dateCourte } from '../screens/format.js';
import {
  ErreurPartie,
  codeValide,
  creerPartie,
  mesPartiesSilencieuses,
  normaliserCode,
} from './api.js';
import {
  CompteurBannieres,
  DUREES,
  Segments,
  VICTOIRES,
  type DureePartie,
  type VictoirePartie,
} from './choix.js';
import {
  autorisationNotifications,
  demanderNotifications,
  type EtatAutorisation,
} from './rappels.js';

/* ═══════════════════════ Le bouton « me prévenir » ════════════════════════ */

/**
 * L'autorisation de notification n'est **jamais** demandée d'elle-même : ce
 * bouton existe pour que le joueur la donne s'il la veut, au clic, et pas
 * autrement (`docs/04-MULTIJOUEUR.md` §6).
 */
export function BoutonPrevenir(): ReactElement | null {
  const [etat, setEtat] = useState<EtatAutorisation>(() => autorisationNotifications());

  if (etat === 'indisponible') return null;

  if (etat === 'granted') {
    return (
      <p className="hmm-enl-note hmm-enl-note--acquise">
        <Icon name="cloche" size={16} />
        <span>Ce navigateur vous préviendra quand ce sera votre tour.</span>
      </p>
    );
  }

  if (etat === 'denied') {
    return (
      <p className="hmm-enl-note">
        <Icon name="cloche" size={16} />
        <span>
          Les notifications sont refusées pour ce site. Le titre de l’onglet vous préviendra quand même.
        </span>
      </p>
    );
  }

  return (
    <button
      type="button"
      className="hmm-enl-prevenir"
      onClick={(): void => {
        jouerEffet('clic');
        void demanderNotifications().then(setEtat);
      }}
    >
      <Icon name="cloche" size={18} />
      <span>Me prévenir quand c’est mon tour</span>
    </button>
  );
}

/* ═══════════════════════════ Une partie en cours ══════════════════════════ */

function LignePartie({
  partie,
  onNaviguer,
}: {
  partie: MyPartyEntry;
  onNaviguer?(fragment: string): void;
}): ReactElement {
  const attente = partie.statut === 'en_cours' && !partie.monTour ? libelleAttente(partie.attendu) : null;
  const classe = `hmm-enl-partie${partie.monTour ? ' est-mon-tour' : ''}`;

  return (
    <li className={classe}>
      <button
        type="button"
        className="hmm-enl-partie-bouton"
        onClick={(): void => {
          jouerEffet('clic_lourd');
          if (onNaviguer) onNaviguer(`#/en-ligne/${encodeURIComponent(partie.code)}`);
          else navigate({ name: 'en-ligne-partie', code: partie.code });
        }}
      >
        <span className="hmm-enl-partie-avatar" aria-hidden="true">
          {partie.avatar ? <HeroAvatar heroId={partie.avatar} size={46} /> : <Icon name="banniere" size={28} />}
        </span>
        <span className="hmm-enl-partie-textes">
          <span className="hmm-enl-partie-code jeu-tabulaire">{partie.code}</span>
          <span className="hmm-enl-partie-etat">
            {partie.statut === 'salon'
              ? 'Salon ouvert — les bannières se choisissent'
              : partie.statut === 'terminee'
                ? 'Partie terminée'
                : partie.monTour
                  ? 'C’est ton tour'
                  : (attente ?? 'Partie en cours')}
          </span>
          <span className="hmm-enl-partie-detail">
            {partie.monNom} · {partie.joueurs} bannières · {dateCourte(partie.majLe)}
          </span>
        </span>
        {partie.monTour ? (
          <Badge tone="or" size="compact">
            À toi
          </Badge>
        ) : partie.hote ? (
          <Badge tone="azur" size="compact" outline>
            Hôte
          </Badge>
        ) : null}
      </button>
    </li>
  );
}

/* ═══════════════════ Le bloc « parties en cours » ═════════════════════════ */

export interface BandeauMesPartiesProps {
  /** navigation par fragment ; à défaut, le routeur du client est utilisé */
  onNaviguer?(fragment: string): void;
  /** titre du bloc ; utile pour l'intégrer ailleurs qu'à l'accueil */
  titre?: string;
}

/**
 * Le bloc de la page d'accueil : « C'est ton tour dans deux parties », puis la
 * liste des parties en cours. Il ne s'affiche **que** si `mes-parties` renvoie
 * quelque chose : un joueur qui n'a jamais joué en ligne ne voit rien du tout,
 * et la page d'accueil garde exactement sa mise en page.
 */
export function BandeauMesParties({ onNaviguer, titre }: BandeauMesPartiesProps): ReactElement | null {
  const [charge, setCharge] = useState<MyPartiesPayload | null>(null);

  useEffect(() => {
    const controleur = new AbortController();
    void (async (): Promise<void> => {
      const reponse = await mesPartiesSilencieuses(controleur.signal);
      if (controleur.signal.aborted) return;
      setCharge(reponse);
    })();
    return () => controleur.abort();
  }, []);

  const parties = charge?.parties ?? [];
  if (parties.length === 0) return null;

  const bandeau = charge ? bandeauMonTour(charge.monTour) : null;

  return (
    <section className="hmm-enl-accueil" aria-label={titre ?? 'Mes parties en ligne'}>
      {bandeau ? (
        <p className="hmm-enl-bandeau" role="status">
          <Icon name="cloche" size={18} />
          <span>{bandeau}</span>
        </p>
      ) : null}
      <ul className="hmm-enl-parties">
        {[...parties]
          .sort((a, b) => Number(b.monTour) - Number(a.monTour) || (a.majLe < b.majLe ? 1 : -1))
          .slice(0, 4)
          .map((partie) => (
            <LignePartie key={partie.code} partie={partie} onNaviguer={onNaviguer} />
          ))}
      </ul>
    </section>
  );
}

/* ══════════════════════ Créer depuis l'assistant ══════════════════════════ */

export interface CreationEnLigneProps {
  /** ce que l'assistant de nouvelle partie a réglé */
  demande: { bannieres: number; duree: DureePartie; victoire: VictoirePartie; graine: number };
  /** navigation par fragment, vers le salon de la partie créée */
  onNaviguer(fragment: string): void;
}

/**
 * Le bouton de création, tel que l'assistant de nouvelle partie l'appelle
 * quand le joueur a choisi le mode « En ligne, chacun chez soi »
 * (`docs/04-MULTIJOUEUR.md` §7). Il ne compose aucun `GameSetup` : en ligne,
 * chaque cousin choisit lui-même sa maison, son héros et sa position dans le
 * salon, et c'est le serveur qui assemble la partie au lancement.
 */
export function CreationEnLigne({ demande, onNaviguer }: CreationEnLigneProps): ReactElement {
  const [travail, setTravail] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const creer = useCallback((): void => {
    setTravail(true);
    setErreur(null);
    jouerEffet('clic_lourd');
    void (async (): Promise<void> => {
      try {
        const cree = await creerPartie(demande);
        onNaviguer(`#/en-ligne/${encodeURIComponent(cree.code)}`);
      } catch (cause) {
        setErreur(
          cause instanceof ErreurPartie
            ? cause.message
            : 'Le serveur des parties est injoignable. Réessayez dans un instant : rien n’est perdu.',
        );
      } finally {
        setTravail(false);
      }
    })();
  }, [demande, onNaviguer]);

  return (
    <>
      {erreur ? (
        <p className="hmm-enl-alerte" role="alert">
          <Icon name="alerte" size={18} />
          <span>{erreur}</span>
        </p>
      ) : null}
      <p className="hmm-acc-aide">
        La partie s’ouvre sur un code de six caractères et un lien à partager. Vos cousins choisissent
        leur bannière dans le salon ; vous lèverez les bannières quand tout le monde sera prêt.
      </p>
      <button type="button" className="hmm-acc-lancer" disabled={travail} onClick={creer}>
        <Icon name="banniere" size={22} />
        <span>{travail ? 'On ouvre le salon…' : 'Ouvrir le salon et obtenir le lien'}</span>
      </button>
    </>
  );
}

/* ══════════════════════════════ L'écran ═══════════════════════════════════ */

/** Graine aléatoire côté interface : jamais dans la simulation. */
function graineAleatoire(): number {
  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.getRandomValues === 'function') {
    const tampon = new Uint32Array(1);
    crypto.getRandomValues(tampon);
    return tampon[0] % 1_000_000_000;
  }
  return (Date.now() * 2654435761) % 1_000_000_000;
}

export function EcranEnLigne(): ReactElement {
  const [bannieres, setBannieres] = useState(3);
  const [duree, setDuree] = useState<DureePartie>('standard');
  const victoire: VictoirePartie = 'derniere_banniere';
  const [creation, setCreation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const [saisie, setSaisie] = useState('');
  const [mesPartiesEtat, setMesParties] = useState<MyPartiesPayload | null>(null);
  const [interroge, setInterroge] = useState(true);

  useEffect(() => {
    const controleur = new AbortController();
    void (async (): Promise<void> => {
      const charge = await mesPartiesSilencieuses(controleur.signal);
      if (controleur.signal.aborted) return;
      setMesParties(charge);
      setInterroge(false);
    })();
    return () => controleur.abort();
  }, []);

  const creer = useCallback((): void => {
    setCreation(true);
    setErreur(null);
    jouerEffet('clic_lourd');
    void (async (): Promise<void> => {
      try {
        const cree = await creerPartie({
          bannieres,
          duree,
          victoire,
          graine: graineAleatoire(),
        });
        navigate({ name: 'en-ligne-partie', code: cree.code });
      } catch (cause) {
        setErreur(
          cause instanceof ErreurPartie
            ? cause.message
            : 'Le serveur des parties est injoignable. Réessayez dans un instant : rien n’est perdu.',
        );
      } finally {
        setCreation(false);
      }
    })();
  }, [bannieres, duree, victoire]);

  const rejoindreParCode = useCallback((): void => {
    const code = normaliserCode(saisie);
    if (!codeValide(code)) {
      setErreur('Ce code ne ressemble pas à un code de partie. Il a la forme « FOREZ-7K2P ».');
      return;
    }
    setErreur(null);
    jouerEffet('clic_lourd');
    navigate({ name: 'en-ligne-partie', code });
  }, [saisie]);

  const parties = mesPartiesEtat?.parties ?? [];
  const bandeau = mesPartiesEtat ? bandeauMonTour(mesPartiesEtat.monTour) : null;

  return (
    <div className="hmm-acc-ecran hmm-acc-ecran--assistant">
      <header className="hmm-acc-ecran-tete">
        <button
          type="button"
          className="hmm-acc-retour"
          onClick={(): void => navigate({ name: 'accueil' })}
        >
          <Icon name="chevron" size={18} />
          <span>Retour à l’accueil</span>
        </button>
        <h2 className="hmm-acc-ecran-titre">Jouer avec mes cousins</h2>
        <p className="hmm-acc-ecran-sous-titre">
          Chacun chez soi, chacun à son rythme. Un seul lien à partager, aucun compte à créer, et la
          partie reste au chaud sur le serveur entre deux coups — trois jours, trois semaines, peu importe.
        </p>
      </header>

      {erreur ? (
        <p className="hmm-enl-alerte" role="alert">
          <Icon name="alerte" size={18} />
          <span>{erreur}</span>
        </p>
      ) : null}

      <div className="hmm-acc-assistant">
        <div className="hmm-acc-assistant-colonne">
          <section className="hmm-acc-bloc" aria-labelledby="enl-creer">
            <h3 className="hmm-acc-bloc-titre" id="enl-creer">
              Ouvrir une partie
            </h3>
            <CompteurBannieres value={bannieres} onChange={setBannieres} disabled={creation} />
            <Segments<DureePartie>
              legend="Durée"
              value={duree}
              options={DUREES}
              onChange={setDuree}
              disabled={creation}
              columns
            />
            {/* Une seule victoire — prendre tous les châteaux — donc rien à
                choisir : on l'énonce, on ne la propose pas. */}
            <fieldset className="hmm-acc-champ">
              <legend className="hmm-acc-legende">Victoire</legend>
              <p className="hmm-acc-aide">
                <strong>{VICTOIRES[0].name}.</strong> {VICTOIRES[0].text}
              </p>
            </fieldset>
            <button type="button" className="hmm-acc-lancer" disabled={creation} onClick={creer}>
              <Icon name="banniere" size={22} />
              <span>{creation ? 'On ouvre le salon…' : 'Créer la partie et obtenir le lien'}</span>
            </button>
          </section>

          <section className="hmm-acc-bloc" aria-labelledby="enl-rejoindre">
            <h3 className="hmm-acc-bloc-titre" id="enl-rejoindre">
              Rejoindre par code
            </h3>
            <p className="hmm-acc-aide">
              Un cousin vous a dicté un code au téléphone&nbsp;? Il ressemble à «&nbsp;FOREZ-7K2P&nbsp;».
              Ni O ni zéro, ni I ni un : ces caractères-là ne s’y trouvent jamais.
            </p>
            <div className="hmm-enl-rejoindre">
              <label className="hmm-enl-code">
                <span className="hmm-acc-sr">Code de la partie</span>
                <input
                  type="text"
                  value={saisie}
                  spellCheck={false}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  maxLength={16}
                  placeholder="FOREZ-7K2P"
                  onChange={(event): void => setSaisie(event.target.value.toUpperCase())}
                  onKeyDown={(event): void => {
                    if (event.key === 'Enter') rejoindreParCode();
                  }}
                />
              </label>
              <button
                type="button"
                className="hmm-acc-relancer"
                disabled={saisie.trim().length === 0}
                onClick={rejoindreParCode}
              >
                <Icon name="cle" size={18} />
                <span>Ouvrir le salon</span>
              </button>
            </div>
          </section>
        </div>

        <aside className="hmm-acc-assistant-aside" aria-label="Mes parties en ligne">
          <div className="hmm-acc-parchemin">
            <h3 className="hmm-acc-bloc-titre">Mes parties</h3>
            {bandeau ? (
              <p className="hmm-enl-bandeau" role="status">
                <Icon name="cloche" size={18} />
                <span>{bandeau}</span>
              </p>
            ) : null}

            {interroge ? (
              <p className="hmm-acc-aide">On demande au serveur…</p>
            ) : mesPartiesEtat === null ? (
              <p className="hmm-acc-aide">
                Le serveur des parties est injoignable. Vos parties ne sont pas perdues : elles vous
                attendront au retour du réseau.
              </p>
            ) : parties.length === 0 ? (
              <p className="hmm-acc-aide">
                Aucune partie en ligne pour l’instant. Ouvrez-en une, envoyez le lien à vos cousins, et
                revenez quand vous voulez.
              </p>
            ) : (
              <ul className="hmm-enl-parties">
                {[...parties]
                  .sort((a, b) => Number(b.monTour) - Number(a.monTour) || (a.majLe < b.majLe ? 1 : -1))
                  .map((partie) => (
                    <LignePartie key={partie.code} partie={partie} />
                  ))}
              </ul>
            )}

            <BoutonPrevenir />
          </div>

          {parties.length === 0 ? <ModeDEmploi /> : null}
        </aside>
      </div>
    </div>
  );
}

/**
 * Les trois gestes d'une partie entre cousins, montrés seulement quand il n'y a
 * encore aucune partie.
 *
 * Sur un grand écran, la colonne de droite ne portait qu'un encart de deux
 * lignes — « aucune partie en ligne pour l'instant » — et le reste du champ
 * restait vide. Or c'est exactement le moment où quelqu'un qui n'a jamais fait
 * ça se demande ce qu'il doit faire. Une fois la première partie ouverte, le
 * panneau disparaît : il n'a plus rien à apprendre à personne.
 */
function ModeDEmploi(): ReactElement {
  const etapes: readonly { titre: string; texte: string; icone: string }[] = [
    {
      icone: 'banniere',
      titre: 'Vous ouvrez la partie',
      texte:
        'Vous choisissez le nombre de bannières, la durée et la façon de gagner. Le serveur vous rend un code, du genre FOREZ-7K2P, et un lien.',
    },
    {
      icone: 'cle',
      titre: 'Vous envoyez le lien',
      texte:
        'Par message, par courriel, dicté au téléphone : peu importe. Le premier arrivé prend la bannière qu’il veut, choisit sa maison, son héros et son portrait. Aucun compte à créer, aucun mot de passe.',
    },
    {
      icone: 'cloche',
      titre: 'Chacun joue à son rythme',
      texte:
        'La partie dort sur le serveur entre deux coups. Quand c’est à vous, le titre de l’onglet vous le dit, et cette page aussi. Trois jours entre deux tours ne gênent personne.',
    },
  ];

  return (
    <div className="hmm-acc-parchemin hmm-enl-mode-emploi">
      <h3 className="hmm-acc-bloc-titre">Comment ça se passe</h3>
      <ol className="hmm-enl-etapes">
        {etapes.map((etape, index) => (
          <li key={etape.titre} className="hmm-enl-etape">
            <span className="hmm-enl-etape-rang" aria-hidden="true">
              {index + 1}
            </span>
            <div className="hmm-enl-etape-corps">
              <h4 className="hmm-enl-etape-titre">
                <Icon name={etape.icone} size={16} />
                <span>{etape.titre}</span>
              </h4>
              <p className="hmm-enl-etape-texte">{etape.texte}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="hmm-acc-aide hmm-enl-rassurance">
        Rien n’est perdu si un cousin ferme son navigateur : la partie vit sur le serveur, pas dans
        l’onglet.
      </p>
    </div>
  );
}
