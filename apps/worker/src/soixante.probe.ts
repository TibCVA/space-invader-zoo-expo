/* Sonde jetable : le duel sur soixante graines. */
import { simulateGame } from './simulate.js';
let e = 0;
let p = 0;
let conq = 0;
const N = 60;
for (let i = 0; i < N; i++) {
  const g = simulateGame({
    seed: 1000 + i * 7919, players: 2, profiles: ['expert', 'prudent'], rotation: i,
    duration: 'eclair', victory: 'derniere_banniere', maxTurns: 320, fast: true,
  });
  if (!g.reason.startsWith('Garde-fou du harnais')) conq++;
  if (g.winnerProfile === 'expert') e++;
  else if (g.winnerProfile === 'prudent') p++;
}
console.log(`expert ${e}/${N} = ${((e * 100) / N).toFixed(1)} % · prudent ${p} · conquetes ${conq}/${N}`);
