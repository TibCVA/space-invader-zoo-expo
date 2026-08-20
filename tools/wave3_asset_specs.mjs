/**
 * Catalogue canonique ImageGen — vague 3, carte d'aventure.
 *
 * Les clefs viennent de docs/10-BRIEF-IMAGEGEN-VAGUE-3.md et de l'atlas
 * courant. carte_citadelle et carte_chateau sont volontairement absentes :
 * aucune des deux clefs conditionnelles n'existe dans le code au HEAD lu.
 */

const PALETTE =
  'Palette fermée : granit anthracite #2A2C2F, granit clair #4A4E52, mousse sombre #2F3B2E, sapin #1E3226, hêtre #4A6138, fougère #6B5433, brume #8FA6B8, bleu profond #2B3A4A, ocre #C08A3E, grenat #6E1F2A, vieil or #C9A227, parchemin #E8DCC0 ; jamais de noir pur ni de blanc pur.';

const STYLE =
  'Illustration originale de stratégie heroic-fantasy médiévale du Forez, enluminure vivante et naturalisme romantique, pigments profonds, matière peinte riche, grain de pinceau contrôlé, lisibilité moderne ; ni photoréalisme, ni cartoon, ni anime, ni 3D lissée. Aucune référence à une œuvre, franchise, studio, artiste ou personne réelle.';

const LIGHT =
  'Source principale nord-ouest, azimut 315° et élévation 38° : lumière chaude #FFE9C2, ombres froides bleu-violet #3A4657 jamais noires, très fin liseré vieil or #C9A227 sur les silhouettes.';

const NO_TEXT =
  'Aucun texte, chiffre, lettre, logo, signature, filigrane, cadre, interface, héraldique lisible ni objet moderne.';

const TILE_STYLE =
  `${STYLE} ${PALETTE} Texture strictement zénithale à 90°, homogène et véritablement répétable sans couture sur les deux axes. Matière distribuée jusque sur chaque bord, grain fin et multi-échelle, aucune structure remarquable, aucun point focal, rocher isolé, touffe vedette, grande fleur, horizon, perspective, vignette, bordure, ombre portée ou reflet directionnel. Éclairage diffus plat : le relief et le reflet sont ajoutés par le moteur. ${NO_TEXT}`;

const TERRAIN_DEFS = [
  ['herbe', 'Pâture de moyenne montagne : herbe drue et courte en deux verts, rares pissenlits fanés finement dispersés, très petits fragments de crottin sec et traces de piétinement diffuses.'],
  ['aiguilles', 'Tapis de sapinière : aiguilles brunes serrées, petits fragments de cônes tombés, mousse en plaques irrégulières et racines affleurantes très discrètes.'],
  ['roche', 'Dalle de granit gris-bleu : feldspath clair finement distribué, lichen jaune et gris, réseau de petites fissures remplies de terre sans dalle centrale.'],
  ['tourbe', 'Tourbière des Sagnes : sphaigne rousse et verte, eau noire dans de minuscules creux répartis et linaigrette fine sans mare reconnaissable.'],
  ['gravier', 'Chemin de terre battue : gravier de granit concassé, deux ornières très diffuses, boue séchée et herbe courte sur une crête centrale non dominante.'],
  ['eau', 'Eau claire de rivière de montagne vue du dessus sur un lit continu de petits galets, courant très doux et réfraction diffuse ; ni mer, rive, écume, poisson ni reflet de ciel.'],
  ['herbe_estive', 'Estive des Hauts d’Arconsat : herbe rase brûlée par le vent, menus cailloux affleurants et callune sèche finement disséminée.'],
  ['herbe_grasse', 'Pré de fauche de la Durolle : herbe épaisse en couches serrées, minuscules boutons d’or et ombellifères distribués sans bouquet dominant.'],
  ['aiguilles_noires', 'Cœur des Bois Noirs : humus presque noir mais teinté bleu-vert, aiguilles extrêmement serrées, rares brindilles, presque aucune plante vivante.'],
  ['roche_carrier', 'Pays des carriers : granit débité de main d’homme, petits éclats anguleux, poussière de taille et traces parallèles très diffuses, sans bloc ou outil identifiable.'],
  ['roche_chaude', 'Granit de Cervières patiné par le soleil, lichen orangé fin, terre ocre dans les joints et feldspath chaud, sans ombre portée.'],
  ['lande_callune', 'Lande de l’Hermitage : callune en fleur mêlée de myrtille, tourbe sèche et très petits rameaux de genêt, distribution homogène sans bouquet.'],
];

export const TERRAIN_TEXTURES = TERRAIN_DEFS.map(([id, subject]) => ({
  key: id,
  id,
  file: `terrain/${id}.webp`,
  category: 'terrain',
  width: 512,
  height: 512,
  alpha: false,
  repeatable: true,
  family: 'terrain',
  prompt: `Use case: stylized-concept
Asset type: seamless tileable adventure-map ground texture
Primary request: ${subject}
Style/medium: ${TILE_STYLE}
Composition/framing: square orthographic top-down material sample; micro-details cross all four edges naturally.
Constraints: exact material identity, low-to-medium contrast, no cast shadow, no transparency, no scene and no focal object.`,
}));

const PROP_STYLE =
  `${STYLE} ${PALETTE} ${LIGHT} Décor de carte 2,5D isolé, peint avec matière tactile et silhouette immédiatement lisible à 64 px. Fond réellement transparent avec alpha propre. Vue de trois quarts légèrement plongeante, sujet complet, contact au sol exactement au centre du bord inférieur, deux pixels de marge minimum. Aucune ombre portée : le moteur la dessine au sud-est. Aucun socle, terrain étendu, halo, rectangle résiduel ou élément interactif lumineux. ${NO_TEXT}`;

const PROP_FAMILIES = [
  ['ferme', 320, 256, [
    'Ferme du Forez compacte en L : toit de lauzes à quatre pentes, murs de granit, grange accolée à gauche, petit tas de fumier et four à pain rond.',
    'Longère du Forez à toit de lauzes à quatre pentes, grande porte de grange en chêne, four à pain adossé et tas de fumier contenu derrière un muret.',
    'Ferme montagnarde autour d’une minuscule cour : corps de logis en granit, grange basse, deux volumes sous lauzes, four à pain et fumier nettement lisibles.',
    'Ferme du Forez plus trapue, toit de lauzes lourd à quatre pentes, grange avancée, appentis, four à pain en pierre et tas de fumier au bord opposé.',
  ]],
  ['chapelle', 256, 320, [
    'Chapelle romane trapue en granit clair, nef courte, clocher-mur à une baie, toit de lauzes, croix de fer simple et mur de cimetière bas.',
    'Petite chapelle des Sagnes en granit sombre, porche profond, clocher-mur ébréché, lauzes moussues, croix de fer et mur funéraire bas partiellement ouvert.',
    'Chapelle forestière romane très compacte, abside ronde, clocher-mur double, lauzes humides, croix de fer et cimetière ceint d’un muret irrégulier.',
  ]],
  ['tour', 256, 384, [
    'Tour de guet en granit presque intacte, base carrée, meurtrières, plateforme sommitale sobre et mince lierre sur un angle.',
    'Tour de guet ronde, crénelage partiellement tombé, meurtrières étroites, grande lézarde froide et lierre montant au tiers.',
    'Tour carrée fortement ruinée mais stable, sommet ouvert, pan de mur manquant, escalier intérieur deviné, meurtrières et lierre.',
    'Tour de frontière trapue à toit d’ardoise brisé, galerie haute en bois sombre, soubassement de granit, meurtrières et lierre ancien.',
  ]],
  ['moulin', 320, 384, [
    'Moulin à eau du Forez en granit, petit bief contenu dans la silhouette, grande roue latérale à augets, toit de lauzes et sacs près de la porte ; jamais un moulin à vent.',
    'Moulin à eau forestier plus bas, bief de bois, roue à augets sous auvent, murs de granit moussu, toit de lauzes ; aucune aile.',
    'Moulin à eau fortifié et compact, roue à augets en façade latérale, canal de pierre court, lauzes sombres et petit appentis ; aucune aile.',
  ]],
  ['aiguille', 256, 384, [
    'Aiguille de granit très haute et mince, arêtes vives, veine de quartz verticale, lichen froid et base étroite fracturée.',
    'Aiguille de granit bifide, deux pointes asymétriques, faces cassées, quartz diagonal et plaques de lichen.',
    'Ressaut de granit massif en lame inclinée, sommet tronqué, strates visibles, veines de quartz fines et lichen au pied.',
    'Trois éclats de granit soudés en une seule silhouette verticale, hauteurs très différentes, arêtes aiguës et mousse froide.',
    'Aiguille ancienne courbe sous l’érosion, large contrefort, pointe décentrée, quartz apparent et lichen jaune-gris.',
  ]],
  ['muret', 320, 192, [
    'Muret droit de pierre sèche soigneusement appareillé à la main, chaperon de grandes dalles, extrémités nettes et quelques ronces.',
    'Muret de pierre sèche courbe, grande brèche centrale, chaperon irrégulier, pierres écroulées contenues et ronces.',
    'Muret d’estive à deux hauteurs, pierres plates serrées, chaperon incliné, petite borne terminale non gravée et herbe au pied.',
    'Ancien muret moussu en arc doux, appareil grossier, un pan affaissé, chaperon discontinu et ronces sèches.',
  ]],
  ['croix', 192, 256, [
    'Croix de chemin en bois grossier, assemblage chevillé, pied pris dans un petit bloc de granit, bois fendu par le climat.',
    'Croix de chemin en fer forgé sobre, branches légèrement pattées, volutes minimales, socle de granit usé.',
    'Croix de pierre gravée très érodée, proportions médiévales trapues, base étagée et mousse dans les creux, sans inscription.',
    'Petit calvaire de granit à niche vide, croix simple au sommet, deux degrés irréguliers et traces de lichen.',
  ]],
  ['souche', 192, 192, [
    'Souche de sapin arrachée, racines en étoile longues et anguleuses, cœur pourri sombre, écorce humide et mousse.',
    'Vieille souche creuse de sapin, trois racines épaisses décentrées, cœur vermoulu visible et mousse en plaques.',
    'Souche renversée montrant une galette de racines en étoile, terre retenue entre elles, bois pourri et mousse froide.',
    'Souche basse éclatée par la foudre, racines torses en étoile, cœur noirci mais non brûlant, jeunes mousses.',
  ]],
  ['borne', 192, 256, [
    'Borne armoriée de granit carrée et trapue, écu médiéval entièrement martelé donc illisible, sommet biseauté et mousse dans les creux.',
    'Borne de route du sel haute et légèrement penchée, granit érodé, écu martelé sans symbole, arête cassée et mousse.',
    'Borne frontière large à sommet arrondi, ancien écu volontairement buriné, deux rainures de taille et lichen froid.',
  ]],
  ['sapin', 256, 384, [
    'Sapin pectiné d’altitude très droit, flèche cassée par la neige, étages de branches denses et branches basses mortes.',
    'Sapin pectiné haut penché par le vent, cime survivante latérale, masse asymétrique et nombreuses branches basses mortes.',
    'Vieux sapin trapu de crête, tronc large, flèche double brisée, branches comprimées par la neige et bois mort visible.',
    'Jeune sapin pectiné élancé, flèche fraîchement cassée, tronc visible entre des étages espacés et quelques branches mortes.',
    'Sapin pectiné bifide ancien, deux cimes inégales dont une rompue, grand houppier sombre et jupe de branches sèches.',
  ]],
  ['hetre', 256, 384, [
    'Hêtre de futaie adulte, fût lisse gris très droit, houppier dense et haut, feuilles cuivrées mêlées de vert sombre.',
    'Hêtre de lisière penché, long fût lisse gris, houppier dense déporté par le vent et feuilles cuivrées.',
    'Vieux hêtre à fourche haute, écorce grise ridée mais lisse, couronne massive irrégulière et feuillage cuivre sombre.',
    'Jeune hêtre élancé, tronc gris fin entièrement visible, petite couronne dense en hauteur et feuilles cuivrées.',
    'Hêtre battu par le vent, fût courbe gris, houppier compact d’un seul côté, branche morte discrète et cuivre automnal.',
  ]],
  ['rocher', 256, 192, [
    'Bloc erratique de granit bas et très arrondi, large face gris-bleu, lichen jaune-gris et herbe courte au pied.',
    'Amas compact de trois blocs erratiques arrondis emboîtés, lichen froid et petites touffes d’herbe.',
    'Long bloc de granit émoussé incliné, fissure peu profonde, plaques de lichen et herbe au contact.',
    'Bloc erratique dressé mais arrondi, large face polie par le climat, bande de lichen et herbe rase.',
    'Petit chaos de cinq granits ronds de tailles très différentes, masse unique lisible, lichen et herbe au pied.',
  ]],
  ['fougere', 192, 192, [
    'Fougère aigle en éventail, cinq grandes frondes retombantes, vert hêtre et brun de fougère.',
    'Fougère aigle couchée par le vent, longues frondes toutes orientées, extrémités brunes et pied compact.',
    'Double touffe de fougère aigle à hauteurs différentes, frondes croisées mais silhouette aérée.',
    'Fougère aigle vieillissante, frondes très retombantes mêlant vert sombre, cuivre et brun sec.',
  ]],
  ['buisson', 256, 192, [
    'Genêt montagnard bas, rameaux fins en fontaine, petites fleurs ocre très rares et silhouette aérée.',
    'Myrtille dense et basse, petites feuilles vert sombre et quelques baies bleu profond discrètes.',
    'Aubépine compacte et irrégulière, rameaux épineux visibles, feuilles ternes et quelques fruits grenat.',
    'Ronce étalée en deux arches, tiges épineuses, feuilles vert sombre et cuivre, quelques mûres presque noires mais bleutées.',
  ]],
  ['pont', 384, 192, [
    'Pont de pierre médiéval à une arche basse, parapet court, tablier bombé, appareil de granit et mousse sous la voûte.',
    'Pont de pierre à deux petites arches inégales, pile centrale robuste, parapets bas et tablier légèrement bombé.',
    'Ponceau de granit à une arche étroite et haute, culées épaisses, parapet brisé à une extrémité, lichen froid.',
    'Vieux pont à deux arches, tablier très bombé, parapets irréguliers, une pierre descellée et ronces contenues.',
  ]],
];

export const DECOR_PROPS = PROP_FAMILIES.flatMap(([name, width, height, variants]) =>
  variants.map((subject, index) => ({
    key: `prop_${name}_${index}`,
    id: `${name}_${index}`,
    file: `decor/${name}-${index}.webp`,
    category: 'prop',
    width,
    height,
    alpha: true,
    repeatable: false,
    family: 'decor',
    prompt: `Use case: stylized-concept
Asset type: transparent adventure-map decorative prop
Primary request: ${subject}
Style/medium: ${PROP_STYLE}
Variation constraint: this silhouette must differ clearly from every other ${name} variant while preserving the family identity.
Composition/framing: exactly one complete prop, isolated and centered; every branch, roof edge or stone inside frame; ground contact touches the exact bottom.
Constraints: genuine transparent RGBA, no painted checkerboard, no cast shadow, no extra scenery or duplicate object.`,
  })),
);

const ICON_STYLE =
  `${STYLE} ${PALETTE} ${LIGHT} Icône-monde peinte de lieu visitable, vue de trois quarts haut, silhouette immédiatement compréhensible à 64 px, matière plus riche et accent légèrement plus chaud qu’un décor passif. Fond réellement transparent, pied de contact au centre du bord inférieur, aucun socle, paysage, rectangle, grande ombre portée ou personnage complet. ${NO_TEXT}`;

const ICON_DEFS = [
  ['carte_demeure', 'demeure', 'Demeure franche : petit abri de berger en granit et bois sous lauzes, feu allumé visible dans l’entrée et deux armes sobres appuyées au mur.'],
  ['carte_moulin', 'moulin', 'Moulin à ressource : moulin à eau compact en granit, roue à augets latérale, court bief et sacs empilés près de la porte ; aucune aile.'],
  ['carte_banque', 'banque', 'Repaire gardé : bouche de grotte étayée par des poutres, coffre de chêne entrouvert dans l’ombre et quelques ossements non sanglants.'],
  ['carte_monolithe', 'monolithe', 'Pierre levée jumelée : deux menhirs étroits de granit, spirales abstraites gravées sans lettres et halo bleu-brume très discret.'],
  ['carte_obelisque', 'obelisque', 'Montjoie du puzzle : haut cairn de pierres soigneusement empilées, surmonté d’une dalle gravée de formes abstraites sans alphabet.'],
  ['carte_ecole', 'ecole', 'École de vaillance : grande pierre plate gravée de lignes martiales abstraites, banc rustique et rouleau fermé sans écriture.'],
  ['carte_temple', 'temple', 'Oratoire : niche de pierre romane, petite statuette entièrement voilée et quelques ex-voto métalliques sans inscription.'],
  ['carte_fontaine', 'fontaine', 'Fontaine aux fées : vasque de granit, filet d’eau clair, jeune branche arquée portant quelques rubans sans symbole.'],
  ['carte_coffre', 'coffre', 'Coffre de chêne cerclé de fer, couvercle fermé mais serrure visible, à demi enterré sous des feuilles de hêtre.'],
  ['carte_garde_frontiere', 'garde-frontiere', 'Poste de garde : deux chevaux de frise croisés, petit feu de camp et bouclier sans emblème planté dans le sol.'],
  ['carte_tente_clef', 'tente-clef', 'Tente du gardien de clef : tente de toile écrue ouverte, petit fanion uni sans symbole et coffret fermé sur un tabouret.'],
  ['carte_cartographe', 'cartographe', 'Cartographe : petite roulotte bâchée, roue de bois, cartes muettes déroulées sur une planche et compas sans texte.'],
  ['carte_marche_noir', 'marche-noir', 'Marché noir : étal compact sous une bâche sombre, balance à plateaux, petits paquets anonymes et capuchon vide posé sur un montant.'],
];

export const MAP_ICONS = ICON_DEFS.map(([key, id, subject]) => ({
  key,
  id,
  file: `carte/${id}.webp`,
  category: 'prop',
  width: 256,
  height: 256,
  alpha: true,
  repeatable: false,
  family: 'map-icon',
  prompt: `Use case: stylized-concept
Asset type: transparent adventure-map visitable-location icon
Primary request: ${subject}
Style/medium: ${ICON_STYLE}
Composition/framing: exactly one compact icon cluster, fully inside the square, centered, ground contact at exact bottom, readable in silhouette.
Constraints: genuine transparent RGBA, no painted checkerboard, no added landscape, no frame and no readable writing.`,
}));

const BATTLE_STYLE =
  `${STYLE} ${PALETTE} ${LIGHT} Fond peint de champ de bataille 16:10, mat et légèrement plus sombre que les créatures. Perspective 2,5D cohérente avec une caméra tactique légèrement plongeante. Le centre et les deux bandes de déploiement doivent rester parfaitement libres, calmes, peu contrastés et sans obstacle ; les détails se concentrent au pourtour et à l’horizon. Aucune grille hexagonale, créature, héros, armée, cadavre, bâtiment actif, texte, cadre ou interface. Atmosphère lisible, pas de noir bouché ni de blanc brûlé. ${NO_TEXT}`;

const BATTLE_DEFS = [
  ['combat_prairie', 'prairie', 'Pâture : pré tondu de moyenne montagne, sol mat et doux au centre, murets très lointains au pourtour, ciel de traîne bleu-brume.'],
  ['combat_foret', 'foret', 'Futaie : clairière ovale entourée de hauts fûts de hêtre et sapin seulement sur les bords, lumière filtrée et fougères périphériques.'],
  ['combat_rocher', 'rocher', 'Chaos granitique : vaste dalle jouable centrale, blocs massifs uniquement sur les bords, herbe rase dans les joints et horizon de crêtes.'],
  ['combat_lande', 'lande', 'Hautes chaumes : lande ouverte de callune rase, centre balayé par le vent et sans obstacle, horizon nu sous un ciel ample.'],
  ['combat_humide', 'humide', 'Sagne : sol humide central ferme et sombre, petites nappes d’eau seulement aux bords, joncs périphériques et brume basse.'],
  ['combat_pont', 'pont', 'Franchissement : large tablier de pierre occupant le sol jouable, centre entièrement dégagé, parapets bas aux extrêmes et rivière visible de part et d’autre.'],
];

export const BATTLE_BACKGROUNDS = BATTLE_DEFS.map(([key, id, subject]) => ({
  key,
  id,
  file: `combat/${id}.webp`,
  category: 'combat',
  width: 1024,
  height: 640,
  alpha: false,
  repeatable: false,
  family: 'battle',
  prompt: `Use case: stylized-concept
Asset type: painted tactical battle background
Primary request: ${subject}
Style/medium: ${BATTLE_STYLE}
Composition/framing: 16:10 landscape, horizon in the upper quarter, broad empty playable center covering at least 70% of the image.
Constraints: opaque image, no foreground object crossing the center, no grid, no units, no text or frame.`,
}));

const DETAIL_STYLE =
  `${STYLE} ${PALETTE} ${LIGHT} Référence de sculpture et de matière extrêmement détaillée, anatomie crédible, vue de trois quarts à hauteur d’œil, fond réellement transparent, sans décor ni socle. Le sujet remplit 82–90 % de l’image et reste intégralement visible. ${NO_TEXT}`;

const DETAIL_DEFS = [
  ['chevalier_forez_cheval', 'docs/reference/creatures/renders/granit_t6.webp', 'Tête et encolure du cheval de montagne du Chevalier du Forez, trois quarts, chanfrein puissant, œil lisible, bride, crinière, plaques d’armure et insertion de la main du cavalier suggérée sans montrer le cavalier entier.'],
  ['banneret_cervieres_cheval', 'docs/reference/creatures/renders/granit_t6_up.webp', 'Tête et encolure du lourd cheval du Banneret de Cervières, trois quarts, anatomie monumentale, caparaçon grenat et vieil or, chanfrein prestigieux, bride et crinière détaillées, sans cavalier entier.'],
  ['griffon_pamole', 'docs/reference/creatures/renders/granit_t7.webp', 'Griffon de Pamole complet en trois quarts à hauteur d’œil, tête d’aigle, ailes entièrement déployées, antérieurs à serres et arrière-train félin clairement articulés.'],
  ['vouivre_durolle', 'docs/reference/creatures/renders/ermitage_t7.webp', 'Vouivre de la Durolle complète en trois quarts à hauteur d’œil, anatomie serpentine et ailes membraneuses cohérentes, écailles humides, tête expressive et longue queue entièrement visible.'],
  ['sanglier_cuirasse', 'docs/reference/creatures/renders/granit_t5.webp', 'Sanglier Cuirassé complet en trois quarts à hauteur d’œil, masse basse de charge, défenses, chanfrein, épaules et plaques d’ardoise rivetées très lisibles.'],
  ['cerf_sources', 'docs/reference/creatures/renders/ermitage_t5.webp', 'Cerf des Sources complet en trois quarts à hauteur d’œil, anatomie de cervidé crédible, ramure vaste mais naturelle, mousse et eau claire localisées sans décor.'],
  ['colosse_granite', 'docs/reference/creatures/renders/ermitage_t6.webp', 'Colosse de Granite complet en trois quarts à hauteur d’œil, articulation lisible de chaque masse rocheuse, visage minéral, mains et appuis anatomiquement cohérents, mousse et jeunes sapins donnant l’échelle.'],
];

export const CREATURE_DETAILS = DETAIL_DEFS.map(([id, sourceReference, subject]) => ({
  key: `reference_vague3_${id}`,
  id,
  file: `docs/reference/creatures/vague3/${id}.webp`,
  sourceReference,
  category: 'reference',
  width: 1024,
  height: 1024,
  alpha: true,
  repeatable: false,
  family: 'creature-reference',
  prompt: `Use case: stylized-concept
Asset type: high-resolution creature rigging detail reference, never a battle billboard
Input images: Image 1 is the authoritative existing creature render; preserve species, anatomy, equipment, palette and identity.
Primary request: ${subject}
Style/medium: ${DETAIL_STYLE}
Composition/framing: exactly one subject, three-quarter eye-level study, complete requested anatomy inside frame with generous transparent margin.
Constraints: genuine transparent RGBA, no painted checkerboard, no redesign, duplicate anatomy, text, frame, scene or terrain.`,
}));

export const PUBLIC_SPECS = [
  ...TERRAIN_TEXTURES,
  ...DECOR_PROPS,
  ...MAP_ICONS,
  ...BATTLE_BACKGROUNDS,
];
export const ALL_SPECS = [...PUBLIC_SPECS, ...CREATURE_DETAILS];

export const SUPERSEDED_WAVE2_KEYS = new Set([
  ...TERRAIN_TEXTURES.slice(0, 6).map((entry) => entry.key),
  ...DECOR_PROPS.filter((entry) => !entry.key.startsWith('prop_aiguille_')).map((entry) => entry.key),
]);

export function wave3Summary() {
  return {
    terrain: TERRAIN_TEXTURES.length,
    decor: DECOR_PROPS.length,
    mapIcons: MAP_ICONS.length,
    battle: BATTLE_BACKGROUNDS.length,
    public: PUBLIC_SPECS.length,
    creatureReferences: CREATURE_DETAILS.length,
    total: ALL_SPECS.length,
    superseded: SUPERSEDED_WAVE2_KEYS.size,
    newPublicKeys: PUBLIC_SPECS.length - SUPERSEDED_WAVE2_KEYS.size,
  };
}
