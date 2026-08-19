import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALL_SPECS, specSummary } from './wave2_asset_specs.mjs';

const output = process.argv[2];
if (!output) throw new Error('usage: node tools/export_wave2_specs.mjs <output.json>');
writeFileSync(resolve(output), `${JSON.stringify(ALL_SPECS, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(specSummary()));
