#!/usr/bin/env node
/** Vérifie la traçabilité complète de la vague ImageGen 2. */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACTIVE_OBJECTS,
  ALL_SPECS,
  BUILDINGS,
  CITY_PORTRAITS,
  CREATURE_REFERENCES,
  DECOR,
  PUBLIC_SPECS,
  RESOURCES,
} from './wave2_asset_specs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const fail = (message) => { throw new Error(message); };

const expectedCounts = new Map([
  ['bâtiments', [BUILDINGS.length, 40]],
  ['cités portrait', [CITY_PORTRAITS.length, 6]],
  ['objets actifs', [ACTIVE_OBJECTS.length, 15]],
  ['ressources', [RESOURCES.length, 7]],
  ['décors', [DECOR.length, 56]],
  ['références de créatures', [CREATURE_REFERENCES.length, 28]],
  ['public', [PUBLIC_SPECS.length, 124]],
  ['total', [ALL_SPECS.length, 152]],
]);
for (const [label, [actual, expected]] of expectedCounts) {
  if (actual !== expected) fail(`${label}: ${actual}, attendu ${expected}`);
}

const specKeys = new Set(ALL_SPECS.map((entry) => entry.key));
if (specKeys.size !== ALL_SPECS.length) fail('clefs du catalogue dupliquées');

const trace = readJson('docs/reference/IMAGEGEN-WAVE2-TRACE.json');
const traceByKey = new Map(trace.entrees.map((entry) => [entry.clef, entry]));
if (trace.entrees.length !== 152 || traceByKey.size !== 152) fail('trace incomplète ou dupliquée');

const manifest = readJson('apps/client/public/img/manifeste.json');
const manifestByKey = new Map(manifest.entrees.map((entry) => [entry.clef, entry]));
if (manifest.entrees.length !== 167 || manifestByKey.size !== 167) fail('manifeste public incomplet ou dupliqué');

for (const spec of ALL_SPECS) {
  const record = traceByKey.get(spec.key) ?? fail(`trace absente: ${spec.key}`);
  for (const [field, expected] of [
    ['fichier', spec.file],
    ['categorie', spec.category],
    ['largeur', spec.width],
    ['hauteur', spec.height],
    ['invite', spec.prompt],
  ]) {
    if (record[field] !== expected) fail(`${spec.key}: ${field} diffère du catalogue`);
  }
  if (!/^exec-[0-9a-f-]+$/.test(record.generationId ?? '')) {
    fail(`${spec.key}: generationId invalide`);
  }
  const isReference = spec.file.startsWith('docs/');
  const target = resolve(ROOT, isReference ? spec.file : `apps/client/public/img/${spec.file}`);
  if (!existsSync(target)) fail(`${spec.key}: fichier absent ${target}`);
  if (record.octets !== statSync(target).size) fail(`${spec.key}: taille de trace périmée`);
  if (record.sha256 !== sha256(target)) fail(`${spec.key}: empreinte de trace périmée`);

  if (!isReference) {
    const publicRecord = manifestByKey.get(spec.key) ?? fail(`manifeste absent: ${spec.key}`);
    for (const field of ['fichier', 'categorie', 'largeur', 'hauteur', 'octets', 'invite', 'generationId', 'sha256']) {
      if (publicRecord[field] !== record[field]) fail(`${spec.key}: divergence trace/manifeste sur ${field}`);
    }
  }
}

const publicBytes = PUBLIC_SPECS.reduce((sum, spec) => sum + traceByKey.get(spec.key).octets, 0);
const referenceBytes = CREATURE_REFERENCES.reduce((sum, spec) => sum + traceByKey.get(spec.key).octets, 0);
console.log(JSON.stringify({
  wave2: ALL_SPECS.length,
  public: PUBLIC_SPECS.length,
  references: CREATURE_REFERENCES.length,
  publicBytes,
  referenceBytes,
  manifestEntries: manifest.entrees.length,
  manifestBytes: manifest.entrees.reduce((sum, entry) => sum + entry.octets, 0),
  budgetBytes: manifest.budgetOctets,
  errors: [],
}, null, 2));
