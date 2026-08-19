/**
 * Rendus individuels haute définition des vingt-huit créatures.
 *
 * Les planches à quatre vues restent les références géométriques. Ces rendus
 * ajoutent matière, pose et impact visuel sans remplacer les rigs animés.
 */

import { CREATURE_REFERENCES } from './wave2_asset_specs.mjs';

const PALETTE =
  'Palette fermée : granit anthracite #2A2C2F, granit clair #4A4E52, mousse #2F3B2E, sapin #1E3226, hêtre #4A6138, fougère #6B5433, brume #8FA6B8, bleu profond #2B3A4A, ocre #C08A3E, grenat #6E1F2A, vieil or #C9A227, parchemin #E8DCC0.';

const STYLE =
  'Illustration originale de stratégie heroic-fantasy médiévale du Forez : enluminure vivante et naturalisme romantique, pigments profonds, matière peinte riche, anatomie crédible, textures tactiles et lisibilité de silhouette moderne ; ni photoréalisme, ni cartoon, ni anime, ni 3D lissée. Aucune référence à une œuvre, franchise, studio, artiste ou personne réelle.';

const LIGHT =
  'Source principale nord-ouest, azimut 315° et élévation 38° : lumière chaude #FFE9C2, ombres froides bleu-violet #3A4657 jamais noires, très fin liseré vieil or sur le bord opposé.';

const SPECTACLE = {
  1: 'Impact volontairement terrestre : courage et matière plutôt que magie, pose immédiatement lisible et digne.',
  2: 'Présence de troupe d’élite locale : mouvement franc, équipement très lisible, aucun effet magique gratuit.',
  3: 'Impact héroïque contenu : tension d’attaque, cape, plumes ou fourrure animées par le vent, silhouette incisive.',
  4: 'Impact héroïque prestigieux : mouvement ample, détail d’équipement mémorable et un accent magique ou lumineux très contrôlé.',
  5: 'Créature majeure spectaculaire : puissance physique évidente, matière exceptionnelle et aura naturelle localisée qui ne masque jamais la silhouette.',
  6: 'Créature monumentale : sensation d’échelle écrasante, débris ou souffle localisés dans l’alpha, pose de climax parfaitement lisible.',
  7: 'Créature légendaire, véritable image-spectacle : majesté, mouvement extrême, ailes ou corps entièrement déployés, aura atmosphérique localisée et point focal inoubliable, tout en restant une seule silhouette complète.',
};

function primaryRequest(reference) {
  const line = reference.prompt.split('\n').find((value) => value.startsWith('Primary request: '));
  if (!line) throw new Error(`sujet absent pour ${reference.key}`);
  return line.slice('Primary request: '.length).replace(/\.$/, '');
}

export const CREATURE_RENDERS = CREATURE_REFERENCES.map((reference) => {
  const id = reference.file.split('/').at(-1).replace(/\.webp$/, '');
  const tier = Number(id.match(/_t([1-7])/)?.[1]);
  const upgraded = id.endsWith('_up');
  const subject = primaryRequest(reference);
  return {
    key: `render_creature_${id}`,
    id,
    file: `docs/reference/creatures/renders/${id}.webp`,
    sourceReference: reference.file,
    category: 'reference',
    width: 1024,
    height: 1024,
    tier,
    upgraded,
    prompt: `Use case: stylized-concept\nAsset type: high-resolution transparent creature key art and detailed rigging/material reference, never a battle billboard\nInput images: Image 1 is the authoritative four-view design sheet; preserve its species, anatomy, face, equipment, proportions, palette and faction identity exactly.\nPrimary request: ${subject}. Create exactly one full-body ${upgraded ? 'upgraded' : 'base'} creature in a powerful three-quarter battle pose.\nStyle/medium: ${STYLE} ${PALETTE} ${LIGHT}\nSpectacle level: ${SPECTACLE[tier]} ${upgraded ? 'The upgrade must feel visibly rarer, older, stronger and more prestigious than its base form without changing species or role.' : 'Keep a clear visual path for a later upgraded form.'}\nComposition/framing: one creature only, full body and every weapon, wing, antler, tail and shadow completely inside the square; subject fills 82–90% of the canvas; ground contact near 91% height; strong silhouette readable at 96 px; dynamic three-quarter pose generally facing right.\nScene/backdrop: genuinely transparent background. Allow only a soft cold contact shadow and tightly localized mist, dust, sparks, water or leaves that belong to the described creature and fade into alpha; no horizon, landscape, room, terrain platform, vignette or rectangular backdrop.\nConstraints: preserve Image 1 design rigorously; no redesign, no extra creature, mount or companion unless the reference creature itself is mounted; no detached duplicate body parts; no cropped anatomy; no text, letter, number, logo, signature, watermark, frame, interface or readable heraldry; no pure black or pure white.`,
  };
});

export function creatureRenderSummary() {
  return {
    total: CREATURE_RENDERS.length,
    upgraded: CREATURE_RENDERS.filter((entry) => entry.upgraded).length,
    legendary: CREATURE_RENDERS.filter((entry) => entry.tier >= 6).length,
  };
}
