# Parties en ligne asynchrones — spécification

> Objectif d'usage : cinq cousins, chacun sur son iPhone ou son PC, jouent une
> partie sur plusieurs jours ou plusieurs semaines. Chacun joue quand il peut.
> La partie ne se perd jamais. **Aucun compte, aucun mot de passe, aucune
> installation.** Une seule adresse à partager.

## 1. Le parcours, du point de vue des joueurs

1. **Thibaut** ouvre le site, clique **Nouvelle partie**, choisit *En ligne*,
   règle le nombre de bannières (2 à 5), la durée et le mode de victoire.
2. Le jeu crée la partie et affiche un **code de six caractères** (ex. `FOREZ-7K2P`)
   et un **lien à partager**. Un bouton copie le lien.
3. Thibaut envoie le lien à ses cousins par le moyen qu'il veut.
4. Chaque cousin ouvre le lien. Il voit le **salon** : la liste des bannières,
   celles déjà prises, celles libres. Il choisit une bannière libre, puis :
   - son **nom** (libre) ;
   - son **château** : Châtellenie de Granit ou Ermitage des Bois Noirs ;
   - son **héros de départ**, dont le portrait devient son **avatar** ;
   - sa **position de départ** parmi celles encore disponibles.
5. Les places non réclamées peuvent être laissées à l'**intelligence artificielle**,
   avec un profil au choix, ou retirées.
6. Quand tout le monde est prêt, l'hôte clique **Lever les bannières**. La partie
   commence.
7. À chaque connexion, un joueur retombe directement dans la partie. Si c'est son
   tour, il joue. Sinon il voit **« En attente de Jean »** et peut consulter sa
   carte, ses cités et ses héros librement.
8. La partie est sauvegardée **après chaque action**, côté serveur. Fermer
   l'onglet, changer de téléphone, revenir trois jours plus tard : rien n'est perdu.

## 2. Principes de conception

| Décision | Raison |
|---|---|
| **Un seul lien partagé**, pas un lien par joueur | Le plus simple à utiliser. Le premier arrivé prend la bannière qu'il veut. |
| **Aucun compte** | Le navigateur mémorise un jeton de joueur (`localStorage` + cookie). Rien à retenir. |
| **Interrogation périodique**, pas de WebSocket | Un jeu au tour par tour sur plusieurs jours n'a aucun besoin de temps réel. Moins de code, moins de pannes, aucune reconnexion à gérer, et ça traverse tous les réseaux mobiles. |
| **Serveur autoritaire** | Le client envoie une intention, le serveur valide et exécute. Personne ne peut modifier ses ressources. |
| **Tour séquentiel** | Conforme au document maître §14.2. Un seul joueur modifie le monde à la fois. |
| **Pas de minuteur par défaut** | Le mode « à notre rythme » est le mode normal. Un minuteur optionnel de 24 h reste proposé. |

### Rythme d'interrogation

- Onglet actif, ce n'est pas mon tour : toutes les **5 s**.
- Onglet actif, c'est mon tour : aucune interrogation (rien ne peut changer).
- Onglet en arrière-plan : toutes les **60 s**.
- Après 10 minutes sans interaction : toutes les **5 min**, jusqu'à un geste.

L'interrogation ne renvoie que `{ seq, activePlayer, updatedAt }` — quelques
dizaines d'octets. L'état complet n'est retéléchargé que si `seq` a changé.

## 3. Modèle de données

Ajout à `apps/server/src/storage/` (Postgres, avec le même repli fichier) :

```
parties            id, code, hote, setup, statut, seq, active_player,
                   engine_version, content_version, map_version,
                   cree_le, maj_le, terminee_le, gagnant
partie_joueurs     partie_id, slot (P1..P5), jeton (secret), nom, faction,
                   heros, depart, avatar, kind (humain|ia), profil_ia,
                   pret, dernier_vu_le
partie_etats       partie_id, seq, etat (jsonb compressé), hash
partie_commandes   partie_id, seq, joueur, commande (jsonb), cle_idempotence,
                   applique_le
```

`partie_etats` conserve un instantané complet à chaque fin de tour et toutes les
20 commandes ; `partie_commandes` conserve le journal intégral. Les deux
ensemble permettent le rejeu, la vérification de hash et une reprise après
incident.

## 4. API

Toutes les réponses d'erreur gardent le format français `{ erreur, code }`.

| Route | Rôle |
|---|---|
| `POST /api/parties` | Crée une partie. Corps : `{ bannieres, duree, victoire, graine? }`. Retourne `{ code, lien, jeton }` — le jeton fait de l'appelant l'hôte. |
| `GET /api/parties/:code` | Salon ou état public : bannières, joueurs, statut, `seq`. |
| `POST /api/parties/:code/rejoindre` | Réclame une bannière. Corps : `{ slot, nom, faction, heros, depart }`. Retourne le **jeton de joueur** à conserver. |
| `POST /api/parties/:code/modifier` | Change nom / faction / héros / départ avant le lancement. |
| `POST /api/parties/:code/ia` | L'hôte remplit une bannière libre par une IA, ou la retire. |
| `POST /api/parties/:code/lancer` | L'hôte lance la partie. Valide que tout est cohérent. |
| `GET /api/parties/:code/etat?depuis=:seq` | État complet si `seq` a changé, sinon `304`. |
| `GET /api/parties/:code/pouls` | `{ seq, activePlayer, updatedAt }`. Réponse minimale d'interrogation. |
| `POST /api/parties/:code/commande` | Envoie une `Command`. En-tête `X-Jeton-Joueur`. Corps : `{ commande, cleIdempotence, seqAttendu }`. |
| `POST /api/parties/:code/abandonner` | Quitter la partie ; la bannière passe à l'IA. |
| `GET /api/parties/mes-parties` | Les parties où mon navigateur possède un jeton. |

### Règles de validation, côté serveur uniquement

- Le jeton doit correspondre à une bannière de cette partie.
- La commande n'est acceptée que si l'expéditeur est `activePlayer`
  (exception : `Surrender`, toujours autorisée).
- `cleIdempotence` : rejouer la même commande après une reconnexion mobile
  renvoie le résultat déjà calculé, sans double application.
- `seqAttendu` : si le client est en retard, réponse `409` avec l'état à jour.
- Les tours des joueurs IA sont exécutés par le serveur immédiatement après le
  tour humain qui les précède, dans la même transaction.

## 5. Ce que voit un joueur qui attend

Le brouillard de guerre reste **par joueur** : personne ne voit les cartes des
autres. Pendant l'attente, un joueur peut consulter sa carte, ses cités, ses
héros, préparer une file de construction et calculer un trajet. Ces actions sont
prévisionnelles et ne sont validées qu'au début de son tour.

## 6. Rappel « c'est ton tour »

Aucune notification par courriel ni par SMS : trop de complexité pour l'usage
visé. À la place :

- le **titre de l'onglet** devient « ▸ À toi de jouer — Auvergne » ;
- une **notification du navigateur** si le joueur l'a autorisée (`Notification`
  API, purement locale, aucune infrastructure) ;
- l'écran d'accueil affiche un bandeau **« C'est ton tour dans 2 parties »**.

## 7. Le mode local reste disponible

« Nouvelle partie » propose deux modes :

- **Sur cet appareil** — tout le monde joue sur le même écran, ou seul contre l'IA.
  Sauvegardes locales et serveur, comme aujourd'hui.
- **En ligne, chacun chez soi** — le parcours décrit ci-dessus.

Le moteur, les règles et l'interface sont identiques dans les deux cas : seule la
source de l'état change (état local, ou état distant interrogé).

## 8. Limites assumées

- Pas de reprise de tour ni d'annulation une fois la commande envoyée : le rythme
  « sélection → prévisualisation → confirmation » du client sert de garde-fou.
- Pas de classement, pas de tournoi, pas d'observateurs.
- Une partie inactive depuis 6 mois peut être purgée ; un avertissement est
  affiché à partir de 5 mois.
