# Space Invader Zoo — EXPO

Version **exceptionnelle** intégrant toutes les idées avancées + **mode EXPO** autonome.

## Points saillants
- **Vision** : fond via bords → distance **YUV** → **Otsu** → morpho → composante dominante → contour + **homographie** (rectification) → grille par **autocorr** → **réparation symétrique** (axe vertical) → palette **k‑means**.
- **3D** : carreaux chanfreinés en **InstancedMesh**, matériaux physiques (clearcoat), émission douce.
- **Planète** : fBM + crêtes, biomes, océan brillant, nuages, atmosphère, **lumières nocturnes** et **aurores**.
- **Post‑processing** : **SMAA** (anti‑aliasing) avec **fallback FXAA**, **SSAO** subtil, bloom léger.
- **Animation** : **boids géodésiques** + évitement pentes, bobbing, focus au clic.
- **Audio** : **bips 8‑bit** discrets (spawn, focus, proximité). Activation au 1er clic (restriction navigateur).
- **Mode EXPO** : caméra autopilotée + cycle jour/nuit continu; UI masquée (bouton ✱ pour quitter).

## Déploiement GitHub Pages
1. Créez un dépôt (ex. `space-invader-zoo-expo`) et uploadez **tout** ce dossier.
2. *Settings → Pages* → **Deploy from a branch** → `main` → `/ (root)`.
3. Ouvrez l’URL fournie. 100% statique.

## Utilisation rapide
- **+ Ajouter** vos photos, ou **Exemples**.
- Boutons : **🎞 EXPO** (toggle), **📸** (capture), **🗑** (vider), **⚙️** (options).  
- Panneau **⚙️** (replié par défaut) : *Seuil+*, *Chanfrein*, *Espacement*, *Relief*, *Heure*, *Relief planète*, *Max invaders*, *Expo speed/zoom/pause*, *Auto*.

## Licence
Usage libre pour démo/étude. Respectez les droits d’auteur des images importées.
