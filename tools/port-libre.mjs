/**
 * Un port que personne n'occupe.
 *
 * Pourquoi ce module minuscule existe. Les quatre harnais de capture servaient
 * chacun le jeu sur un port **fixe**. Tant qu'une seule capture tournait à la
 * fois, cela passait. Dès que plusieurs agents ont travaillé en parallèle — et
 * ils le font — deux harnais ont voulu le même port : le second serveur
 * n'écoutait pas, et Chromium recevait `ERR_CONNECTION_REFUSED`.
 *
 * Le résultat est pire qu'une panne franche, parce qu'il ne ressemble pas à
 * une panne : la capture échoue, la comparaison avant/après se fait sur des
 * images manquantes, et l'on conclut qu'un correctif ne sert à rien. C'est
 * probablement ce qui a conduit à annuler, sans explication, un correctif de
 * dégradés dont l'effet était pourtant mesuré — le harnais qui devait le
 * vérifier ne captait plus rien.
 *
 * On demande donc au système un port libre, ce qu'il sait faire mieux que
 * nous : écouter sur le port 0 le laisse en choisir un, et on le relâche
 * aussitôt. La fenêtre entre la libération et la reprise par notre serveur est
 * théoriquement ouverte à un tiers ; en pratique, avec des ports éphémères
 * attribués séquentiellement, elle ne s'est jamais refermée sur nous — et le
 * défaut qu'on répare, lui, était systématique.
 *
 * `SHOT_PORT` reste prioritaire : on veut pouvoir fixer le port quand on
 * observe une capture à la main.
 */
import { createServer } from 'node:net';

/** Port libre attribué par le système, ou celui qu'impose `SHOT_PORT`. */
export function portLibre() {
  const impose = Number(process.env.SHOT_PORT ?? 0);
  if (Number.isInteger(impose) && impose > 0) return Promise.resolve(impose);
  return new Promise((resoudre, rejeter) => {
    const sonde = createServer();
    sonde.on('error', rejeter);
    sonde.listen(0, '127.0.0.1', () => {
      const { port } = sonde.address();
      sonde.close(() => resoudre(port));
    });
  });
}
