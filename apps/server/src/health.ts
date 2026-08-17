/**
 * Sonde de santé et page de diagnostic.
 *
 * `GET /health` est la sonde de Railway (`railway.json`,
 * `healthcheckPath: "/health"`). Elle doit répondre **200 même sans base de
 * données** : le service reste utile en mode fichier ou mémoire, et un échec
 * de PostgreSQL ne doit pas provoquer une boucle de redémarrage.
 *
 * `GET /api/diagnostic` rend une page française lisible par un humain — ou du
 * JSON si le client le demande. Elle ne contient **aucun secret** : pour les
 * variables sensibles, seule leur présence est indiquée, jamais leur valeur.
 */
import type { FastifyInstance } from 'fastify';
import { API, type HealthPayload } from '@auvergne/protocol';
import { environmentPresence } from './config.js';
import { uptimeLabel, uptimeSeconds, type ServerContext } from './context.js';
import { describe, formatOctets } from './storage/index.js';

/* ── Collecte ───────────────────────────────────────────────────────────── */

export interface DiagnosticData {
  ok: boolean;
  version: string;
  commit: string;
  uptime: number;
  uptimeTexte: string;
  base: HealthPayload['base'];
  baseLibelle: string;
  baseNotes: readonly string[];
  versions: ServerContext['versions'];
  node: string;
  plateforme: string;
  memoire: string;
  clientCompile: string | null;
  identitesSuivies: number;
  compteurs: { identites: number; sauvegardes: number } | null;
  compteursErreur: string | null;
  environnement: { nom: string; defini: boolean; role: string }[];
  secretDerive: boolean;
  production: boolean;
  genereLe: string;
}

/** Rassemble l'état du service. Ne lève jamais. */
export async function collectDiagnostic(ctx: ServerContext): Promise<DiagnosticData> {
  const uptime = uptimeSeconds(ctx);
  let compteurs: { identites: number; sauvegardes: number } | null = null;
  let compteursErreur: string | null = null;
  try {
    compteurs = await ctx.storage.stats();
  } catch (err) {
    compteursErreur = describe(err);
  }
  const mem = process.memoryUsage();
  return {
    ok: true,
    version: ctx.versions.application,
    commit: ctx.config.commit,
    uptime,
    uptimeTexte: uptimeLabel(uptime),
    base: ctx.storage.kind,
    baseLibelle: ctx.storage.label,
    baseNotes: ctx.storageNotes,
    versions: ctx.versions,
    node: process.version,
    plateforme: `${process.platform} ${process.arch}`,
    memoire: `${formatOctets(mem.rss)} résidents · ${formatOctets(mem.heapUsed)} de tas utilisé`,
    clientCompile: ctx.clientDir,
    identitesSuivies: ctx.limiter.size(),
    compteurs,
    compteursErreur,
    environnement: environmentPresence(),
    secretDerive: ctx.secretDerived,
    production: ctx.config.production,
    genereLe: new Date().toISOString(),
  };
}

/* ── Routes ─────────────────────────────────────────────────────────────── */

export function registerHealth(app: FastifyInstance, ctx: ServerContext): void {
  app.get(API.health, async (_request, reply) => {
    const payload: HealthPayload = {
      ok: true,
      version: ctx.versions.application,
      uptime: uptimeSeconds(ctx),
      base: ctx.storage.kind,
      commit: ctx.config.commit,
    };
    return reply.header('cache-control', 'no-store').send(payload);
  });

  app.get(API.diagnostic, async (request, reply) => {
    const data = await collectDiagnostic(ctx);
    const accept = String(request.headers.accept ?? '');
    const wantsJson =
      accept.includes('application/json') && !accept.includes('text/html');
    if (wantsJson) {
      return reply.header('cache-control', 'no-store').send(data);
    }
    return reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(renderDiagnosticPage(data));
  });
}

/* ── Rendu HTML ─────────────────────────────────────────────────────────── */

/** Échappe un texte destiné au HTML. Aucune valeur n'est insérée brute. */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Feuille de style commune aux pages servies par le serveur. Aucune police
 * distante, aucun CDN : la typographie repose sur la pile système, et les
 * couleurs reprennent les tons de pierre et de bois de la bible artistique.
 */
export const PAGE_STYLE = `
:root {
  color-scheme: light dark;
  --encre: #241d16;
  --parchemin: #f3ece0;
  --pierre: #6f6355;
  --granit: #4a5a68;
  --or: #b8891f;
  --vert: #2f6b45;
  --rouge: #8c2230;
  --trait: rgba(111, 99, 85, .28);
  --fond-carte: #fbf7f0;
}
@media (prefers-color-scheme: dark) {
  :root {
    --encre: #ece4d6;
    --parchemin: #17150f;
    --pierre: #a1968a;
    --granit: #8fa6b8;
    --trait: rgba(161, 150, 138, .26);
    --fond-carte: #201c15;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: max(24px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right))
           max(40px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
  background: var(--parchemin);
  color: var(--encre);
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif;
  font-size: 17px;
  line-height: 1.6;
  -webkit-text-size-adjust: 100%;
}
main { max-width: 62rem; margin: 0 auto; }
header { border-bottom: 2px solid var(--trait); padding-bottom: 18px; margin-bottom: 28px; }
h1 { font-size: clamp(1.6rem, 4vw, 2.3rem); margin: 0 0 6px; letter-spacing: .01em; }
h2 { font-size: 1.15rem; margin: 32px 0 12px; color: var(--granit); letter-spacing: .04em;
     text-transform: uppercase; font-variant: small-caps; }
p { margin: 0 0 12px; }
.chapeau { color: var(--pierre); margin: 0; }
.etat { display: inline-flex; align-items: center; gap: 8px; padding: 4px 12px; border-radius: 999px;
        font-size: .82rem; letter-spacing: .06em; text-transform: uppercase; border: 1px solid var(--trait); }
.etat--ok { color: var(--vert); }
.etat--attention { color: var(--or); }
.pastille { width: 9px; height: 9px; border-radius: 50%; background: currentColor; }
table { width: 100%; border-collapse: collapse; margin: 0 0 8px; font-size: .95rem; }
caption { text-align: left; color: var(--pierre); font-size: .85rem; padding-bottom: 6px; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--trait); vertical-align: top; }
th { width: 34%; font-weight: 600; color: var(--pierre); font-size: .9rem; }
td.valeur { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: .9rem; }
.cartes { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.carte { background: var(--fond-carte); border: 1px solid var(--trait); border-radius: 10px; padding: 14px 16px; }
.carte h3 { margin: 0 0 4px; font-size: .8rem; text-transform: uppercase; letter-spacing: .08em;
            color: var(--pierre); font-weight: 600; }
.carte p { margin: 0; font-size: 1.05rem; }
ul.notes { margin: 0; padding-left: 1.2rem; color: var(--pierre); }
ul.notes li { margin-bottom: 4px; }
.oui { color: var(--vert); }
.non { color: var(--pierre); }
footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--trait);
         color: var(--pierre); font-size: .85rem; }
a { color: var(--granit); }
code { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: .9em; }
`;

/** Enveloppe HTML complète, autonome, sans aucune ressource externe. */
export function htmlDocument(titre: string, corps: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${escapeHtml(titre)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<main>
${corps}
</main>
</body>
</html>`;
}

function ligne(label: string, valeur: string, mono = true): string {
  return `<tr><th scope="row">${escapeHtml(label)}</th><td${
    mono ? ' class="valeur"' : ''
  }>${escapeHtml(valeur)}</td></tr>`;
}

const BASE_LABELS: Record<HealthPayload['base'], string> = {
  postgres: 'PostgreSQL',
  fichier: 'Fichiers locaux',
  memoire: 'Mémoire volatile',
};

/** Rend la page de diagnostic. Aucune valeur d'environnement n'y figure. */
export function renderDiagnosticPage(d: DiagnosticData): string {
  const attention = d.base === 'memoire' || d.clientCompile === null;
  const corps = `
<header>
  <p class="chapeau">Heroes of Might and Magic — Édition Auvergne</p>
  <h1>Diagnostic du service</h1>
  <p><span class="etat ${attention ? 'etat--attention' : 'etat--ok'}"><span class="pastille"></span>${
    attention ? 'Service actif, points de vigilance' : 'Service pleinement opérationnel'
  }</span></p>
</header>

<div class="cartes">
  <div class="carte"><h3>Stockage</h3><p>${escapeHtml(BASE_LABELS[d.base])}</p></div>
  <div class="carte"><h3>En fonctionnement depuis</h3><p>${escapeHtml(d.uptimeTexte)}</p></div>
  <div class="carte"><h3>Version du service</h3><p>${escapeHtml(d.version)}</p></div>
  <div class="carte"><h3>Révision</h3><p>${escapeHtml(d.commit === 'inconnu' ? 'inconnue' : d.commit.slice(0, 12))}</p></div>
</div>

<h2>Versions</h2>
<table>
  <caption>Une sauvegarde ne se recharge que sur une version majeure identique.</caption>
  <tbody>
    ${ligne('Moteur', d.versions.moteur)}
    ${ligne('Contenu', d.versions.contenu)}
    ${ligne('Carte', d.versions.carte)}
    ${ligne('Protocole', d.versions.protocole)}
  </tbody>
</table>

<h2>Sauvegardes</h2>
<table>
  <tbody>
    ${ligne('Dos-office', d.baseLibelle, false)}
    ${
      d.compteurs !== null
        ? ligne('Identités enregistrées', String(d.compteurs.identites)) +
          ligne('Sauvegardes conservées', String(d.compteurs.sauvegardes))
        : ligne('Comptage', d.compteursErreur ?? 'indisponible', false)
    }
    ${ligne('Identités suivies par la limitation de débit', String(d.identitesSuivies))}
  </tbody>
</table>
${
  d.baseNotes.length > 0
    ? `<ul class="notes">${d.baseNotes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`
    : ''
}
${
  d.base === 'memoire'
    ? `<p><strong>Attention :</strong> les sauvegardes ne sont conservées qu'en mémoire et disparaîtront au prochain redémarrage. Le jeu reste jouable, et le navigateur en garde une copie locale.</p>`
    : ''
}

<h2>Exécution</h2>
<table>
  <tbody>
    ${ligne('Node.js', d.node)}
    ${ligne('Plateforme', d.plateforme)}
    ${ligne('Mémoire', d.memoire, false)}
    ${ligne('Mode', d.production ? 'production' : 'développement', false)}
    ${ligne(
      'Client compilé',
      d.clientCompile ?? 'absent — seule l’API est servie',
      d.clientCompile !== null,
    )}
    ${ligne(
      'Signature des cookies',
      d.secretDerive
        ? 'clef dérivée localement (développement)'
        : 'clef fournie par l’environnement',
      false,
    )}
  </tbody>
</table>

<h2>Environnement</h2>
<table>
  <caption>Seule la présence des variables est indiquée. Aucune valeur n'est affichée, journalisée ni renvoyée par l'API.</caption>
  <tbody>
    ${d.environnement
      .map(
        (v) =>
          `<tr><th scope="row">${escapeHtml(v.nom)}</th><td>${
            v.defini ? '<span class="oui">définie</span>' : '<span class="non">non définie</span>'
          } — ${escapeHtml(v.role)}</td></tr>`,
      )
      .join('')}
  </tbody>
</table>

<footer>
  <p>Page générée le ${escapeHtml(d.genereLe)}. Sonde de santé : <code>${escapeHtml(
    API.health,
  )}</code> · Versions du contenu : <code>${escapeHtml(API.contentVersion)}</code>.</p>
</footer>`;
  return htmlDocument('Diagnostic — Édition Auvergne', corps);
}
