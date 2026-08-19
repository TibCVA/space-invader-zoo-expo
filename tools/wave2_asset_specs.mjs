/**
 * Catalogue canonique de la vague ImageGen 2.
 *
 * Les listes nommées du brief font autorité sur ses totaux récapitulatifs :
 * 40 bâtiments (et non 32), 6 cités portrait, 15 objets actifs, 7 ressources,
 * 56 variantes de décor et 28 planches de créatures hors téléchargement.
 */

const PALETTE =
  'Palette fermée : granit anthracite #2A2C2F, granit clair #4A4E52, mousse #2F3B2E, sapin #1E3226, hêtre #4A6138, fougère #6B5433, brume #8FA6B8, bleu profond #2B3A4A, ocre #C08A3E, grenat #6E1F2A, vieil or #C9A227, parchemin #E8DCC0.';

const STYLE =
  'Style original de jeu de stratégie heroic-fantasy médiévale du Forez : enluminure vivante et naturalisme romantique, matière peinte riche, grain de pinceau maîtrisé, lisibilité de sprite moderne ; ni photoréalisme, ni cartoon, ni anime, ni 3D lissée. Aucune référence à une œuvre, franchise, studio, artiste ou personne réelle.';

const LIGHT =
  'Une seule lumière vient du nord-ouest, azimut 315°, élévation 38° : lumière directe chaude #FFE9C2, ombres froides bleu-violet #3A4657 tirées vers le sud-est, dégradées dans l’alpha, jamais noires ; léger liseré vieil or côté opposé.';

const NO_TEXT =
  'Aucun texte, lettre, chiffre, logo, signature, filigrane, cadre, interface, héraldique lisible ni objet moderne ; aucun noir pur ni blanc pur.';

const BUILDING_STYLE = `${STYLE} ${PALETTE} ${LIGHT} Projection oblique haute à environ 35°, façade principale et un pan de toiture visibles. Bâtiment isolé sur fond réellement transparent, base centrée près du bas, silhouette entière, ombre portée froide conservée en alpha. Aucun terrain, socle d’herbe, route, ciel, panorama, personnage ou animal ; une lisière de terre battue de quelques pixels au pied est seule admise. ${NO_TEXT}`;

const COMMON_ARCH =
  'Architecture commune crédible dans les deux cités : soubassement de granit, pierre claire et pans de bois, chêne usé, toiture majoritairement d’ardoise avec très peu de cuivre patiné ; aucun fanion de faction.';
const GRANIT_ARCH =
  'Architecture de la Châtellenie : appareil de granit sombre à joints épais, encadrements de basalte, fortes pentes d’ardoise, chêne brun, accents grenat et vieil or très contenus.';
const ERMITAGE_ARCH =
  'Architecture de l’Ermitage : pierre claire et pans de bois, bardeaux ou cuivre verdi, passerelles, eau captée et végétation sobre qui reprend ses droits ; verts profonds, sauge et cuivre patiné.';

const b = (key, file, subject, ref, scale = 'Bâtiment de taille moyenne, objet couvrant environ 82 % de la largeur du canevas.') => ({
  key,
  file: `batiments/${file}.webp`,
  category: 'prop',
  width: 512,
  height: 512,
  ref,
  prompt: `Use case: stylized-concept\nAsset type: transparent production game building sprite\nPrimary request: ${subject}\nStyle/medium: ${BUILDING_STYLE}\nArchitecture: ${ref === 'granit' ? GRANIT_ARCH : ref === 'ermitage' ? ERMITAGE_ARCH : COMMON_ARCH}\nScale/composition: ${scale}\nConstraints: full roof, base and shadow visible; generous transparent padding; no clipped element.`,
});

export const BUILDINGS = [
  b('bati_granit_demeure_1', 'granit-demeure-1', 'Rangée très compacte de chaumières basses de granit, une pièce, toit de genêt, petit appentis à outils et tas de bois fendu.', 'granit', 'Rang 1 humble : volume bas couvrant 64 % de la largeur, beaucoup d’air transparent.'),
  b('bati_granit_demeure_2', 'granit-demeure-2', 'Bureau de la gabelle : corps de garde trapu, porte cloutée, balance à sel sous auvent, coffre ferré et mesure à grain.', 'granit', 'Rang 2 modeste : largeur apparente 68 %.'),
  b('bati_granit_demeure_3', 'granit-demeure-3', 'Butte de tir couverte : long hangar ouvert, râtelier d’arbalètes, cibles de paille bottelée et pavois appuyés.', 'granit', 'Rang 3 allongé : largeur apparente 72 %, hauteur retenue.'),
  b('bati_granit_demeure_4', 'granit-demeure-4', 'Atelier de broderie : maison à grandes fenêtres à meneaux, métiers à broder visibles et écheveaux d’or tendus à sécher.', 'granit', 'Rang 4 raffiné : largeur apparente 76 %.'),
  b('bati_granit_demeure_5', 'granit-demeure-5', 'Soue fortifiée : enclos de pierre sèche, abri voûté, auges de granit, petite glandée de chêne et bardage profondément entaillé.', 'granit', 'Rang 5 massif et bas : largeur apparente 82 %.'),
  b('bati_granit_demeure_6', 'granit-demeure-6', 'Corps de logis noble : perron, écurie attenante, quintaine d’entraînement, bannières grenat non lettrées et girouette.', 'granit', 'Rang 6 noble : largeur apparente 88 %, haut sans dominer le capitole.'),
  b('bati_granit_demeure_7', 'granit-demeure-7', 'Aire du griffon : haute tour ouverte sur un piton maçonné, perchoirs de poutres usées, grand nid de branches et quelques plumes prises au vent, sans griffon.', 'granit', 'Rang 7 monumental : largeur apparente 94 %, silhouette très dominante.'),
  b('bati_ermitage_demeure_1', 'ermitage-demeure-1', 'Hospice de chemin : longue salle basse, porche d’accueil, banc de pierre, croix de bois simple et coquilles clouées au linteau.', 'ermitage', 'Rang 1 humble : largeur apparente 64 %, silhouette basse.'),
  b('bati_ermitage_demeure_2', 'ermitage-demeure-2', 'Colombier à chouettes : tour ronde percée de boulins, toit conique de bardeaux, lierre et perchoirs, sans oiseau.', 'ermitage', 'Rang 2 modeste : largeur apparente 68 %.'),
  b('bati_ermitage_demeure_3', 'ermitage-demeure-3', 'Tanière palissadée : abri creusé sous une roche, palissade de pieux, quelques os blanchis et brume basse retenue au sol, sans loup.', 'ermitage', 'Rang 3 : largeur apparente 72 %, très terrestre.'),
  b('bati_ermitage_demeure_4', 'ermitage-demeure-4', 'Loge de veneur sur pilotis : plateforme de bois, échelle, filets et épieux rangés, peaux tendues sur cadre.', 'ermitage', 'Rang 4 : largeur apparente 76 %, silhouette surélevée.'),
  b('bati_ermitage_demeure_5', 'ermitage-demeure-5', 'Enclos sacré autour d’une source captée : margelle de pierre claire, petit bassin, arbres à rubans sans lettres et bois de cerf offerts.', 'ermitage', 'Rang 5 : largeur apparente 82 %, composition ouverte lisible.'),
  b('bati_ermitage_demeure_6', 'ermitage-demeure-6', 'Carrière-atelier : petit front de taille, blocs équarris, coins et masses, un colosse humanoïde inachevé encore pris dans la roche.', 'ermitage', 'Rang 6 massif : largeur apparente 88 %.'),
  b('bati_ermitage_demeure_7', 'ermitage-demeure-7', 'Gouffre de la vouivre : bouche de grotte au bord d’un torrent, eau fumante, quelques écailles prises dans la vase et reflet vert d’eau, sans créature.', 'ermitage', 'Rang 7 monumental : largeur apparente 94 %, entrée verticale impressionnante.'),

  b('bati_hotel_ville_1', 'hotel-ville-1', 'Maison commune modeste : salle sur arcades, banc de justice et écu peint abstrait au-dessus de la porte.', 'both', 'Niveau 1 compact : largeur apparente 68 %.'),
  b('bati_hotel_ville_2', 'hotel-ville-2', 'Même maison commune agrandie d’un étage à colombage et d’une tourelle d’escalier.', 'both', 'Niveau 2 : largeur apparente 77 %.'),
  b('bati_hotel_ville_3', 'hotel-ville-3', 'Hôtel de ville abouti : beffroi carré, horloge à jacquemart sans chiffres, galerie et toiture d’ardoise complexe.', 'both', 'Niveau 3 prestigieux : largeur apparente 88 %.'),
  b('bati_taverne', 'taverne', 'Auberge accueillante : enseigne en fer forgé sans texte, tonneaux, banc, fumée à la cheminée et fenêtres ambrées.', 'both'),
  b('bati_marche', 'marche', 'Halle de marché : charpente de bois sur piliers de pierre, toit à croupes, étals vides et mesures à grain.', 'both'),
  b('bati_halle_sel', 'halle-sel', 'Grenier à sel aveugle et trapu : contreforts, double porte ferrée et petit chariot à sel.', 'both'),
  b('bati_caravanserail', 'caravanserail', 'Relais de caravane : cour fermée en miniature, abreuvoir, portique d’entrée et bâts empilés, sans animal.', 'both'),
  b('bati_forge', 'forge', 'Forge : appentis ouvert, feu rougeoyant visible, enclume, grand soufflet, cheminée conique et ferrures pendues.', 'both'),
  b('bati_ecuries', 'ecuries', 'Écuries : longue bâtisse basse, portes en deux parties, botte de foin et abreuvoir de granit, sans cheval.', 'both'),
  b('bati_capitaine', 'capitaine', 'Maison du capitaine de place : tour-porche carrée, meurtrières, oriflamme sans emblème et corps de garde.', 'both'),
  b('bati_guilde_1', 'guilde-1', 'Guilde des arts, rang 1 : tour ronde courte, une fenêtre haute et appareil régulier.', 'both', 'Rang 1 : largeur apparente 58 %, très modeste.'),
  b('bati_guilde_2', 'guilde-2', 'Guilde des arts, rang 2 : tour ronde gagnant un étage et une coursive de bois.', 'both', 'Rang 2 : largeur apparente 64 %.'),
  b('bati_guilde_3', 'guilde-3', 'Guilde des arts, rang 3 : toit conique d’ardoise, oculus sans symbole et contreforts.', 'both', 'Rang 3 : largeur apparente 70 %.'),
  b('bati_guilde_4', 'guilde-4', 'Guilde des arts, rang 4 : tourelle satellite reliée par une passerelle et vitraux étroits sans motif lisible.', 'both', 'Rang 4 : largeur apparente 80 %.'),
  b('bati_guilde_5', 'guilde-5', 'Guilde des arts, rang 5 : sommet ouvert sur le ciel, grande armille de bronze et lueur froide bleu-vert.', 'both', 'Rang 5 : largeur apparente 90 %, haute silhouette.'),
  b('bati_palissade', 'palissade', 'Segment autonome de palissade de pieux et talus de terre avec porte charretière simple.', 'both', 'Défense large et basse, largeur apparente 94 %.'),
  b('bati_rempart', 'rempart', 'Segment autonome de rempart de granit à chemin de ronde et merlons.', 'both', 'Défense large et basse, largeur apparente 96 %.'),
  b('bati_tours', 'tours', 'Paire de tours de flanquement rondes reliées par un court mur, mâchicoulis et toits en poivrière.', 'both', 'Défense monumentale, largeur apparente 96 %.'),

  b('bati_granit_atelier_fildor', 'granit-atelier-fildor', 'Atelier du fil d’or : longue salle vitrée, dévidoirs, cuves de teinture et écheveaux dorés tendus dehors.', 'granit'),
  b('bati_granit_porte_farges', 'granit-porte-farges', 'Porte des Farges : châtelet à deux tours, herse levée, pont dormant et mâchicoulis.', 'granit', 'Très grand châtelet couvrant 96 % de la largeur.'),
  b('bati_granit_capitole', 'granit-capitole', 'Capitole des Comtes : donjon carré massif sur motte de granit, salle haute à baies géminées et longues bannières grenat et or sans emblème.', 'granit', 'Point culminant absolu : monument couvrant 98 % de la largeur et presque toute la hauteur.'),
  b('bati_ermitage_source', 'ermitage-source', 'Source captée : fontaine de pierre claire sous abri de bois, bassin moussu et vapeur froide.', 'ermitage', 'Petit bâtiment singulier, largeur apparente 66 %.'),
  b('bati_ermitage_scriptorium', 'ermitage-scriptorium', 'Scriptorium : salle à hautes fenêtres, pupitres visibles, volets de bois et toit de cuivre verdi.', 'ermitage'),
  b('bati_ermitage_clairiere', 'ermitage-clairiere', 'Clairière défrichée représentée comme un atelier compact : essarts, charbonnière fumante, tas de perches et cabane de charbonnier.', 'ermitage'),
  b('bati_ermitage_mur_racines', 'ermitage-mur-racines', 'Mur de racines : rempart vivant d’arbres entrelacés sur soubassement de pierre, passage voûté par les branches.', 'ermitage', 'Défense large couvrant 96 % de la largeur.'),
  b('bati_ermitage_capitole', 'ermitage-capitole', 'Cœur des Bois Noirs : sanctuaire de bois et pierre claire adossé à un if colossal, toitures de cuivre, passerelles et source à ses pieds.', 'ermitage', 'Point culminant absolu : sanctuaire-arbre couvrant 98 % de la largeur et presque toute la hauteur.'),
];

const ACTIVE_STYLE = `${STYLE} ${PALETTE} ${LIGHT} Objet actif isolé sur fond réellement transparent, vue oblique haute cohérente, silhouette fermée immédiatement reconnaissable à 88 px, couleurs plus saturées que le décor et un seul accent chaud vieil or, cuivre ou grenat. Point de contact au sol centré vers 78 % de la hauteur ; ombre froide douce sous l’objet. Aucun terrain étendu, personnage, animal ou arrière-plan. ${NO_TEXT}`;
const a = (key, file, subject) => ({
  key,
  file: `carte/${file}.webp`,
  category: 'prop',
  width: 88,
  height: 88,
  ref: 'both',
  prompt: `Use case: stylized-concept\nAsset type: transparent active map-object sprite\nPrimary request: ${subject}\nStyle/medium: ${ACTIVE_STYLE}\nComposition: centered, bold readable silhouette, full object and shadow inside canvas, no clipped detail.`,
});

export const ACTIVE_OBJECTS = [
  a('carte_ville', 'ville', 'Un bourg fortifié miniature : porte, deux tours et trois toits serrés, accent grenat et or.'),
  a('carte_village', 'village', 'Un hameau miniature de trois maisons autour d’un clocheton, lumière ambrée.'),
  a('carte_mine', 'mine', 'Entrée de galerie étayée de bois avec petit wagonnet de minerai et lanterne chaude.'),
  a('carte_ressource', 'ressource', 'Tas générique lisible mêlant bois fendu, lingot sombre, pierre et petit sac, accent de cuivre.'),
  a('carte_artefact', 'artefact', 'Coffret médiéval ouvragé fermé, posé sur une pierre basse, ferrures vieil or.'),
  a('carte_garde', 'garde', 'Grand pavois grenat planté au sol avec deux lances croisées derrière, aucun soldat.'),
  a('carte_borne', 'borne', 'Borne armoriée de granit gravée d’un motif abstrait non textuel, petite touche d’or dans le creux.'),
  a('carte_sanctuaire', 'sanctuaire', 'Petite chapelle votive de pierre claire, toit de cuivre verdi et cierge chaud visible.'),
  a('carte_auberge', 'auberge', 'Relais miniature à auvent et enseigne en fer forgé sans texte, fenêtre ambrée et tonnelet.'),
  a('carte_caravane', 'caravane', 'Chariot bâché de voyage, roues cerclées de fer, ballots et lanterne de cuivre, sans animal.'),
  a('carte_sceau', 'sceau', 'Stèle de granit verticale portant un grand sceau de cire grenat intact, sans lettre.'),
  a('carte_maison_tresor', 'maison-tresor', 'Porte de trésor ferrée enchâssée dans un fragment de roche, serrure dorée lumineuse.'),
  a('carte_belvedere', 'belvedere', 'Petite plateforme de guet en bois sur quatre poteaux, longue-vue primitive en cuivre sans personne.'),
  a('carte_source', 'source', 'Source captée fumante dans une margelle de pierre claire, eau bleu-vert et coupe de cuivre.'),
  a('carte_quete', 'quete', 'Potence de chemin portant un parchemin roulé scellé de cire, parchemin totalement vierge.'),
];

const RESOURCE_STYLE = `${STYLE} ${PALETTE} Petit tas de ressource isolé sur fond réellement transparent, peint avec éclats contrôlés, très saturé et lisible à 88 px, point de contact vers 78 % de la hauteur, petite ombre froide. ${LIGHT} Aucun décor, contenant dominant, texte, chiffre, logo, cadre, signature ou filigrane.`;
const r = (key, subject) => ({
  key: `ressource_${key}`,
  file: `carte/ressource-${key}.webp`,
  category: 'prop',
  width: 88,
  height: 88,
  ref: 'both',
  prompt: `Use case: stylized-concept\nAsset type: transparent map resource token\nPrimary request: ${subject}\nStyle/medium: ${RESOURCE_STYLE}\nComposition: one compact centered pile, bold silhouette, full shadow visible.`,
});

export const RESOURCES = [
  r('ecus', 'Petit tas de pièces médiévales irrégulières en vieil or et argent terni, sans effigie ni inscription.'),
  r('bois', 'Petit faisceau de bûches de sapin fendues, lié par une corde, une coupe claire orientée vers la caméra.'),
  r('granit', 'Petit tas de blocs de granit taillés anthracite, arêtes éclairées ambrées et mica discret.'),
  r('fer', 'Petit tas de lingots de fer martelé bleu-noir avec deux ferrures, reflets froids contrôlés.'),
  r('sel', 'Petit monticule de gros cristaux de sel ivoire dans une coupelle de bois basse, aucun blanc pur.'),
  r('essence', 'Trois fioles-résines bleu-vert lumineuses entourées de feuilles de sauge, bouchons de cuivre.'),
  r('filDor', 'Petit écheveau dense de fil d’or sur une bobine de bois sombre, éclats vieil or sans motif.'),
];

const DECOR_STYLE = `${STYLE} ${PALETTE} Élément de décor isolé sur fond réellement transparent, palette désaturée de verts et gris, absolument aucun accent chaud ; lumière cohérente mais discrète, ombre froide en alpha. Point de contact au sol exactement à 50 % de la largeur et 92 % de la hauteur. Silhouette naturelle lisible, sans socle ni terrain étendu. ${NO_TEXT}`;

const DECOR_DEFS = [
  ['sapin', 256, 384, 'ermitage', ['sapin ancien très droit, étages de branches denses et bas', 'sapin haut légèrement penché à gauche, cime asymétrique', 'sapin trapu de crête, branches battues par le vent vers la droite', 'jeune sapin élancé, houppier clairsemé et tronc visible', 'sapin bifide ancien, deux cimes proches et masse sombre']],
  ['hetre', 256, 384, 'ermitage', ['hêtre adulte au tronc gris droit et houppier large irrégulier', 'hêtre penché de lisière, racines apparentes très contenues', 'vieux hêtre noueux à fourche basse et couronne ouverte', 'jeune fayard élancé, petites masses de feuilles étagées', 'hêtre battu par le vent, houppier déporté et branche morte discrète']],
  ['rocher', 256, 192, 'granit', ['bloc de granit bas fendu en deux plans', 'amas de trois blocs anguleux imbriqués', 'dalle longue inclinée avec lichen discret', 'bloc dressé court à face verticale', 'chaos compact de petits granits émoussés']],
  ['buisson', 256, 192, 'ermitage', ['buisson bas très dense à trois masses', 'buisson étiré vers la droite aux rameaux visibles', 'buisson rond irrégulier avec centre sombre', 'buisson clairsemé de lisière à deux touffes séparées']],
  ['muret', 320, 192, 'granit', ['court muret droit de pierre sèche, hauteur régulière', 'muret courbe partiellement écroulé', 'muret à deux assises avec grande pierre terminale', 'muret ancien moussu, brèche centrale étroite']],
  ['croix', 192, 256, 'granit', ['croix de chemin en granit simple sur petit pied', 'croix de bois ancien légèrement penchée', 'croix pattée de pierre très sobre et érodée', 'croix de fer forgé simple sur borne basse, sans symbole ajouté']],
  ['pont', 384, 192, 'both', ['petit pont de rondins droit à deux garde-corps bas', 'ponceau de pierre à arche unique', 'passerelle de planches légèrement courbe et usée', 'pont de dalles de granit irrégulières sur deux piles basses']],
  ['tour', 256, 384, 'granit', ['tour de guet ronde en granit, sommet crénelé', 'tour carrée partiellement ruinée, lierre discret', 'tour étroite à toit d’ardoise en poivrière', 'tour de borne massive à plateforme de bois haute']],
  ['ferme', 320, 256, 'both', ['ferme basse de granit et toit de chaume, appentis latéral', 'ferme à pans de bois et bardeaux, grange attenante', 'longère de pierre sombre avec petit fenil', 'ferme en L compacte autour d’une minuscule cour vide']],
  ['souche', 192, 192, 'ermitage', ['souche de sapin fraîchement fendue, racines courtes', 'vieille souche creuse très sombre', 'souche de hêtre large couverte de mousse froide', 'souche basse éclatée avec deux jeunes rejets verts']],
  ['fougere', 192, 192, 'ermitage', ['touffe en éventail de cinq frondes', 'fougère couchée par le vent, frondes vers la droite', 'double touffe dense à hauteurs différentes', 'petite fougère sèche mêlant vert froid et brun désaturé']],
  ['borne', 192, 256, 'granit', ['borne de granit carrée, sommet biseauté', 'borne cylindrique très usée et légèrement penchée', 'borne large à sommet arrondi avec gravure abstraite non héraldique']],
  ['moulin', 320, 384, 'both', ['petit moulin à eau de pierre avec roue latérale', 'moulin à vent de bois à quatre ailes immobiles', 'moulin forestier compact à roue sous auvent']],
  ['chapelle', 256, 320, 'both', ['chapelle romane minuscule en pierre claire, clocheton simple', 'chapelle de granit sombre à porche de bois', 'oratoire forestier à pans de bois et toit de cuivre verdi']],
];

export const DECOR = DECOR_DEFS.flatMap(([name, width, height, ref, variants]) =>
  variants.map((variant, index) => ({
    key: `prop_${name}_${index}`,
    file: `decor/${name}-${index}.webp`,
    category: 'prop',
    width,
    height,
    ref,
    prompt: `Use case: stylized-concept\nAsset type: transparent adventure-map decorative prop\nPrimary request: ${variant}.\nStyle/medium: ${DECOR_STYLE}\nVariation constraint: cette variante doit différer nettement par le port et la silhouette des autres ${name}, sans changer d’essence, de matériau ni de palette.\nComposition: sujet entier, centré sur son contact au sol, généreux alpha autour, ombre incluse, aucun élément actif ou lumineux.`,
  })),
);

const CITY_STYLE = `${STYLE} ${PALETTE} Composition verticale native 9:16, sans alpha, exactement 1152 × 2048 après finalisation. Aucun texte, chiffre, logo, signature, filigrane, cadre, UI, personne, armée, créature ou bâtiment de niveau supérieur. La ville et ses emplacements vides doivent rester compatibles avec les couches de bâtiments du moteur.`;

const city = (key, file, faction, time, prompt) => ({
  key,
  file: `cites/${file}.webp`,
  category: 'cite',
  width: 1152,
  height: 2048,
  ref: faction,
  faction,
  time,
  prompt: `Use case: stylized-concept\nAsset type: vertical mobile game city panorama\nPrimary request: ${prompt}\nStyle/medium: ${CITY_STYLE}\nComposition: ultra-tall 9:16, ciel et crêtes en haut, ville au tiers médian, à-pic ou vallon et profondeur en bas ; recomposition véritable, jamais recadrage du paysage.\nLighting: ${LIGHT}`,
});

export const CITY_PORTRAITS = [
  city('cite_granit_midi_portrait', 'granit-midi-portrait', 'granit', 'midi', 'Recomposer la forteresse de granit de la référence paysage avec exactement la même ville, les mêmes terrasses vides, les mêmes murs et la même lumière de midi ; éperon vertical spectaculaire au-dessus de la vallée.'),
  city('cite_granit_aube_portrait', 'granit-aube-portrait', 'granit', 'aube', 'Conserver rigoureusement le cadrage et la géométrie du maître portrait de midi ; changer uniquement la lumière vers une aube froide, brume basse et premier rayon chaud rasant.'),
  city('cite_granit_crepuscule_portrait', 'granit-crepuscule-portrait', 'granit', 'crepuscule', 'Conserver rigoureusement le cadrage et la géométrie du maître portrait de midi ; changer uniquement la lumière vers un crépuscule or et grenat, ombres froides et quelques fenêtres existantes éclairées.'),
  city('cite_ermitage_midi_portrait', 'ermitage-midi-portrait', 'ermitage', 'midi', 'Recomposer le vallon-sanctuaire forestier de la référence paysage avec exactement les mêmes clairières vides, ruisseau, passerelles et petits abris ; empiler canopée, sanctuaire médian et ravin d’eau en bas, lumière de midi filtrée.'),
  city('cite_ermitage_aube_portrait', 'ermitage-aube-portrait', 'ermitage', 'aube', 'Conserver rigoureusement le cadrage et la géométrie du maître portrait de midi ; changer uniquement la lumière vers une aube bleue, brume au ras de l’eau et premier rayon chaud.'),
  city('cite_ermitage_crepuscule_portrait', 'ermitage-crepuscule-portrait', 'ermitage', 'crepuscule', 'Conserver rigoureusement le cadrage et la géométrie du maître portrait de midi ; changer uniquement la lumière vers un crépuscule forestier bleu, lune montante, brume basse et rares cierges existants.'),
];

const CREATURES = [
  ['granit_t1', 'Manant', 'fantassin paysan du Forez, fourche et vêtements de travail rapiécés, posture obstinée'],
  ['granit_t1_up', 'Franc-Serf', 'ancien paysan affranchi devenu piquier discipliné, petite charte roulée à la ceinture, équipement robuste'],
  ['granit_t2', 'Gabelou', 'commis du sel en brigandine, longue pique de contrôle, sac et mesure à sel'],
  ['granit_t2_up', 'Prévôt du Sel', 'officier du sel plus imposant, bâton de prévôt, clefs et sceau comtal non textuel'],
  ['granit_t3', 'Arbalétrier des Farges', 'arbalétrier montagnard en cuir et ardoise, arbalète lourde et pavois compact'],
  ['granit_t3_up', 'Maître-Arbalétrier', 'vétéran des Farges, arbalète renforcée, carreaux ferrés en losange et armure mieux ajustée'],
  ['granit_t4', 'Grenadière d’Or', 'brodeuse combattante sereine, vêtement grenat, métier et fil d’or évoqués par une bannière brodée en grenade abstraite'],
  ['granit_t4_up', 'Dame au Fil d’Or', 'maîtresse d’atelier noble et calme, somptueuse broderie d’or, longue aiguille ou épée fine, bannière réparée'],
  ['granit_t5', 'Sanglier Cuirassé', 'grand sanglier bardé de plaques d’ardoise rivetées, défenses massives, silhouette de charge basse'],
  ['granit_t5_up', 'Verrat de Granit', 'vieux verrat gigantesque, chanfrein ferré, cuirasse de granit marquée de sièges, silhouette d’éboulement'],
  ['granit_t6', 'Chevalier du Forez', 'chevalier sur cheval de montagne court et puissant, armure sombre, lance et petit serment de pierre'],
  ['granit_t6_up', 'Banneret de Cervières', 'chevalier banneret sur lourd cheval, grande bannière grenat et or sans texte, armure prestigieuse'],
  ['granit_t7', 'Griffon de Pamole', 'griffon montagnard immense, corps de lion sombre, tête et ailes d’aigle, plumes battues par le vent'],
  ['granit_t7_up', 'Griffon Couronné', 'vieux griffon majestueux à crête blanchie, collier d’or ancien, ailes puissantes et regard mémorable'],
  ['ermitage_t1', 'Pèlerin', 'pèlerin robuste au long bâton poli, manteau de laine, sac et coquille discrète'],
  ['ermitage_t1_up', 'Pénitent Blanc', 'pèlerin pieds nus en habit ivoire, bâton de marche, présence résiliente presque miraculeuse'],
  ['ermitage_t2', 'Chouette Hulotte', 'grande chouette hulotte de chasse, ailes larges, serres fortes, plumage forestier brun froid'],
  ['ermitage_t2_up', 'Chouette Oraculaire', 'chouette ancienne aux yeux jaune presque blanc, plumage bleuté de brume et silhouette prophétique'],
  ['ermitage_t3', 'Loup des Bois Noirs', 'grand loup forestier sombre, corps bas de chasse en meute, fourrure humide de sapinière'],
  ['ermitage_t3_up', 'Loup des Brumes', 'loup élancé partiellement voilé de brume froide, fourrure bleu-gris et posture de flanc furtive'],
  ['ermitage_t4', 'Veneur Sylvestre', 'archer forestier en cuir et vert profond, grand arc d’if, cape de feuillage sobre'],
  ['ermitage_t4_up', 'Garde-Futaie', 'archer assermenté plus sévère, arc d’if, flèches barbelées, manteau de garde et insigne de borne abstrait'],
  ['ermitage_t5', 'Cerf des Sources', 'grand cerf sacré dont la ramure porte des gouttes d’eau permanentes, aura végétale discrète'],
  ['ermitage_t5_up', 'Cerf Miraculeux', 'cerf blanc-gris ancien, lueur froide entre les bois comme une lampe, présence guérisseuse majestueuse'],
  ['ermitage_t6', 'Colosse de Granite', 'golem humanoïde taillé dans un chaos de granit, épaules massives, joints de roche et mousse froide'],
  ['ermitage_t6_up', 'Colosse de Pamole', 'colosse plus monumental portant une ligne de faille, énorme bloc prêt à lancer, silhouette de montagne'],
  ['ermitage_t7', 'Vouivre de la Durolle', 'vouivre serpentine ailée de rivière, écailles vert sombre, escarboucle rouge posée au front, venin et vase'],
  ['ermitage_t7_up', 'Vouivre Couronnée', 'très vieille vouivre ailée, escarboucle enchâssée dans l’os comme une couronne, souffle de brume d’orage'],
];

const CREATURE_STYLE = `${STYLE} ${PALETTE} ${LIGHT} Planche de référence carrée 1024 × 1024 en grille 2 × 2 sans séparateurs ni légendes : en haut gauche profil au repos ; en haut droite même créature de profil en attaque ; en bas gauche vue trois-quarts ; en bas droite étude de la même silhouette en aplat noir teinté #241C14. Fond uni parchemin ombré #C9B996, aucune scène. Cohérence anatomique, équipement et proportions rigoureusement identiques entre les trois vues peintes. ${NO_TEXT}`;

export const CREATURE_REFERENCES = CREATURES.map(([id, name, subject]) => ({
  key: `reference_creature_${id}`,
  file: `docs/reference/creatures/${id}.webp`,
  category: 'reference',
  width: 1024,
  height: 1024,
  ref: id.startsWith('granit_') ? 'granit' : 'ermitage',
  prompt: `Use case: stylized-concept\nAsset type: four-view creature rigging reference sheet, not an in-game bitmap\nPrimary request: ${name} — ${subject}.\nStyle/medium: ${CREATURE_STYLE}\nConstraints: exactly four studies of one consistent design; attack pose must remain readable at 50 px; silhouette panel is the most important; no extra character, creature or prop.`,
}));

export const PUBLIC_SPECS = [
  ...BUILDINGS,
  ...CITY_PORTRAITS,
  ...ACTIVE_OBJECTS,
  ...RESOURCES,
  ...DECOR,
];

export const ALL_SPECS = [...PUBLIC_SPECS, ...CREATURE_REFERENCES];

export function specSummary() {
  return {
    buildings: BUILDINGS.length,
    cityPortraits: CITY_PORTRAITS.length,
    activeObjects: ACTIVE_OBJECTS.length,
    resources: RESOURCES.length,
    decor: DECOR.length,
    creatureReferences: CREATURE_REFERENCES.length,
    public: PUBLIC_SPECS.length,
    total: ALL_SPECS.length,
  };
}
