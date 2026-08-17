import { bootstrapEngine } from '@auvergne/game';
import { buildWorld } from '@auvergne/map';
import { createGame, applyCommand, hashState, cloneState, type GameSetup } from '@auvergne/engine';
bootstrapEngine();
const world = buildWorld(1234);
function mk(n: number) {
  const starts = ['arconsat','viscomtat','cervieres','noiretable','renaudie'] as const;
  const ids = ['P1','P2','P3','P4','P5'] as const;
  const heroes = ['paul','thibaut','loic','matthieu','clotilde'];
  const setup: GameSetup = { seed:1234, mapVersion:'', contentVersion:'', duration:'standard', victory:'couronne',
    players: Array.from({length:n}, (_,i)=>({ id: ids[i], name:'J'+i, faction: (i%2?'ermitage':'granit') as 'granit'|'ermitage', kind:'ia' as const, aiProfile:'equilibre' as const, start: starts[i], hero: heroes[i] })) };
  return createGame(setup, world);
}
for (const n of [2,3,5]) {
  const s = mk(n);
  let t = process.hrtime.bigint();
  for (let i=0;i<20;i++) hashState(s as unknown as Record<string,unknown>);
  const h = Number(process.hrtime.bigint()-t)/1e6/20;
  t = process.hrtime.bigint();
  for (let i=0;i<20;i++) cloneState(s);
  const c = Number(process.hrtime.bigint()-t)/1e6/20;
  t = process.hrtime.bigint();
  for (let i=0;i<20;i++) applyCommand(s, {type:'BuildInTown', town: s.players[s.activePlayer].towns[0], building:'marche'}, world);
  const a = Number(process.hrtime.bigint()-t)/1e6/20;
  console.log(`joueurs=${n} hash=${h.toFixed(2)}ms clone=${c.toFixed(2)}ms apply=${a.toFixed(2)}ms`);
}
