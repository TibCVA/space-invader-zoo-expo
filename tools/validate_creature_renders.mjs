#!/usr/bin/env node
/** Vérifie le catalogue, la trace ImageGen et les fichiers des 28 rendus. */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CREATURE_RENDERS } from './creature_render_specs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (message) => { throw new Error(message); };
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const trace = JSON.parse(readFileSync(resolve(ROOT, 'docs/reference/IMAGEGEN-CREATURE-RENDERS-TRACE.json'), 'utf8'));

if (CREATURE_RENDERS.length !== 28) fail(`catalogue: ${CREATURE_RENDERS.length}, attendu 28`);
if (new Set(CREATURE_RENDERS.map((row) => row.key)).size !== 28) fail('clefs du catalogue dupliquées');
const byKey = new Map(trace.entrees.map((row) => [row.clef, row]));
if (trace.entrees.length !== 28 || byKey.size !== 28) fail('trace incomplète ou dupliquée');

for (const spec of CREATURE_RENDERS) {
  const row = byKey.get(spec.key) ?? fail(`trace absente: ${spec.key}`);
  for (const [field, expected] of [
    ['id', spec.id], ['fichier', spec.file], ['referenceSource', spec.sourceReference],
    ['categorie', spec.category], ['largeur', spec.width], ['hauteur', spec.height],
    ['rang', spec.tier], ['amelioree', spec.upgraded], ['invite', spec.prompt],
  ]) {
    if (row[field] !== expected) fail(`${spec.key}: ${field} diffère du catalogue`);
  }
  for (const id of [row.generationId, row.generationIdFinal, ...row.generationIdsExtractionAlpha, ...row.generationIdsRegeneration]) {
    if (!/^exec-[0-9a-f-]+$/.test(id ?? '')) fail(`${spec.key}: identifiant ImageGen invalide`);
  }
  const target = resolve(ROOT, spec.file);
  if (!existsSync(target)) fail(`${spec.key}: fichier absent`);
  if (row.octets !== statSync(target).size) fail(`${spec.key}: taille de trace périmée`);
  if (row.sha256 !== sha256(target)) fail(`${spec.key}: empreinte de trace périmée`);
}

console.log(JSON.stringify({
  renders: CREATURE_RENDERS.length,
  upgraded: CREATURE_RENDERS.filter((row) => row.upgraded).length,
  legendary: CREATURE_RENDERS.filter((row) => row.tier >= 6).length,
  bytes: trace.entrees.reduce((sum, row) => sum + row.octets, 0),
  errors: [],
}, null, 2));
