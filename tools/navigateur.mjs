/**
 * Lancement de Chromium, ici comme ailleurs.
 *
 * **Pourquoi ce fichier existe.** Les épreuves de bout en bout acceptent une
 * adresse : sans argument elles servent le paquet local, avec une adresse
 * elles vont éprouver le site DÉPLOYÉ. Le second cas échouait aussitôt —
 * `net::ERR_CONNECTION_RESET` dès la première navigation — parce que la sortie
 * HTTPS de cet environnement passe par un mandataire local. `curl` le connaît
 * par `HTTPS_PROXY` ; le Chromium lancé par Playwright, non : il n'hérite pas
 * de la variable et tentait une connexion directe qui n'existe pas.
 *
 * On le lui passe donc explicitement. Rien n'est désactivé au passage : le
 * magasin de certificats du navigateur fait déjà confiance à l'autorité du
 * mandataire, la vérification TLS reste entière.
 */
import { chromium } from '@playwright/test';

/**
 * @param {boolean} distant  vrai si l'on vise un site hors de cette machine
 */
export async function lancerNavigateur(distant = false) {
  const args = ['--no-sandbox', '--disable-dev-shm-usage'];
  const mandataire = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? null;
  /* En local, surtout pas de mandataire : 127.0.0.1 se joint en direct, et le
     faire passer par un intermédiaire ne ferait qu'ajouter un point de panne. */
  if (!distant || !mandataire) return chromium.launch({ args });
  return chromium.launch({ args, proxy: { server: mandataire } });
}
