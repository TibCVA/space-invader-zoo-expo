#!/usr/bin/env node
/** Build the generated-image manifest with exact file sizes and checksums. */

import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_SPECS } from './wave2_asset_specs.mjs';
import { PUBLIC_SPECS as WAVE3_PUBLIC_SPECS } from './wave3_asset_specs.mjs';

const root = process.cwd();
const imageRoot = join(root, 'apps', 'client', 'public', 'img');

const portraitStyle =
  "Portrait de jeu peint à la main, cadrage poitrine 4:5, silhouette lisible à 56 px, personnage européen blanc entièrement fictif sans ressemblance réelle. Enluminure vivante et naturalisme romantique, pigments médiévaux, précision de matière et lumière de jeu moderne, grain de pinceau visible; ni photoréaliste, ni cartoon, ni anime, ni 3D lissée. Source unique nord-ouest 315°/38°, lumière ambre #FFE9C2, ombres bleu-violet #3A4657, liseré vieil or #C9A227. Vêtements crédibles du Forez médiéval, traits naturels non idéalisés. Aucun cadre, texte, chiffre, logo, signature, filigrane, contour noir, objet moderne, couronne, bijou excessif ni personne supplémentaire.";

const portraitFaction = {
  granit:
    "Fond doux d'appareil de granit et étoffe grenat sans emblème. Palette #2A2C2F #4A4E52 #6E1F2A #C9A227 #414A52 #5A4128 #8FA6B8 #E8DCC0.",
  ermitage:
    "Fond doux de futaie, pierre claire et brume. Palette #1B3A2B #7C8F6B #4E8977 #9FB4C2 #CFC6B4 #2F3B2E #6B5433 #C9A227.",
  neutre:
    "Fond de col où granit et forêt se rencontrent. Palette #2A2C2F #4A4E52 #6E1F2A #1B3A2B #7C8F6B #4E8977 #C9A227 #8FA6B8.",
};

const portraits = [
  ['paul', 'granit', 'Paul, 29 ans, chef de cavalerie de montagne taciturne, maigre et tanné par les convois de sel; cheveux châtain sombre courts, barbe compacte, yeux gris-vert, maille, gambison ardoise et manteau grenat fermé par une petite tête de cheval en vieil or.', 'exec-75dd9fe1-1f8a-4d2b-83a3-241246809650'],
  ['thibaut', 'granit', 'Thibaut, 43 ans, maître précis des routes et relais; homme trapu au visage carré buriné, cheveux brun cendré dégarnis, forte moustache, bonnet de voyage en cuir à oreillettes, carnet de peau fermé et cape grenat.', 'exec-6beec613-bdba-4360-af80-f97b2f70b6e2'],
  ['loic', 'granit', 'Loïc, 39 ans, administrateur humaniste du grenier à sel; visage rond et intelligent, boucles sombres, joues rasées, sourcil sceptique, coiffe de lin ivoire sous capuchon ardoise, petit fermoir-balance et doigt taché d’encre.', 'exec-4f35b115-02b9-4979-8098-327d68ddd154'],
  ['matthieu', 'granit', 'Matthieu, 36 ans, ancien charpentier de moulins devenu ingénieur de siège; carrure puissante, nez cassé, côtés rasés et petit nœud de cheveux, corde de mesure et maillet de bois, jacque ardoise et demi-cape grenat.', 'exec-7f7cbf74-b791-43b5-bdd1-e41345d84904'],
  ['clotilde', 'granit', 'Clotilde, 34 ans, dirigeante calme de quarante brodeuses au fil d’or; femme compacte et assurée, taches de rousseur, cheveux roux en double couronne tressée, bandeau ivoire, robe grenat, surcot ardoise, bobine d’or et doigts calleux.', 'exec-1f9327a2-3dde-4bac-ab0b-6c9b92b435a9'],
  ['caroline', 'granit', 'Caroline, 46 ans, intendante et contrôleuse des chantiers; femme grande et sèche au long visage, nez marqué, cheveux sombres striés d’argent sous une barbette ivoire angulaire, robe grenat sévère, trois clefs de fer et jeton vierge.', 'exec-22c1b22f-7aac-4a33-b78f-0bd1f2032775'],
  ['thomas', 'granit', 'Thomas, 49 ans, maître archer patient des Farges; homme nerveux au visage étroit et très buriné, cheveux courts reculés, yeux bleu pâle visant au loin, capuchon d’archer ardoise, brassard de cuir et extrémité d’un unique carreau.', 'exec-61ec77c2-32d4-4405-8d5d-cb4f32ee06c5'],
  ['georges', 'granit', 'Georges, 61 ans, vieux gouverneur défensif de la porte de Bise; homme massif au visage profondément ridé, barbe argentée carrée, cicatrice au sourcil, coiffe matelassée ardoise, maille usée, manteau brun bordé grenat et lourde clef de mur.', 'exec-4ca6c292-44ca-4312-831e-ed83dc5de8c7'],
  ['auguste', 'granit', 'Auguste, 56 ans, ancien porte-parole du comte, lent et infaillible sur les serments; homme grand, yeux bruns lourds, cheveux gris, barbe bifide poivre et sel, haute toque ardoise, manteau grenat et parchemin roulé sans écriture.', 'exec-64dd9c9d-7c4c-4733-b448-c4ddfa82b22a'],
  ['josephine', 'granit', 'Joséphine, 42 ans, diplomate villageoise née dans un hameau de six feux; femme courte et robuste, visage franc et tavelé, cheveux châtains grisonnants sous simple capuchon d’avoine, châle grenat et fermoir de deux mains jointes.', 'exec-505ae816-68df-4ae1-99ed-e55241f57b66'],
  ['anastasia', 'ermitage', 'Anastasia, 45 ans, prieure silencieuse du col des Sagnes et correctrice des traités de brume; femme grande et mince au visage pâle, cheveux noirs fortement argentés, voile vert profond à pli sauge, yeux gris et folio fermé sans écriture.', 'exec-d5b84c35-c49a-4fbf-9b34-7461df659be6'],
  ['mathilde', 'ermitage', 'Mathilde, 54 ans, prieure d’hospice lucide sur les limites de la guérison; femme large et forte au visage carré compatissant, yeux bleu-gris fatigués, wimple de lin pierre sous capuchon sauge, fiole d’eau claire et sachet d’herbes.', 'exec-0f3bfd6b-4129-403a-9cb6-d054b312fc83'],
  ['agathe', 'ermitage', 'Agathe, 31 ans, éleveuse de hulottes et éclaireuse des crêtes; femme nerveuse et tavelée, longue tresse blond sombre, petit chapeau de chasse sauge, manteau vert profond et une hulotte fauve anatomiquement juste posée sur son gant.', 'exec-14df6dbf-5360-402b-9655-85ab5b2ba042'],
  ['roxane', 'ermitage', 'Roxane, 28 ans, ancienne braconnière devenue capitaine d’embuscade; femme compacte au visage étroit et nez tordu, regard latéral sombre, tresses noires sous capuchon vert bas, laine mousse et fougère à petites pièces irrégulières.', 'exec-91a119a1-8f44-4da1-86b8-e5117c996fce'],
  ['jean', 'ermitage', 'Jean, 38 ans, meneur de meute qui commande par sa position; homme nerveux et large, boucles sombres, barbe irrégulière, moitié supérieure de l’oreille gauche manquante, col de laine grise, main cicatrisée avec un doigt absent, sans gore.', 'exec-dde6119d-6357-42e2-af91-67801a9ee323'],
  ['alice', 'ermitage', 'Alice, 24 ans, jeune trouvée de la forêt qui demande aux racines et aux menhirs; petite femme au front large, taches de rousseur, yeux gris-vert, boucles châtain en couronne lâche de fibres de racine, main sur une ronce vivante.', 'exec-57f412aa-1755-452d-85ff-33dbaf937657'],
  ['ines', 'ermitage', 'Inès, 40 ans, marcheuse qui a relevé chaque chemin de dévotion; femme maigre au long visage tanné, deux tresses brun cendré grisonnantes sous vaste capuchon sauge, manteau vert, cordon de perles de pierre et bâton de frêne.', 'exec-aa5e1f08-a274-43de-bee5-b2d0e4d716b2'],
  ['gustave', 'ermitage', 'Gustave, 52 ans, ancien carrier qui éveille les colosses; homme exceptionnellement massif, crâne dégarni, nez aplati, barbe grise courte, habit de carrière vert sans manches, énorme main droite blanchie de poussière de granit.', 'exec-57ad5319-4519-430f-8067-261403c17d1e'],
  ['come', 'ermitage', 'Côme, 61 ans, prieur maigre qui observe le ciel depuis trente et un ans; long visage ridé, grandes oreilles rouges au vent, cheveux blancs, yeux gris levés, haut capuchon bleu profond replié, broche-girouette et carnets fermés.', 'exec-a70c6222-87c3-4e8a-928b-e04f946a4d57'],
  ['lise', 'ermitage', 'Lise, 27 ans, médiatrice taciturne des profondeurs de la Durolle; jeune femme mince au visage pâle, yeux bleu d’orage, fine cicatrice à la tempe, longue tresse noire humide mêlée de fil verdigris, cape bleu profond et galet lisse.', 'exec-62638043-1ca2-4812-a099-6e2db7b4e7a3'],
  ['jules', 'neutre', 'Jules, 47 ans, gardien neutre des bornes et des limites secrètes; voyageur au visage asymétrique, nez cassé, cheveux sable grisonnants, barbe courte, un œil vert et un noisette, manteau réversible moitié grenat moitié forêt, corde et ciseau.', 'exec-efcea665-9710-48a6-9af2-93f10e52e8d0'],
];

const cityStyle =
  "Fond de cité 16:9 peint à la main, enluminure vivante et naturalisme romantique, pigments médiévaux, précision minérale et botanique, grain de pinceau visible; ni photoréaliste, ni cartoon, ni anime, ni 3D. Caméra fixe en plongée légère. Aucun bâtiment avancé ni monument constructible: seulement fondations, chemins, petits abris anonymes et zones calmes pour les couches du moteur. Lumière nord-ouest 315°/38°, #FFE9C2 contre ombres #3A4657, jamais noires. Aucun personnage, animal, véhicule, texte, chiffre, logo, signature, filigrane, cadre, héraldique ni objet moderne.";

const cities = [
  ['cite_granit_aube', 'cites/granit-aube.webp', 'Bourg de granit sombre sur un éperon au-dessus d’une vallée brumeuse; mêmes terrasses, murs, ruelles, maisons basses et caméra que les deux autres heures. Aube froide, brume basse et premier rayon chaud rasant.', 'exec-0808c7dd-df5c-40c3-92d3-8c713a91f48f'],
  ['cite_granit_midi', 'cites/granit-midi.webp', 'Bourg de granit sombre sur un éperon; maisons basses d’ardoise, ruelles en lacets et grands replats de construction dégagés. Midi chaud et clair, ardoises brillantes, perspective atmosphérique bleue.', 'exec-fe3a8717-e128-4091-8332-a84739d25c23'],
  ['cite_granit_crepuscule', 'cites/granit-crepuscule.webp', 'Même géométrie et caméra que le maître de midi; crépuscule or et grenat, ombres froides, brume de vallée et quelques fenêtres existantes discrètement éclairées.', 'exec-1569b369-2900-431d-b358-e173f4918e72'],
  ['cite_ermitage_aube', 'cites/ermitage-aube.webp', 'Vallon sanctuaire du Bois Noir, mêmes glades, ruisseau, pierres, passerelles, abris au cuivre vert et caméra que les deux autres heures. Aube bleue, brume au ras de l’eau et premier rayon chaud.', 'exec-0bdf12e8-7226-4435-82ff-a08bf8b60280'],
  ['cite_ermitage_midi', 'cites/ermitage-midi.webp', 'Vallon sanctuaire du Bois Noir, ruisseau clair, passerelles de bois, pierres moussues, petits abris au cuivre verdi et grandes glades de construction. Midi filtré par la futaie.', 'exec-87c058d1-9093-4c14-8c57-ad88a59d95cf'],
  ['cite_ermitage_crepuscule', 'cites/ermitage-crepuscule.webp', 'Même géométrie et caméra que le maître de midi; crépuscule forestier bleu, lune montante entre les branches, brume basse et rares cierges dans les niches existantes.', 'exec-55a5ac24-6c5e-41e2-a603-4df672e82724'],
];

const tileStyle =
  "Texture de terrain carrée strictement zénithale à 90°, homogène, sans perspective, horizon, vignette, bordure ni point focal. Enluminure vivante et naturalisme romantique traduits en matière de jeu, grain peint visible. Éclairage neutre diffus et plat, sans ombre portée ni reflet fort. Véritable tuile répétable sur les deux axes, éléments distribués à travers les bords. Aucun texte, chiffre, logo, signature, filigrane, personne, créature, bâtiment ni objet moderne.";

const terrains = [
  ['herbe', 'Prairie d’altitude rase, touffes fines, graines et minuscules fleurs crème et ocre; verts #4A6138 #2F3B2E #1E3226, brun #6B5433.', 'exec-df10e744-c73f-4bbc-935c-1b7e24ffd0a5'],
  ['aiguilles', 'Tapis humide d’aiguilles de sapin du Bois Noir, fins fragments de brindille, mousse et rares écailles de cône; aucune grosse pomme de pin.', 'exec-8964b65d-7d8f-4483-b5ed-0582ab55f6f1'],
  ['roche', 'Dalle de granit du Forez lichenée, petits cristaux, diaclases peu profondes et mousse discrète; aucune grande fissure ni dalle centrale.', 'exec-07d49e0d-836e-4465-912c-49303f2d5188'],
  ['tourbe', 'Sagne humide, coussins denses de sphaigne, tourbe noire saturée et minuscules affleurements d’eau répartis; aucun étang ni grande réflexion.', 'exec-98ac65da-c516-406f-af20-69fa3b8b77df'],
  ['gravier', 'Chemin médiéval compacté de petit gravier granitique et poussière, deux ornières parallèles très faibles et continues; aucune roue, trace ou grosse pierre.', 'exec-ab774e5c-bb1c-45ed-9c75-8a41370dd020'],
  ['eau', 'Eau claire et peu profonde sur galets arrondis, courant doux nord-ouest vers sud-est, fines rides et réfraction; aucune rive, écume, feuille, poisson ni grosse pierre.', 'exec-ed43e871-304d-4d0d-b5cb-b38ca65890d7'],
];

const materialStyle =
  "Matière carrée répétable pour multiplication sur formes vectorielles, vue orthographique plate, valeurs moyennes et faible contraste, aucun relief marqué, ombre portée, reflet fort, perspective, bord, point focal ni motif figuratif. Étude peinte à la main, enluminure vivante et naturalisme romantique. Aucun texte, chiffre, logo, signature, filigrane, cadre, objet, fixation, héraldique, personne ou créature.";

const materials = [
  ['granit', 'Granit sombre fin #2A2C2F #4A4E52, très petits grains de feldspath et mica, infimes reflets bleu brume; sans joint, fissure ni plaque de lichen.', 'exec-dd9f2723-9c31-4958-bc67-0d28d192f986'],
  ['ecorce', 'Grain d’écorce ancien de sapin et hêtre, brun pluie, fibres surtout verticales, cassures latérales retenues; sans nœud, branche coupée ni mousse épaisse.', 'exec-f0bd1bd8-270e-4c83-aa95-6196eb3d56e8'],
  ['ardoise', 'Ardoise montagneuse finement clivée #414A52 #2A2C2F #2B3A4A, lignes minérales proches; sans limite de tuile, clou, fissure ou brillance.', 'exec-37eb6d56-6786-4246-9ea9-615d1347f7d9'],
  ['parchemin', 'Fibres de parchemin ancien #E8DCC0 #C9B996, pores et marbrure chaude très douce; sans écriture, réglure, tache ronde, pli, brûlure ou déchirure.', 'exec-f7a71743-9a57-4240-a2b0-39d5ca7308e9'],
  ['cuir', 'Cuir médiéval végétal souple #5A4128 #6B5433, pores irréguliers, petites rides et usure douce; sans couture, bord, boucle, cicatrice ou motif repoussé.', 'exec-3f9425ab-702b-4f7c-9cdf-f009ac676d45'],
  ['filDor', 'Surface dense de fils dorés médiévaux #C9A227 #FFE9C2 #C08A3E, directions délicatement mêlées et éclats retenus; sans image tissée, bordure, bijou ou nœud.', 'exec-2f6cb4c2-9dd3-49cb-81d7-ecedb005083a'],
  ['cuivre', 'Cuivre patiné #4E8977 #1B3A2B avec chaleur ancienne et fines taches de vert-de-gris; sans bord de plaque, rivet, inscription, corrosion massive ou miroir.', 'exec-366ab96f-27ba-4bd0-846f-5781deb4d406'],
  ['tissu', 'Laine médiévale neutre tissée main, fil irrégulier dans un gris-brun chaud #C9B996 #6B5433 #4A4E52 #7C8F6B; sans rayure, tartan, broderie, pli ou déchirure.', 'exec-a982277a-96bf-4b2b-8b48-5cfdba5de1fb'],
];

const landingStyle =
  "Paysage peint à la main, enluminure vivante et naturalisme romantique, pigments médiévaux, atmosphère et matières précises, grain de pinceau visible; ni photoréaliste, ni cartoon, ni anime, ni 3D. Crépuscule du Forez, lumière nord-ouest 315° basse, ambre #FFE9C2 et vieil or #C9A227, ombres bleu-violet #3A4657, brume #8FA6B8, ciel #2B3A4A et nuages grenat #6E1F2A. Aucun héros, personne, animal, armée, créature, UI, titre, texte, chiffre, logo, signature, filigrane, cadre, héraldique, objet moderne, noir pur ni blanc pur.";

const landing = [
  ['accueil_paysage', 'accueil/paysage.webp', 2560, 1440, 'Panorama 16:9 natif des monts du Forez au crépuscule; bourg fortifié modeste sur l’éperon du tiers droit, brume et crêtes en profondeur, granit et fougères au premier plan. Tiers gauche entier sombre, calme et peu détaillé pour le titre et le menu.', 'exec-4da2c1b4-b657-427f-81d4-c89fc63d86d8'],
  ['accueil_portrait', 'accueil/portrait.webp', 1170, 2532, 'Composition portrait ultra-haute native 1170:2532, non recadrée: grand ciel sur 38%, crêtes au tiers, bourg fortifié au centre, brume et sapins, granit et fougères en bas. Tiers médian calme et sombre pour l’interface.', 'exec-6f3fbcc1-3206-4b5b-8b1e-bf835830ca99'],
];

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function makeEntry({
  clef,
  fichier,
  categorie,
  largeur,
  hauteur,
  invite,
  generationId,
  generationIdExtractionAlpha,
  repetable,
}) {
  const absolute = join(imageRoot, ...fichier.split('/'));
  return {
    clef,
    fichier,
    categorie,
    largeur,
    hauteur,
    ...(repetable ? { repetable: true } : {}),
    octets: statSync(absolute).size,
    invite,
    // The built-in ImageGen tool does not expose a numeric model seed.
    graine: `non-exposee-par-imagegen:${generationId}`,
    outil: 'ImageGen built-in',
    generationId,
    ...(generationIdExtractionAlpha ? { generationIdExtractionAlpha } : {}),
    sha256: sha256(absolute),
  };
}

const entries = [];
for (const [id, faction, subject, generationId] of portraits) {
  entries.push(makeEntry({
    clef: `portrait_${id}`,
    fichier: `portraits/${id}.webp`,
    categorie: 'portrait',
    largeur: 512,
    hauteur: 640,
    invite: `${subject} ${portraitFaction[faction]} ${portraitStyle}`,
    generationId,
  }));
}
for (const [clef, fichier, brief, generationId] of cities) {
  entries.push(makeEntry({
    clef,
    fichier,
    categorie: 'cite',
    largeur: 2048,
    hauteur: 1152,
    invite: `${brief} ${cityStyle}`,
    generationId,
  }));
}
for (const [id, brief, generationId] of terrains) {
  entries.push(makeEntry({
    clef: id,
    fichier: `terrain/${id}.webp`,
    categorie: 'terrain',
    largeur: 512,
    hauteur: 512,
    repetable: true,
    invite: `${brief} ${tileStyle}`,
    generationId,
  }));
}
for (const [id, brief, generationId] of materials) {
  entries.push(makeEntry({
    clef: `matiere_${id}`,
    fichier: `matieres/${id}.webp`,
    categorie: 'matiere',
    largeur: 512,
    hauteur: 512,
    repetable: true,
    invite: `${brief} ${materialStyle}`,
    generationId,
  }));
}
for (const [clef, fichier, largeur, hauteur, brief, generationId] of landing) {
  entries.push(makeEntry({
    clef,
    fichier,
    categorie: 'accueil',
    largeur,
    hauteur,
    invite: `${brief} ${landingStyle}`,
    generationId,
  }));
}

const wave2Trace = JSON.parse(
  readFileSync(join(root, 'docs', 'reference', 'IMAGEGEN-WAVE2-TRACE.json'), 'utf8'),
);
const wave2ByKey = new Map(wave2Trace.entrees.map((entry) => [entry.clef, entry]));
for (const spec of PUBLIC_SPECS) {
  const trace = wave2ByKey.get(spec.key);
  if (!trace) throw new Error(`trace ImageGen vague 2 absente : ${spec.key}`);
  entries.push(makeEntry({
    clef: spec.key,
    fichier: spec.file,
    categorie: spec.category,
    largeur: spec.width,
    hauteur: spec.height,
    invite: spec.prompt,
    generationId: trace.generationId,
    generationIdExtractionAlpha: trace.generationIdExtractionAlpha,
  }));
}

const wave3Trace = JSON.parse(
  readFileSync(join(root, 'docs', 'reference', 'IMAGEGEN-WAVE3-TRACE.json'), 'utf8'),
);
const wave3ByKey = new Map(wave3Trace.entrees.map((entry) => [entry.clef, entry]));
const wave3Keys = new Set(WAVE3_PUBLIC_SPECS.map((spec) => spec.key));
const currentEntries = entries.filter((entry) => !wave3Keys.has(entry.clef));
for (const spec of WAVE3_PUBLIC_SPECS) {
  const trace = wave3ByKey.get(spec.key);
  if (!trace) throw new Error(`trace ImageGen vague 3 absente : ${spec.key}`);
  currentEntries.push(makeEntry({
    clef: spec.key,
    fichier: spec.file,
    categorie: spec.category,
    largeur: spec.width,
    hauteur: spec.height,
    repetable: spec.repeatable,
    invite: spec.prompt,
    generationId: trace.generationId,
  }));
}

const manifest = {
  version: '3.0.0-imagegen-2026-08-20',
  budgetOctets: 12 * 1024 * 1024,
  noteInvite:
    "Le champ invite contient l’invite canonique de régénération, normalisée à partir de l’appel initial et conservant toutes ses contraintes matérielles. L’ordre et les espaces exacts de l’appel interactif initial ne sont pas exposés comme métadonnée par l’outil intégré.",
  noteGraine:
    "ImageGen intégré ne fournit pas de graine numérique. Le champ graine conserve donc honnêtement l’identifiant de génération; invite, generationId et sha256 assurent la traçabilité sans prétendre à une régénération bit-identique.",
  entrees: currentEntries,
};

writeFileSync(join(imageRoot, 'manifeste.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`${currentEntries.length} entrées, ${currentEntries.reduce((sum, entry) => sum + entry.octets, 0)} octets`);
