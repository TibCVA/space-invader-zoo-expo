# Prompt pour Claude Code — intégrer ImageGen vague 3

Copie le bloc ci-dessous tel quel dans Claude Code après avoir récupéré la
branche `claude/hmm-auvergne-game-uesdlz`.

---

Tu reprends le projet Auvergne depuis la branche
`claude/hmm-auvergne-game-uesdlz`. Un lot ImageGen vague 3 complet est déjà dans
le dépôt. Ne régénère pas, ne renomme pas et ne recomprime pas les images.

Lis d'abord, dans cet ordre :

1. `docs/05-ASSETS.md` — contrat des chemins, clefs et replis ;
2. `docs/01-ART-BIBLE.md`, sections 0 et 2 — palette et lumière ;
3. `docs/10-BRIEF-IMAGEGEN-VAGUE-3.md` — intention de chaque vague ;
4. `docs/reference/ASSET-QA-WAVE3-2026-08-20.md` — preuves et état réel ;
5. `docs/reference/IMAGEGEN-WAVE3-TRACE.json` — traçabilité fichier par fichier.

## Ce qui est déjà livré et ne doit pas être refait

- 12 textures répétables 512 × 512 dans `public/img/terrain/` ;
- 61 décors RGBA aux chemins exacts dans `public/img/decor/` ;
- 13 icônes RGBA dans `public/img/carte/` ;
- 6 fonds opaques 1024 × 640 dans `public/img/combat/` ;
- 7 études RGBA hors bundle dans `docs/reference/creatures/vague3/` ;
- manifeste v3 de 197 entrées, 11 357 618 octets sur 12 582 912 ;
- validateurs, planches de contact et trace ImageGen complète.

Les 61 décors et 13 icônes sont déjà substitués par leurs clefs exactes. Les six
pinceaux historiques `herbe`, `aiguilles`, `roche`, `tourbe`, `gravier`, `eau`
restent consommés par le combat. Ne modifie pas ce chemin et ne supprime jamais
le repli procédural.

## Déjà intégré — matières de pays sur la carte d'aventure

Le commit Claude `c72953e` a raccordé les douze tuiles au sol avant l'arrivée de
ce pack. Ne refais pas ce travail. Préserve `art/matiere-sol.ts`, sa pyramide de
réduction, sa phase monde stable, le placement dans `render/terrain.ts` et la
table `sol` de `render/cantons.ts`. Une clef ou image absente doit continuer à
retomber sans bruit sur le rendu procédural.

Table de sélection contractuelle :

| Matière | Pays |
|---|---|
| `herbe_estive` | Hauts d'Arconsat, Grande Chaussée |
| `herbe_grasse` | Vallée de la Durolle, Marche de La Renaudie |
| `aiguilles_noires` | Cœur des Bois Noirs |
| `roche_carrier` | Vollore, Pamole |
| `roche_chaude` | Cervières, Maison du Trésor |
| `lande_callune` | Hermitage, Peyrotine |

Vérifie seulement sur les trois captures que cette sélection demeure visible
mais discrète. Ne compare pas des libellés affichés et n'invente pas une
treizième région.

## Travail 1 — fonds peints de combat

Branche les clefs suivantes dans `battle/field.ts` :

- pâture → `combat_prairie` ;
- futaie → `combat_foret` ;
- chaos/dalle rocheuse → `combat_rocher` ;
- hautes chaumes/callune → `combat_lande` ;
- sagne/tourbe humide → `combat_humide` ;
- franchissement/pont → `combat_pont`.

Le fond est une couche décorative 1024 × 640 sous la grille, les obstacles, les
unités et tous les indicateurs. Utilise un recadrage couvrant stable, conserve le
centre calme prévu dans les images, et ajoute seulement une modulation sombre
très légère si la grille ou une faction perd du contraste. Ne dessine jamais le
fond au-dessus des hexagones ni dans le HUD. Si la texture est absente ou
invalide, le fond procédural actuel doit rester strictement fonctionnel.

Ne déduis pas `combat_pont` d'un simple sol gravier : utilise la nature réelle du
champ de bataille ou son décor de franchissement. Si le moteur ne possède pas
encore cette information, garde le repli et documente le point au lieu de faire
une heuristique fragile.

## Travail 2 — études de créatures

Les sept fichiers de `docs/reference/creatures/vague3/` sont des références de
resculpture uniquement :

- encolure et tête des chevaux du Chevalier du Forez et du Banneret ;
- Griffon de Pamole, Vouivre de la Durolle, Sanglier Cuirassé, Cerf des Sources,
  Colosse de Granite.

Améliore les rigs procéduraux et leurs matériaux à partir de ces références si
la resculpture est dans ton lot. Ne transforme jamais ces études en billboards
de combat. Préserve animation, orientation de faction, hitbox, ombre au sol,
états améliorés, flash de dégâts et repli procédural. Les images de référence ne
vont pas dans `public/img` ni dans le manifeste.

## Interdits

- ne pas inventer `carte_citadelle` ou `carte_chateau` : ces clefs n'existent pas ;
- ne pas renommer les clefs ou chemins du manifeste ;
- ne pas supprimer les générateurs procéduraux ;
- ne pas aplatir les créatures animées en sprites statiques ;
- ne pas dépasser le budget de 12 Mo ;
- ne pas valider visuellement sur une seule échelle.

## Tests obligatoires avant de rendre

```bash
python tools/validate_wave3_assets.py
node tools/validate_wave3_assets.mjs
python tools/validate_asset_manifest.py
node tools/validate_wave2_assets.mjs
npx --yes pnpm@10.33.0 typecheck
npx --yes pnpm@10.33.0 test
npx --yes pnpm@10.33.0 --filter @auvergne/client build
node tools/validate_wave3_runtime.mjs
node tools/screenshot.mjs carte carte_pres carte_loin combat --dir shots/vague3-integration
```

Si `pnpm` n'est pas une commande globale, construis explicitement client et
serveur avec `npx --yes pnpm@10.33.0`, puis lance le harnais avec `--no-build`.

Le résultat n'est GO que si : zéro entrée ignorée dans `rapportAssets()`, zéro
erreur console, les matières de pays sont visibles mais discrètes aux trois
zooms, les fonds de combat ne gênent aucune unité ou case, et les captures
bureau/iPhone sont toutes inspectées. Donne les chemins des captures et les
résultats chiffrés ; ne conclus jamais depuis le build seul.

---
