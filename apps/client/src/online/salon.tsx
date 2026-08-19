/**
 * `#/en-ligne/:code` — le salon, puis la salle d'attente.
 *
 * Un seul écran pour deux moments, parce que c'est un seul lieu du point de
 * vue des cousins :
 *
 *  - **avant le lancement** : la liste des bannières, celles prises, celles
 *    libres ; mon nom, ma maison, mon héros — donc mon portrait — et ma
 *    position ; le lien à partager avec son bouton de copie ; la possibilité
 *    pour l'hôte de confier une bannière libre à l'IA ; le bouton *Lever les
 *    bannières* quand plus rien ne s'y oppose.
 *  - **après le lancement** : « En attente de Jean » quand ce n'est pas mon
 *    tour, et un bouton qui entre dans la partie quand c'est le mien.
 *
 * L'écran ne calcule aucune règle : les obstacles au lancement viennent du
 * serveur (`PartySalonPayload.obstacles`), et le libellé d'attente vient du
 * protocole (`libelleAttente`).
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { MAX_PARTY_SEATS, libelleAttente } from '@auvergne/protocol';
import type { PartySalonPayload, PartySeatPublic } from '@auvergne/protocol';
import type { FactionId, HeroId } from '@auvergne/engine';
import type { StartKey } from '@auvergne/map';
import { Badge, FactionBlazon, HeroAvatar, Icon, PlayerBanner } from '@auvergne/ui';
import { navigate } from '../router.js';
import { jouerEffet } from '../landing/audio-bridge.js';
import { dateCourte } from '../screens/format.js';
import {
  ErreurPartie,
  abandonner,
  codeValide,
  copierDansPressePapier,
  jetonDe,
  lancer,
  lienDePartage,
  modifier,
  reglerIa,
  rejoindre,
} from './api.js';
import {
  DUREES,
  FormulaireBanniere,
  PROFILS_IA,
  VICTOIRES,
  libelleDepart,
  libelleFaction,
  libelleProfil,
  premierDepartLibre,
  premierHerosLibre,
  type ChoixBanniere,
  type ProfilIa,
} from './choix.js';
import { useSession, useSessionDe } from './session.js';
import { ErreurEntree, installerPartieEnLigne } from './partie.js';
import { BoutonPrevenir } from './salle.js';

/* ═══════════════════════════ Petites lectures ═════════════════════════════ */

function rangDe(slot: string): 1 | 2 | 3 | 4 | 5 {
  const n = Number(slot.replace(/^P/, ''));
  return (Number.isFinite(n) && n >= 1 && n <= MAX_PARTY_SEATS ? n : 1) as 1 | 2 | 3 | 4 | 5;
}

function herosPrisPar(joueurs: readonly PartySeatPublic[], sauf: string | null): string[] {
  return joueurs
    .filter((j) => j.slot !== sauf && typeof j.heros === 'string')
    .map((j) => j.heros as string);
}

function departsPrisPar(joueurs: readonly PartySeatPublic[], sauf: string | null): string[] {
  return joueurs
    .filter((j) => j.slot !== sauf && typeof j.depart === 'string')
    .map((j) => j.depart as string);
}

/* ══════════════════════════ Le lien à partager ════════════════════════════ */

function LienPartage({ code, lien }: { code: string; lien: string }): ReactElement {
  const [copie, setCopie] = useState<'repos' | 'fait' | 'refus'>('repos');

  useEffect(() => {
    if (copie === 'repos') return;
    const id = window.setTimeout(() => setCopie('repos'), 2600);
    return () => window.clearTimeout(id);
  }, [copie]);

  return (
    <div className="hmm-enl-lien">
      <p className="hmm-enl-code-grand jeu-tabulaire" aria-label={`Code de la partie : ${code}`}>
        {code}
      </p>
      <p className="hmm-acc-aide">
        Envoyez ce lien à vos cousins, par le moyen que vous voulez. Le premier arrivé prend la bannière
        qu’il veut.
      </p>
      <div className="hmm-enl-lien-ligne">
        <input
          className="hmm-enl-lien-champ"
          type="text"
          readOnly
          value={lien}
          onFocus={(event): void => event.currentTarget.select()}
          aria-label="Lien à partager"
        />
        <button
          type="button"
          className="hmm-acc-relancer"
          onClick={(): void => {
            jouerEffet('clic');
            void copierDansPressePapier(lien).then((ok) => setCopie(ok ? 'fait' : 'refus'));
          }}
        >
          <Icon name={copie === 'fait' ? 'valider' : 'parchemin'} size={18} />
          <span>{copie === 'fait' ? 'Lien copié' : 'Copier le lien'}</span>
        </button>
      </div>
      {copie === 'refus' ? (
        <p className="hmm-acc-aide">
          Ce navigateur refuse le presse-papier : le lien ci-dessus est sélectionné, copiez-le à la main.
        </p>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════ Une bannière ═════════════════════════════════ */

interface CarteBanniereProps {
  seat: PartySeatPublic;
  salon: PartySalonPayload;
  occupe: boolean;
  travail: boolean;
  onPrendre(slot: string): void;
  onConfier(slot: string, profil: ProfilIa): void;
  onRetirer(slot: string): void;
}

function CarteBanniere({
  seat,
  salon,
  occupe,
  travail,
  onPrendre,
  onConfier,
  onRetirer,
}: CarteBanniereProps): ReactElement {
  const [profil, setProfil] = useState<ProfilIa>('equilibre');
  const rang = rangDe(seat.slot);

  return (
    <li className={`hmm-enl-banniere${seat.moi ? ' est-moi' : ''} hmm-enl-banniere--${seat.kind}`}>
      <div className="hmm-enl-banniere-tete">
        <PlayerBanner player={rang} size={40} />
        <div className="hmm-enl-banniere-identite">
          <p className="hmm-enl-banniere-nom">
            {seat.nom ?? 'Bannière libre'}
            {seat.moi ? <span className="hmm-enl-moi"> · vous</span> : null}
          </p>
          <p className="hmm-enl-banniere-detail">
            {seat.kind === 'libre'
              ? 'Personne ne la tient encore'
              : `${libelleFaction(seat.faction)} · ${libelleDepart(seat.depart)}`}
            {seat.kind === 'ia' ? ` · adversaire ${libelleProfil(seat.profilIa).toLowerCase()}` : ''}
          </p>
        </div>
        {seat.kind === 'ia' ? (
          <Badge tone="azur" size="compact" outline>
            Adversaire
          </Badge>
        ) : seat.pret ? (
          <Badge tone="sinople" size="compact">
            Prêt
          </Badge>
        ) : seat.kind === 'humain' ? (
          <Badge tone="neutre" size="compact" outline>
            Se prépare
          </Badge>
        ) : null}
      </div>

      {seat.heros ? (
        <div className="hmm-enl-banniere-corps">
          <HeroAvatar heroId={seat.heros} size={46} />
          {seat.faction ? <FactionBlazon faction={seat.faction} size={34} /> : null}
          {seat.dernierVuLe ? (
            <span className="hmm-enl-banniere-vu">Vu {dateCourte(seat.dernierVuLe)}</span>
          ) : null}
        </div>
      ) : null}

      {seat.kind === 'libre' ? (
        <div className="hmm-enl-banniere-actions">
          {!occupe ? (
            <button
              type="button"
              className="hmm-acc-relancer"
              disabled={travail}
              onClick={(): void => onPrendre(seat.slot)}
            >
              <Icon name="banniere" size={18} />
              <span>Prendre cette bannière</span>
            </button>
          ) : null}
          {salon.hote ? (
            <div className="hmm-enl-ia">
              <label className="hmm-acc-select">
                <span className="hmm-acc-sr">Profil de l’adversaire</span>
                <select
                  value={profil}
                  disabled={travail}
                  onChange={(event): void => setProfil(event.target.value as ProfilIa)}
                >
                  {PROFILS_IA.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.text}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="hmm-acc-relancer"
                disabled={travail}
                onClick={(): void => onConfier(seat.slot, profil)}
              >
                <Icon name="engrenage" size={18} />
                <span>Confier à l’adversaire</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {seat.kind === 'ia' && salon.hote ? (
        <div className="hmm-enl-banniere-actions">
          <button
            type="button"
            className="hmm-acc-relancer"
            disabled={travail}
            onClick={(): void => onRetirer(seat.slot)}
          >
            <Icon name="croix" size={18} />
            <span>Libérer cette bannière</span>
          </button>
        </div>
      ) : null}
    </li>
  );
}

/* ══════════════════════════════ L'écran ═══════════════════════════════════ */

export interface EcranSalonProps {
  code: string;
}

export function EcranSalon({ code }: EcranSalonProps): ReactElement {
  const session = useSessionDe(code);
  const etat = useSession(session);

  const [travail, setTravail] = useState(false);
  const [avis, setAvis] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState<ChoixBanniere | null>(null);
  const [slotVise, setSlotVise] = useState<string | null>(null);
  const [entree, setEntree] = useState(false);

  const salon = etat.salon;
  const monSiege = salon?.joueurs.find((j) => j.moi) ?? null;

  /* ── Actions ──────────────────────────────────────────────────────────── */

  const executer = useCallback(
    async (action: () => Promise<PartySalonPayload | void>, succes?: string): Promise<void> => {
      setTravail(true);
      setAvis(null);
      try {
        const suite = await action();
        if (suite) session.adopterSalon(suite);
        else await session.rafraichir(true);
        if (succes) setAvis(succes);
      } catch (cause) {
        setAvis(
          cause instanceof ErreurPartie
            ? cause.message
            : 'Le serveur des parties est injoignable. Réessayez : rien n’est perdu.',
        );
      } finally {
        setTravail(false);
      }
    },
    [session],
  );

  const ouvrirBrouillon = useCallback(
    (slot: string): void => {
      if (!salon) return;
      jouerEffet('clic');
      const herosPris = herosPrisPar(salon.joueurs, slot);
      const departsPris = departsPrisPar(salon.joueurs, slot);
      const faction: FactionId = rangDe(slot) % 2 === 1 ? 'granit' : 'ermitage';
      setSlotVise(slot);
      setBrouillon({
        nom: '',
        faction,
        heros: premierHerosLibre(faction, herosPris),
        depart: premierDepartLibre(departsPris),
      });
    },
    [salon],
  );

  const confirmerBrouillon = useCallback((): void => {
    if (!brouillon || !slotVise) return;
    if (brouillon.nom.trim().length === 0) {
      setAvis('Il faut un nom pour cette bannière : celui que vos cousins liront.');
      return;
    }
    jouerEffet('clic_lourd');
    void executer(async () => {
      const rejoint = await rejoindre(code, {
        slot: slotVise as 'P1' | 'P2' | 'P3' | 'P4' | 'P5',
        nom: brouillon.nom.trim(),
        faction: brouillon.faction,
        heros: brouillon.heros,
        depart: brouillon.depart,
      });
      setBrouillon(null);
      setSlotVise(null);
      return rejoint.salon;
    }, 'Bannière prise. Vous pouvez encore tout changer avant le lancement.');
  }, [brouillon, code, executer, slotVise]);

  const majMonSiege = useCallback(
    (patch: Partial<ChoixBanniere>): void => {
      if (!monSiege) return;
      void executer(() =>
        modifier(code, {
          ...(patch.nom === undefined ? {} : { nom: patch.nom }),
          ...(patch.faction === undefined ? {} : { faction: patch.faction }),
          ...(patch.heros === undefined ? {} : { heros: patch.heros }),
          ...(patch.depart === undefined ? {} : { depart: patch.depart }),
        }),
      );
    },
    [code, executer, monSiege],
  );

  const basculerPret = useCallback((): void => {
    if (!monSiege) return;
    jouerEffet('clic');
    void executer(() => modifier(code, { pret: !monSiege.pret }));
  }, [code, executer, monSiege]);

  const entrerDansLaPartie = useCallback((): void => {
    const charge = etat.etat;
    if (!charge) return;
    jouerEffet('clic_lourd');
    setEntree(true);
    setAvis(null);
    void (async (): Promise<void> => {
      try {
        await installerPartieEnLigne(charge);
        navigate({ name: 'partie' });
      } catch (cause) {
        setAvis(
          cause instanceof ErreurEntree
            ? cause.message
            : 'La partie n’a pas pu être ouverte sur cet appareil.',
        );
      } finally {
        setEntree(false);
      }
    })();
  }, [etat.etat]);

  /* ── Rendu ────────────────────────────────────────────────────────────── */

  if (!codeValide(code)) {
    return (
      <div className="hmm-acc-ecran">
        <header className="hmm-acc-ecran-tete">
          <button type="button" className="hmm-acc-retour" onClick={(): void => navigate({ name: 'en-ligne' })}>
            <Icon name="chevron" size={18} />
            <span>Retour aux parties</span>
          </button>
          <h2 className="hmm-acc-ecran-titre">Code inconnu</h2>
          <p className="hmm-acc-ecran-sous-titre">
            «&nbsp;{code}&nbsp;» n’a pas la forme d’un code de partie. Un code ressemble à
            «&nbsp;FOREZ-7K2P&nbsp;» : un nom du Forez, un tiret, quatre caractères.
          </p>
        </header>
      </div>
    );
  }

  const lien = salon?.lien ?? lienDePartage(code);
  const enSalon = etat.statut === 'salon' || etat.statut === 'inconnu';
  const jeSuisDedans = jetonDe(code) !== null;

  return (
    <div className="hmm-acc-ecran hmm-acc-ecran--assistant">
      <header className="hmm-acc-ecran-tete">
        <button type="button" className="hmm-acc-retour" onClick={(): void => navigate({ name: 'en-ligne' })}>
          <Icon name="chevron" size={18} />
          <span>Retour aux parties</span>
        </button>
        <h2 className="hmm-acc-ecran-titre">
          {etat.statut === 'terminee' ? 'Partie terminée' : enSalon ? 'Le salon' : 'La partie court'}
        </h2>
        <p className="hmm-acc-ecran-sous-titre">
          {enSalon
            ? 'Chacun choisit sa bannière, sa maison et son héros. Quand tout le monde est prêt, l’hôte lève les bannières.'
            : etat.monTour
              ? 'La main est à vous. Prenez le temps qu’il faut : la partie vous attend.'
              : (etat.attente ?? libelleAttente(null))}
        </p>
      </header>

      {etat.horsLigne ? (
        <p className="hmm-enl-alerte" role="status">
          <Icon name="alerte" size={18} />
          <span>Le serveur ne répond plus. On réessaie tout seul : ne fermez rien.</span>
        </p>
      ) : null}
      {etat.erreur ? (
        <p className="hmm-enl-alerte" role="alert">
          <Icon name="alerte" size={18} />
          <span>{etat.erreur}</span>
        </p>
      ) : null}
      {avis ? (
        <p className="hmm-enl-alerte hmm-enl-alerte--douce" role="status">
          <Icon name="information" size={18} />
          <span>{avis}</span>
        </p>
      ) : null}

      {etat.chargement && !salon ? (
        <div className="hmm-acc-bloc">
          <p className="hmm-acc-aide">On ouvre le salon…</p>
        </div>
      ) : null}

      {/* ── La partie est lancée : salle d'attente ou entrée en jeu ── */}
      {!enSalon && etat.statut === 'en_cours' ? (
        <section className="hmm-acc-bloc hmm-enl-attente" aria-labelledby="enl-tour">
          <h3 className="hmm-acc-bloc-titre" id="enl-tour">
            {etat.monTour ? 'À vous de jouer' : (etat.attente ?? libelleAttente(null))}
          </h3>
          {etat.monTour ? (
            <>
              <p className="hmm-acc-aide">
                Le monde est chargé depuis le serveur, brouillard compris : personne ne voit votre carte.
              </p>
              <button type="button" className="hmm-acc-lancer" disabled={entree} onClick={entrerDansLaPartie}>
                <Icon name="epee" size={22} />
                <span>{entree ? 'On déplie la carte…' : 'Entrer dans la partie'}</span>
              </button>
            </>
          ) : (
            <>
              <p className="hmm-acc-aide">
                Rien à faire pour l’instant. Cet écran se met à jour tout seul et vous préviendra —
                vous pouvez fermer l’onglet, la partie ne bouge pas.
              </p>
              <BoutonPrevenir />
            </>
          )}
          <dl className="hmm-acc-recap">
            <div>
              <dt>Code</dt>
              <dd className="hmm-acc-tabulaire">{etat.code}</dd>
            </div>
            <div>
              <dt>Ma bannière</dt>
              <dd>{monSiege?.nom ?? etat.monSlot ?? '—'}</dd>
            </div>
            <div>
              <dt>Coup n°</dt>
              <dd className="hmm-acc-tabulaire">{Math.max(0, etat.seq)}</dd>
            </div>
            <div>
              <dt>Dernier coup</dt>
              <dd>{etat.majLe ? dateCourte(etat.majLe) : '—'}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {etat.statut === 'terminee' ? (
        <section className="hmm-acc-bloc">
          <h3 className="hmm-acc-bloc-titre">La chronique est close</h3>
          <p className="hmm-acc-aide">
            {salon?.gagnant
              ? `La bannière ${salon.gagnant} l’emporte.`
              : 'La partie est terminée.'}
          </p>
        </section>
      ) : null}

      {/* ── Le salon ── */}
      {salon && enSalon ? (
        <div className="hmm-acc-assistant">
          <div className="hmm-acc-assistant-colonne">
            <section className="hmm-acc-bloc" aria-labelledby="enl-bannieres">
              <h3 className="hmm-acc-bloc-titre" id="enl-bannieres">
                Les bannières
              </h3>
              <ul className="hmm-enl-bannieres">
                {salon.joueurs.map((seat) => (
                  <CarteBanniere
                    key={seat.slot}
                    seat={seat}
                    salon={salon}
                    occupe={monSiege !== null}
                    travail={travail}
                    onPrendre={ouvrirBrouillon}
                    onConfier={(slot, profil): void => {
                      void executer(() =>
                        reglerIa(code, { slot: slot as 'P1' | 'P2' | 'P3' | 'P4' | 'P5', action: 'confier', profil }),
                      );
                    }}
                    onRetirer={(slot): void => {
                      void executer(() =>
                        reglerIa(code, { slot: slot as 'P1' | 'P2' | 'P3' | 'P4' | 'P5', action: 'retirer' }),
                      );
                    }}
                  />
                ))}
              </ul>
            </section>

            {brouillon && slotVise ? (
              <section className="hmm-acc-bloc" aria-labelledby="enl-choix">
                <h3 className="hmm-acc-bloc-titre" id="enl-choix">
                  Bannière {rangDe(slotVise)} — vos choix
                </h3>
                <FormulaireBanniere
                  valeur={brouillon}
                  rang={rangDe(slotVise)}
                  disabled={travail}
                  herosPris={herosPrisPar(salon.joueurs, slotVise)}
                  departsPris={departsPrisPar(salon.joueurs, slotVise)}
                  onChange={(patch): void => setBrouillon((p) => (p ? { ...p, ...patch } : p))}
                />
                <div className="hmm-enl-actions">
                  <button
                    type="button"
                    className="hmm-acc-lancer"
                    disabled={travail}
                    onClick={confirmerBrouillon}
                  >
                    <Icon name="valider" size={20} />
                    <span>Prendre cette bannière</span>
                  </button>
                  <button
                    type="button"
                    className="hmm-acc-relancer"
                    disabled={travail}
                    onClick={(): void => {
                      setBrouillon(null);
                      setSlotVise(null);
                    }}
                  >
                    <Icon name="croix" size={18} />
                    <span>Annuler</span>
                  </button>
                </div>
              </section>
            ) : null}

            {monSiege && !brouillon ? (
              <section className="hmm-acc-bloc" aria-labelledby="enl-moi">
                <h3 className="hmm-acc-bloc-titre" id="enl-moi">
                  Ma bannière
                </h3>
                <FormulaireBanniere
                  rang={rangDe(monSiege.slot)}
                  disabled={travail || monSiege.pret}
                  herosPris={herosPrisPar(salon.joueurs, monSiege.slot)}
                  departsPris={departsPrisPar(salon.joueurs, monSiege.slot)}
                  valeur={{
                    nom: monSiege.nom ?? '',
                    faction: (monSiege.faction ?? 'granit') as FactionId,
                    heros: (monSiege.heros ?? '') as HeroId,
                    depart: (monSiege.depart ?? '') as StartKey,
                  }}
                  onChange={majMonSiege}
                />
                <div className="hmm-enl-actions">
                  <button
                    type="button"
                    className={monSiege.pret ? 'hmm-acc-relancer' : 'hmm-acc-lancer'}
                    disabled={travail}
                    onClick={basculerPret}
                  >
                    <Icon name={monSiege.pret ? 'croix' : 'valider'} size={20} />
                    <span>{monSiege.pret ? 'Je ne suis plus prêt' : 'Je suis prêt'}</span>
                  </button>
                  <button
                    type="button"
                    className="hmm-acc-relancer"
                    disabled={travail}
                    onClick={(): void => {
                      jouerEffet('clic');
                      void executer(() => abandonner(code), 'Vous avez quitté cette partie.');
                    }}
                  >
                    <Icon name="croix" size={18} />
                    <span>Quitter la partie</span>
                  </button>
                </div>
                {monSiege.pret ? (
                  <p className="hmm-acc-aide">
                    Vos choix sont figés tant que vous êtes prêt. Décochez pour les reprendre.
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>

          <aside className="hmm-acc-assistant-aside" aria-label="Le lien de la partie">
            <div className="hmm-acc-parchemin">
              <h3 className="hmm-acc-bloc-titre">Le lien</h3>
              <LienPartage code={salon.code} lien={lien} />

              <dl className="hmm-acc-recap">
                <div>
                  <dt>Bannières</dt>
                  <dd className="hmm-acc-tabulaire">{salon.bannieres}</dd>
                </div>
                <div>
                  <dt>Durée</dt>
                  <dd>{DUREES.find((d) => d.id === salon.duree)?.name ?? salon.duree}</dd>
                </div>
                <div>
                  <dt>Victoire</dt>
                  <dd>{VICTOIRES.find((v) => v.id === salon.victoire)?.name ?? VICTOIRES[0].name}</dd>
                </div>
                <div>
                  <dt>Ouverte le</dt>
                  <dd>{dateCourte(salon.creeLe)}</dd>
                </div>
              </dl>

              {salon.obstacles.length > 0 ? (
                <ul className="hmm-acc-anomalies">
                  {salon.obstacles.map((o) => (
                    <li key={o}>
                      <Icon name="alerte" size={16} />
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {salon.hote ? (
                <button
                  type="button"
                  className="hmm-acc-lancer"
                  disabled={travail || salon.obstacles.length > 0}
                  onClick={(): void => {
                    jouerEffet('clic_lourd');
                    void executer(() => lancer(code));
                  }}
                >
                  <Icon name="banniere" size={22} />
                  <span>Lever les bannières</span>
                </button>
              ) : (
                <p className="hmm-acc-aide">
                  {jeSuisDedans
                    ? 'C’est l’hôte qui lève les bannières. Vous pouvez fermer l’onglet : votre place est gardée.'
                    : 'Prenez une bannière libre pour rejoindre la partie.'}
                </p>
              )}

              <BoutonPrevenir />
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
