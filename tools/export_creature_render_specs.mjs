#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CREATURE_RENDERS, creatureRenderSummary } from './creature_render_specs.mjs';

const output = process.argv[2];
if (!output) throw new Error('usage: node tools/export_creature_render_specs.mjs <output.json>');
writeFileSync(resolve(output), `${JSON.stringify(CREATURE_RENDERS, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(creatureRenderSummary()));
