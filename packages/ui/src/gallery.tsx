/**
 * UIGallery — planche de revue visuelle du design system.
 *
 * Elle affiche **tous** les composants, **toutes** les icônes et **tous** les
 * portraits, sans dépendre du moindre état de jeu : c'est la scène
 * `#/demo/galerie` de docs/03-ROUTES.md.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { banners, cx, palette, rarityColors, resourceColors, schoolColors } from './tokens.js';
import { installTextures, textureStyle } from './textures.js';
import type { TextureName } from './textures.js';
import {
  ARTIFACT_ICONS,
  ARTIFACT_RARITY,
  CORE_ICONS,
  RESOURCE_ICONS,
  RESOURCE_LABELS,
  SCHOOL_ICONS,
  SCHOOL_LABELS,
  SKILL_ICONS,
  SKILL_LABELS,
  SPELL_ICONS,
  SPELL_LABELS,
} from './icons/index.js';
import {
  Badge,
  Button,
  ConfirmBar,
  Dialog,
  Divider,
  Frame,
  IconButton,
  Panel,
  ProgressBar,
  ResourceBar,
  ScrollArea,
  Select,
  Sheet,
  Slider,
  Stat,
  Tabs,
  Toast,
  ToastStack,
  Toggle,
  Tooltip,
  Tour,
  TOUR_DEMO,
} from './components/index.js';
import type { ConfirmStage, ToastMessage } from './components/index.js';
import { BannerPip, FactionBlazon, PlayerBanner } from './heraldry.js';
import { HeroAvatar, HeroPortrait, HERO_PORTRAIT_LIST } from './portraits/index.js';
import { IconCoeur, IconEpee, IconEtoile, IconOeil, IconVitesse } from './icons/core-icons.js';

/* ─────────────────────────────── Outillage ──────────────────────────────── */

function Section({
  titre,
  note,
  children,
}: {
  titre: string;
  note?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="hmm-galerie__section">
      <Divider label={titre} onDark />
      {note ? <p className="hmm-galerie__note">{note}</p> : null}
      <div style={{ marginTop: 16 }}>{children}</div>
    </section>
  );
}

function Case({
  children,
  nom,
  clef,
}: {
  children: ReactNode;
  nom: string;
  clef?: string;
}): ReactElement {
  return (
    <div className="hmm-galerie__case">
      {children}
      <span className="hmm-galerie__nom">{nom}</span>
      {clef ? <span className="hmm-galerie__clef">{clef}</span> : null}
    </div>
  );
}

const MATIERES: readonly { key: TextureName; nom: string }[] = [
  { key: 'parchemin', nom: 'Parchemin' },
  { key: 'granit', nom: 'Granit' },
  { key: 'cuir', nom: 'Cuir' },
  { key: 'ferrure', nom: 'Ferrure' },
  { key: 'filDor', nom: "Fil d'or" },
  { key: 'veloute', nom: 'Velouté' },
];

/* ───────────────────────────────── Galerie ──────────────────────────────── */

export interface UIGalleryProps {
  className?: string;
}

/** Planche de contact de tout le design system. */
export function UIGallery({ className }: UIGalleryProps = {}): ReactElement {
  useEffect(() => {
    installTextures();
  }, []);

  const [dialogue, setDialogue] = useState(false);
  const [feuille, setFeuille] = useState(false);
  const [visite, setVisite] = useState(false);
  const [bascule, setBascule] = useState(true);
  const [bascule2, setBascule2] = useState(false);
  const [volume, setVolume] = useState(64);
  const [echelle, setEchelle] = useState(100);
  const [choix, setChoix] = useState('equilibre');
  const [etape, setEtape] = useState<ConfirmStage>('previsualisation');
  const [annonces, setAnnonces] = useState<ToastMessage[]>([
    { id: 'a1', tone: 'information', title: 'Semaine du Cerf', text: 'La croissance des créatures est augmentée de moitié.' },
    { id: 'a2', tone: 'succes', title: 'Cervières bâtit une forge', ttl: 0 },
  ]);

  const coreKeys = useMemo(() => Object.keys(CORE_ICONS).sort(), []);
  const spellKeys = useMemo(() => Object.keys(SPELL_ICONS), []);
  const artifactKeys = useMemo(() => Object.keys(ARTIFACT_ICONS), []);

  const retirer = (id: string): void => setAnnonces((l) => l.filter((m) => m.id !== id));

  return (
    <div className={cx('hmm-root', 'hmm-galerie', 'hmm-mat-granit', className)}>
      <header className="hmm-galerie__fronton">
        <h1 className="hmm-titre hmm-titre--sombre hmm-galerie__titre">Planche du design system</h1>
        <p className="hmm-galerie__sous">
          Heroes of Might and Magic — Auvergne Edition · parchemin sur granit, ferrures et filets d'or
        </p>
        <div className="hmm-galerie__rangee hmm-centre" style={{ marginTop: 20 }}>
          <FactionBlazon faction="granit" size={92} title="Blason de la Châtellenie de Granit" />
          <FactionBlazon faction="ermitage" size={92} title="Blason de l'Ermitage des Bois Noirs" />
          <FactionBlazon faction="neutre" size={92} title="Borne du Gardien des Bornes" />
        </div>
      </header>

      {/* ─────────────── Palette ─────────────── */}
      <Section
        titre="Palette"
        note="Toutes les couleurs du jeu sortent de cette liste : aucun blanc pur, aucun noir pur, aucun bleu générique."
      >
        <div className="hmm-galerie__grille">
          {Object.entries(palette).map(([nom, hex]) => (
            <Case key={nom} nom={nom} clef={hex}>
              <span
                style={{
                  width: 64,
                  height: 40,
                  borderRadius: 3,
                  background: `linear-gradient(160deg, ${hex} 0%, ${hex} 60%, rgba(42,50,66,.45) 100%)`,
                  boxShadow: 'inset 2px 2px 0 rgba(255,233,194,.3), inset -2px -2px 0 rgba(42,50,66,.5)',
                  display: 'block',
                }}
              />
            </Case>
          ))}
        </div>
        <div className="hmm-galerie__rangee" style={{ marginTop: 16 }}>
          {banners.map((b, i) => (
            <div key={b.id} className="hmm-galerie__case" style={{ minWidth: 96 }}>
              <PlayerBanner player={(i + 1) as 1 | 2 | 3 | 4 | 5} size={64} showLabel />
              <span className="hmm-galerie__nom">
                {b.label} · {b.pattern}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* ─────────────── Typographie ─────────────── */}
      <Section titre="Typographie" note="Cinzel pour les titres, EB Garamond pour le récit, Alegreya Sans pour les données.">
        <Panel matter="parchemin" padding="large">
          <p className="hmm-titre hmm-titre--enseigne">La Couronne du Forez</p>
          <p className="hmm-titre hmm-titre--section" style={{ marginTop: 12 }}>
            Châtellenie de Granit
          </p>
          <p className="hmm-recit" style={{ marginTop: 12, maxWidth: '62ch' }}>
            La pierre tient, la parole tient. Sur les hauteurs de Cervières, le vent de novembre
            entre par les archères et l'on compte les sacs de sel deux fois : une fois pour le
            grenier, une fois pour la conscience.
          </p>
          <p className="hmm-donnee" style={{ marginTop: 12 }}>
            Vaillance 4 · Garde 3 · Mystique 1 · Savoir 2 — 1 840 points de marche
          </p>
          <p className="hmm-legende" style={{ marginTop: 8 }}>
            Légende : aucun texte indispensable sous quinze pixels.
          </p>
        </Panel>
      </Section>

      {/* ─────────────── Matières ─────────────── */}
      <Section titre="Matières" note="Six matières générées en code : parchemin, granit, cuir, ferrure, fil d'or, velouté. Aucun fichier image.">
        <div className="hmm-galerie__grille hmm-galerie__grille--large">
          {MATIERES.map((m) => (
            <div key={m.key} className="hmm-galerie__case">
              <span
                style={{
                  ...textureStyle(m.key),
                  width: '100%',
                  height: 96,
                  borderRadius: 4,
                  display: 'block',
                  boxShadow: 'inset 2px 2px 0 rgba(255,233,194,.34), inset -2px -2px 0 rgba(42,50,66,.5)',
                }}
              />
              <span className="hmm-galerie__nom">{m.nom}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ─────────────── Boutons ─────────────── */}
      <Section titre="Boutons" note="Hauteur minimale 48 px, coins 3 px, états survol, actif, désactivé et focus visible.">
        <Panel matter="parchemin" padding="large">
          <div className="hmm-galerie__rangee">
            <Button variant="principal" leading={<IconEpee size={20} />}>
              Livrer bataille
            </Button>
            <Button variant="secondaire">Passer le tour</Button>
            <Button variant="or" leading={<IconEtoile size={20} />}>
              Monter de niveau
            </Button>
            <Button variant="danger">Démolir</Button>
            <Button variant="fantome">Annuler</Button>
            <Button variant="secondaire" disabled>
              Indisponible
            </Button>
            <Button variant="principal" size="grand">
              Nouvelle partie
            </Button>
            <Button variant="secondaire" size="compact">
              Détail
            </Button>
          </div>
          <div className="hmm-galerie__rangee" style={{ marginTop: 16 }}>
            <IconButton label="Ouvrir le codex" variant="ferrure">
              <CoreIcon name="livre" />
            </IconButton>
            <IconButton label="Réglages" variant="parchemin">
              <CoreIcon name="engrenage" />
            </IconButton>
            <IconButton label="Son" variant="or" pressed>
              <CoreIcon name="son" />
            </IconButton>
            <IconButton label="Fermer" variant="danger">
              <CoreIcon name="fermer" />
            </IconButton>
            <IconButton label="Aide" variant="fantome">
              <CoreIcon name="information" />
            </IconButton>
            <IconButton label="Verrouillé" variant="ferrure" disabled>
              <CoreIcon name="verrou" />
            </IconButton>
          </div>
        </Panel>
      </Section>

      {/* ─────────────── Panneaux et cadres ─────────────── */}
      <Section titre="Panneaux, cadres et séparateurs">
        <div className="hmm-galerie__grille hmm-galerie__grille--large">
          <Panel title="Grenier à sel" subtitle="Cervières · jour 12" matter="parchemin">
            <p className="hmm-recit">Trois cents muids en réserve, la gabelle rentre.</p>
            <Divider label="Réserve" />
            <ProgressBar value={300} max={480} label="Réserve de sel" tone="or" />
          </Panel>
          <Panel title="Ferrure" matter="ferrure" raised>
            <p style={{ color: 'var(--hmm-texte-clair)' }}>Panneau de ferrure, surélevé.</p>
          </Panel>
          <Panel title="Cuir" matter="cuir">
            <p style={{ color: 'var(--hmm-texte-clair)' }}>Panneau de cuir, biseau clair en haut.</p>
          </Panel>
          <Frame name="Maison du Trésor" tone="or" className="hmm-mat-veloute">
            <p className="hmm-recit" style={{ color: 'var(--hmm-texte-clair)' }}>
              Cadre d'enluminure : filet doré double, écoinçons feuillagés, cartouche de nom en Cinzel.
            </p>
          </Frame>
        </div>
      </Section>

      {/* ─────────────── Contrôles ─────────────── */}
      <Section titre="Contrôles">
        <div className="hmm-galerie__grille hmm-galerie__grille--large">
          <Panel matter="parchemin" title="Options">
            <Toggle checked={bascule} onChange={setBascule} label="Animations d'ambiance" hint="Amplitude maximale de trois pixels." />
            <Toggle checked={bascule2} onChange={setBascule2} label="Contraste renforcé" />
            <Divider plain />
            <Slider label="Musique" value={volume} onChange={setVolume} display={`${volume} %`} ticks={[0, 25, 50, 75, 100]} />
            <Slider label="Échelle du texte" min={90} max={130} step={2} value={echelle} onChange={setEchelle} display={`${echelle} %`} />
            <Divider plain />
            <Select
              label="Adversaire"
              value={choix}
              onChange={setChoix}
              options={[
                { value: 'prudent', label: 'Prudent' },
                { value: 'equilibre', label: 'Équilibré' },
                { value: 'agressif', label: 'Agressif' },
                { value: 'expert', label: 'Expert' },
              ]}
              hint="Le profil règle l'audace des sorties et la gestion des réserves."
            />
          </Panel>
          <Panel matter="parchemin" title="Jauges">
            <ProgressBar value={62} max={100} label="Points de marche" tone="or" />
            <div style={{ height: 12 }} />
            <ProgressBar value={18} max={30} label="Mana" tone="brumes" size="fin" />
            <div style={{ height: 12 }} />
            <ProgressBar value={7} max={21} label="Proclamation" tone="grenat" size="epais" marks={[7, 14]} />
            <div style={{ height: 12 }} />
            <ProgressBar value={840} max={1400} label="Expérience" tone="sinople" caption="840 / 1 400 — niveau 12" />
          </Panel>
        </div>
      </Section>

      {/* ─────────────── Données ─────────────── */}
      <Section titre="Données et qualifications">
        <Panel matter="parchemin" padding="large">
          <ResourceBar
            values={{ ecus: 12480, bois: 34, granit: 21, fer: 12, sel: 46, essence: 5, filDor: 2 }}
            income={{ ecus: 1250, bois: 4, granit: 3, fer: 2, sel: 6, essence: 1, filDor: 0 }}
          />
          <div className="hmm-galerie__rangee" style={{ marginTop: 20 }}>
            <Stat label="Vaillance" value={4} icon={<IconEpee size={22} />} delta={1} tone="faveur" />
            <Stat label="Garde" value={3} icon={<CoreIcon name="bouclier" size={22} />} />
            <Stat label="Vie" value={215} icon={<IconCoeur size={22} />} hint="par pile" />
            <Stat label="Marche" value="1 840" icon={<IconVitesse size={22} />} tone="or" />
            <Stat label="Vision" value={9} icon={<IconOeil size={22} />} delta={-1} tone="defaveur" />
            <Stat label="Moral" value="+2" icon={<CoreIcon name="moral" size={22} />} orientation="colonne" size="grand" />
          </div>
          <div className="hmm-galerie__rangee" style={{ marginTop: 20 }}>
            <Badge tone="commun">Commun</Badge>
            <Badge tone="rare">Rare</Badge>
            <Badge tone="majeur">Majeur</Badge>
            <Badge tone="relique">Relique</Badge>
            <Badge tone="braises">Braises</Badge>
            <Badge tone="sources">Sources</Badge>
            <Badge tone="brumes">Brumes</Badge>
            <Badge tone="racines">Racines</Badge>
            <Badge tone="or" icon={<IconEtoile size={14} />}>
              Maître
            </Badge>
            <Badge tone="neutre" outline>
              Novice
            </Badge>
            {banners.map((b, i) => (
              <span key={b.id} className="hmm-galerie__rangee" style={{ gap: 6 }}>
                <BannerPip player={(i + 1) as 1 | 2 | 3 | 4 | 5} />
                <span className="hmm-legende">{b.label}</span>
              </span>
            ))}
          </div>
        </Panel>
      </Section>

      {/* ─────────────── Onglets et défilement ─────────────── */}
      <Section titre="Onglets, défilement et info-bulles">
        <Panel matter="parchemin" padding="large">
          <Tabs
            label="Fiche de héros"
            items={[
              {
                id: 'competences',
                label: 'Compétences',
                icon: <CoreIcon name="etoile" size={18} />,
                content: (
                  <ScrollArea maxHeight={180} label="Liste des compétences">
                    <div className="hmm-galerie__grille">
                      {Object.entries(SKILL_ICONS).map(([id, Icone]) => (
                        <Case key={id} nom={SKILL_LABELS[id] ?? id}>
                          <Icone size={40} title={SKILL_LABELS[id]} />
                        </Case>
                      ))}
                    </div>
                  </ScrollArea>
                ),
              },
              {
                id: 'sorts',
                label: 'Sorts',
                icon: <CoreIcon name="feu" size={18} />,
                content: (
                  <div className="hmm-galerie__rangee">
                    {Object.entries(SCHOOL_ICONS).map(([id, Icone]) => (
                      <Tooltip key={id} content={`École des ${SCHOOL_LABELS[id]}`}>
                        <span className="hmm-galerie__case" style={{ minWidth: 96 }}>
                          <Icone size={44} />
                          <span className="hmm-galerie__nom">{SCHOOL_LABELS[id]}</span>
                        </span>
                      </Tooltip>
                    ))}
                  </div>
                ),
              },
              { id: 'biographie', label: 'Biographie', content: <p className="hmm-recit">Onglet de récit.</p> },
              { id: 'verrouille', label: 'Verrouillé', disabled: true, content: null },
            ]}
          />
        </Panel>
      </Section>

      {/* ─────────────── Surfaces ─────────────── */}
      <Section titre="Surfaces modales et annonces">
        <Panel matter="parchemin" padding="large">
          <div className="hmm-galerie__rangee">
            <Button variant="principal" onClick={() => setDialogue(true)}>
              Ouvrir un dialogue
            </Button>
            <Button variant="secondaire" onClick={() => setFeuille(true)}>
              Ouvrir la feuille mobile
            </Button>
            <Button variant="secondaire" onClick={() => setVisite(true)}>
              Lancer la visite guidée
            </Button>
            <Button
              variant="or"
              onClick={() =>
                setAnnonces((l) => [
                  ...l,
                  {
                    id: `a${l.length + 3}`,
                    tone: 'avertissement',
                    title: 'Colonne repérée près du Col des Sagnes',
                    text: 'Une bannière adverse marche vers la Maison du Trésor.',
                  },
                ])
              }
            >
              Publier une annonce
            </Button>
          </div>
          <div style={{ marginTop: 20, position: 'relative' }}>
            {annonces.map((m) => (
              <div key={m.id} style={{ maxWidth: 380, marginBottom: 8 }}>
                <Toast message={{ ...m, ttl: 0 }} onDismiss={retirer} />
              </div>
            ))}
          </div>
        </Panel>
      </Section>

      {/* ─────────────── Barre d'engagement ─────────────── */}
      <Section
        titre="Barre d'engagement"
        note="Sélection, prévisualisation, confirmation : aucun coup irréversible ne part d'un simple clic."
      >
        <div className="hmm-galerie__rangee" style={{ marginBottom: 12 }}>
          {(['selection', 'previsualisation', 'confirmation'] as ConfirmStage[]).map((s) => (
            <Button key={s} variant={etape === s ? 'or' : 'secondaire'} size="compact" onClick={() => setEtape(s)}>
              {s}
            </Button>
          ))}
        </div>
        <ConfirmBar
          stage={etape}
          selection="Attaquer la garde de la Maison du Trésor"
          preview="Pertes estimées : 14 piquiers, 3 arbalétriers. Gain : le troisième sceau."
          question="Engagez-vous la bannière grenat sur ce site ?"
          grave
          onCancel={() => setEtape('selection')}
          onBack={() => setEtape('selection')}
          onNext={() => setEtape('previsualisation')}
          onConfirm={() => setEtape('selection')}
        />
      </Section>

      {/* ─────────────── Icônes ─────────────── */}
      <Section titre="Icônes d'interface" note={`${coreKeys.length} icônes générales, dessinées à la main. Aucun emoji.`}>
        <div className="hmm-galerie__grille">
          {coreKeys.map((k) => {
            const Icone = CORE_ICONS[k];
            return (
              <Case key={k} nom={k}>
                <Icone size={40} title={k} />
              </Case>
            );
          })}
        </div>
      </Section>

      <Section titre="Ressources" note="Sept ressources, identifiables par la forme seule.">
        <div className="hmm-galerie__grille">
          {Object.entries(RESOURCE_ICONS).map(([k, Icone]) => (
            <Case key={k} nom={RESOURCE_LABELS[k] ?? k} clef={`ressource_${k}`}>
              <Icone size={44} title={RESOURCE_LABELS[k]} />
              <span
                style={{
                  width: 34,
                  height: 3,
                  background: resourceColors[k as keyof typeof resourceColors],
                  display: 'block',
                }}
              />
            </Case>
          ))}
        </div>
      </Section>

      <Section titre="Écoles de magie">
        <div className="hmm-galerie__grille">
          {Object.entries(SCHOOL_ICONS).map(([k, Icone]) => (
            <Case key={k} nom={SCHOOL_LABELS[k] ?? k} clef={`ecole_${k}`}>
              <Icone size={48} title={SCHOOL_LABELS[k]} />
              <span
                style={{ width: 34, height: 3, background: schoolColors[k as keyof typeof schoolColors], display: 'block' }}
              />
            </Case>
          ))}
        </div>
      </Section>

      <Section titre="Compétences" note="Vingt compétences, clefs imposées par le contenu.">
        <div className="hmm-galerie__grille">
          {Object.entries(SKILL_ICONS).map(([k, Icone]) => (
            <Case key={k} nom={SKILL_LABELS[k] ?? k} clef={`competence_${k}`}>
              <Icone size={44} title={SKILL_LABELS[k]} />
            </Case>
          ))}
        </div>
      </Section>

      <Section titre="Sorts" note="Trente-deux sorts : cartouche de l'école, glyphe propre au sort, ferrure indiquant le degré.">
        <div className="hmm-galerie__grille">
          {spellKeys.map((k) => {
            const Icone = SPELL_ICONS[k];
            return (
              <Case key={k} nom={SPELL_LABELS[k] ?? k} clef={`sort_${k}`}>
                <Icone size={44} title={SPELL_LABELS[k]} />
              </Case>
            );
          })}
        </div>
      </Section>

      <Section
        titre="Artefacts"
        note="Cinquante-trois pièces. La forme dit la nature de l'objet, la ferrure dit la rareté (un à quatre clous), le cabochon distingue la pièce."
      >
        <div className="hmm-galerie__grille">
          {artifactKeys.map((k) => {
            const Icone = ARTIFACT_ICONS[k];
            const rarete = ARTIFACT_RARITY[k];
            return (
              <Case key={k} nom={k.replace(/_/g, ' ')} clef={`artefact_${k}`}>
                <Icone size={44} title={k} />
                <span
                  style={{
                    width: 34,
                    height: 3,
                    background: rarityColors[rarete] ?? palette.parcheminOmbre,
                    display: 'block',
                  }}
                />
              </Case>
            );
          })}
        </div>
      </Section>

      {/* ─────────────── Portraits ─────────────── */}
      <Section
        titre="Portraits des vingt-et-un héros"
        note="Peinture vectorielle par strates, lumière latérale à 315°, cadre d'enluminure et cartouche en Cinzel. Diversité d'âge de vingt-quatre à soixante et un ans."
      >
        <div className="hmm-galerie__grille hmm-galerie__grille--portraits">
          {HERO_PORTRAIT_LIST.map((h) => (
            <div key={h.id} className="hmm-galerie__case">
              <HeroPortrait heroId={h.id} size={172} frame="enluminure" />
              <span className="hmm-galerie__nom">
                {h.name} — {h.age} ans
              </span>
              <span className="hmm-galerie__clef">portrait_{h.id}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section titre="Lisibilité en vignette" note="Les mêmes portraits en cinquante-six pixels : la silhouette, le couvre-chef et la couleur de faction doivent suffire.">
        <div className="hmm-galerie__rangee">
          {HERO_PORTRAIT_LIST.map((h) => (
            <Tooltip key={h.id} content={h.name} placement="bas">
              <HeroAvatar heroId={h.id} size={56} title={`Portrait de ${h.name}`} />
            </Tooltip>
          ))}
        </div>
      </Section>

      <Section titre="Portrait de fiche" note="Le même dessin en trois cent vingt pixels révèle le modelé, les rides, le grain et le détail signature.">
        <div className="hmm-galerie__rangee">
          <HeroPortrait heroId="georges" size={320} />
          <HeroPortrait heroId="agathe" size={320} />
          <HeroPortrait heroId="jules" size={320} />
        </div>
      </Section>

      {/* ─────────────── Surfaces montées ─────────────── */}
      <Dialog
        open={dialogue}
        onClose={() => setDialogue(false)}
        title="Ouvrir la Maison du Trésor"
        subtitle="Trois sceaux réunis"
        footer={
          <>
            <Button variant="fantome" onClick={() => setDialogue(false)}>
              Plus tard
            </Button>
            <Button variant="principal" onClick={() => setDialogue(false)}>
              Lancer la proclamation
            </Button>
          </>
        }
      >
        <p className="hmm-recit">
          La garde de la Maison du Trésor tient encore le porche. Une fois la proclamation lancée, il
          faudra tenir le site vingt et un jours, et tout le comté le saura.
        </p>
      </Dialog>

      <Sheet open={feuille} onClose={() => setFeuille(false)} title="Armée du héros" height={0.6}>
        <p className="hmm-recit">
          Glissez la poignée vers le bas pour refermer : la feuille suit le doigt, puis l'inertie
          décide.
        </p>
        <div className="hmm-galerie__rangee" style={{ marginTop: 16 }}>
          {HERO_PORTRAIT_LIST.slice(0, 6).map((h) => (
            <HeroAvatar key={h.id} heroId={h.id} size={56} />
          ))}
        </div>
      </Sheet>

      <Tour open={visite} steps={TOUR_DEMO} onClose={() => setVisite(false)} />

      <ToastStack messages={[]} onDismiss={retirer} />
    </div>
  );
}

/** Raccourci interne : icône d'interface par clef courte. */
function CoreIcon({ name, size = 22 }: { name: string; size?: number }): ReactElement | null {
  const Icone = CORE_ICONS[name];
  return Icone ? <Icone size={size} /> : null;
}

export default UIGallery;
