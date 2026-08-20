#!/usr/bin/env node
/** Vérifie catalogue, trace, manifeste et fichiers de la vague ImageGen 3. */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALL_SPECS, BATTLE_BACKGROUNDS, CREATURE_DETAILS, DECOR_PROPS,
  MAP_ICONS, PUBLIC_SPECS, TERRAIN_TEXTURES, wave3Summary,
} from './wave3_asset_specs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const fail = (message) => { throw new Error(message); };
const expected = wave3Summary();

for (const [label, actual, wanted] of [
  ['terrain', TERRAIN_TEXTURES.length, 12], ['décor', DECOR_PROPS.length, 61],
  ['lieux', MAP_ICONS.length, 13], ['combats', BATTLE_BACKGROUNDS.length, 6],
  ['références', CREATURE_DETAILS.length, 7], ['public', PUBLIC_SPECS.length, 92],
  ['total', ALL_SPECS.length, 99],
]) if (actual !== wanted) fail(`${label}: ${actual}, attendu ${wanted}`);

if (new Set(ALL_SPECS.map((row) => row.key)).size !== 99) fail('clefs du catalogue dupliquées');
if (ALL_SPECS.some((row) => ['carte_citadelle', 'carte_chateau'].includes(row.key))) {
  fail('clef conditionnelle absente du code ajoutée au catalogue');
}

const trace = readJson('docs/reference/IMAGEGEN-WAVE3-TRACE.json');
const byKey = new Map(trace.entrees.map((row) => [row.clef, row]));
if (trace.entrees.length !== 99 || byKey.size !== 99) fail('trace incomplète ou dupliquée');
const manifest = readJson('apps/client/public/img/manifeste.json');
const manifestByKey = new Map(manifest.entrees.map((row) => [row.clef, row]));
if (manifest.entrees.length !== 197 || manifestByKey.size !== 197) fail('manifeste attendu à 197 clefs uniques');

for (const spec of ALL_SPECS) {
  const row = byKey.get(spec.key) ?? fail(`trace absente: ${spec.key}`);
  for (const [field, wanted] of [
    ['id', spec.id], ['fichier', spec.file], ['categorie', spec.category],
    ['famille', spec.family], ['largeur', spec.width], ['hauteur', spec.height],
    ['alpha', spec.alpha], ['repetable', spec.repeatable], ['invite', spec.prompt],
  ]) if (row[field] !== wanted) fail(`${spec.key}: ${field} diffère du catalogue`);
  if (spec.sourceReference && row.referenceSource !== spec.sourceReference) {
    fail(`${spec.key}: référence source différente`);
  }
  for (const id of [row.generationId, row.generationIdFinal, ...row.generationIdsExtractionAlpha, ...row.generationIdsRegeneration]) {
    if (!/^exec-[0-9a-f-]+$/.test(id ?? '')) fail(`${spec.key}: identifiant ImageGen invalide`);
  }
  const target = resolve(ROOT, spec.file.startsWith('docs/') ? spec.file : `apps/client/public/img/${spec.file}`);
  if (!existsSync(target)) fail(`${spec.key}: fichier absent`);
  if (row.octets !== statSync(target).size) fail(`${spec.key}: taille de trace périmée`);
  if (row.sha256 !== sha256(target)) fail(`${spec.key}: SHA-256 de trace périmé`);
  if (!spec.file.startsWith('docs/')) {
    const current = manifestByKey.get(spec.key) ?? fail(`manifeste absent: ${spec.key}`);
    for (const field of ['fichier', 'categorie', 'largeur', 'hauteur', 'octets', 'invite', 'generationId', 'sha256']) {
      if (current[field] !== row[field]) fail(`${spec.key}: divergence trace/manifeste sur ${field}`);
    }
    if (Boolean(current.repetable) !== spec.repeatable) fail(`${spec.key}: repetable invalide`);
  }
}

const manifestBytes = manifest.entrees.reduce((sum, row) => sum + row.octets, 0);
if (manifestBytes > manifest.budgetOctets) fail(`budget dépassé: ${manifestBytes}`);
console.log(JSON.stringify({
  ...expected,
  manifestEntries: manifest.entrees.length,
  manifestBytes,
  budgetBytes: manifest.budgetOctets,
  traceBytes: trace.entrees.reduce((sum, row) => sum + row.octets, 0),
  errors: [],
}, null, 2));
