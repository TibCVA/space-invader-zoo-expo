/**
 * `render/postfx.ts` — **l'unique** filtre de la carte, en une seule passe.
 *
 * Tout ce que la bible demande en §4 tient dans ce fragment : vignettage 0,22,
 * aberration chromatique 0,4 px aux bords, grain animé 0,035, étalonnage par
 * courbe (ombres bleutées, hautes lumières ambrées) et bloom sélectif au-dessus
 * de 0,78. On y a joint le brouillard de guerre : la désaturation de 60 % d'une
 * zone explorée est une opération colorimétrique, elle n'a pas d'équivalent en
 * calques, et la faire ici évite une seconde passe.
 *
 * Les deux programmes — GLSL pour WebGL, WGSL pour WebGPU — sont fournis :
 * l'application du client préfère WebGPU quand le navigateur le sait.
 */

import { Filter, GlProgram, GpuProgram, UniformGroup } from 'pixi.js';
import type { Texture } from 'pixi.js';

/* ────────────────────────────────── GLSL ────────────────────────────────── */

const VERT_GL = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform highp vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const FRAG_GL = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uFogTexture;

uniform highp vec4 uInputSize;
uniform highp vec4 uInputClamp;
uniform highp vec4 uOutputFrame;

uniform vec4 uReglages;
uniform vec4 uFogRect;
uniform vec4 uEcran;
uniform vec4 uTemps;

float bruit(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 prendre(vec2 uv) {
    vec4 s = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
    return s.a > 0.0 ? s.rgb / s.a : s.rgb;
}

void main(void)
{
    vec2 pos = uOutputFrame.xy + vTextureCoord * uInputSize.xy;
    vec2 ecran = max(uEcran.xy, vec2(1.0));
    vec2 e = pos / ecran;
    vec2 c = e - 0.5;
    float r2 = dot(c, c);

    vec4 brut = texture(uTexture, vTextureCoord);
    float alpha = brut.a;
    vec3 col = alpha > 0.0 ? brut.rgb / alpha : brut.rgb;

    /* Aberration chromatique : nulle au centre, 0,4 px au coin. */
    float ab = uReglages.y * r2 * 4.0;
    vec2 dir = (r2 > 0.00001 ? normalize(c) : vec2(0.0)) * ab * uInputSize.zw;
    col.r = prendre(vTextureCoord + dir).r;
    col.b = prendre(vTextureCoord - dir).b;

    /* Bloom sélectif : six prélèvements en couronne, seuil 0,78. */
    float seuil = uReglages.w;
    vec3 halo = vec3(0.0);
    vec2 pas = uInputSize.zw * uTemps.z;
    halo += max(prendre(vTextureCoord + vec2( pas.x,  0.0)) - seuil, vec3(0.0));
    halo += max(prendre(vTextureCoord + vec2(-pas.x,  0.0)) - seuil, vec3(0.0));
    halo += max(prendre(vTextureCoord + vec2( 0.0,  pas.y)) - seuil, vec3(0.0));
    halo += max(prendre(vTextureCoord + vec2( 0.0, -pas.y)) - seuil, vec3(0.0));
    halo += max(prendre(vTextureCoord + pas * 1.7) - seuil, vec3(0.0));
    halo += max(prendre(vTextureCoord - pas * 1.7) - seuil, vec3(0.0));
    col += halo * 0.34;

    /* Brouillard de guerre : exploré désaturé et assombri, inconnu voilé. */
    if (uTemps.y > 0.5) {
        vec2 fuv = (pos - uFogRect.xy) / max(uFogRect.zw, vec2(1.0));
        float niveau = texture(uFogTexture, clamp(fuv, vec2(0.0015), vec2(0.9985))).r;
        float inconnu = clamp((0.5 - niveau) * 2.0, 0.0, 1.0);
        float explore = clamp((1.0 - niveau) * 2.0, 0.0, 1.0) * (1.0 - inconnu);
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        vec3 dormant = mix(col, vec3(lum), 0.6) * 0.65;
        dormant = mix(dormant, vec3(0.227, 0.275, 0.341), 0.16);
        col = mix(col, dormant, explore);
        vec2 monde = pos + uEcran.zw;
        float p1 = bruit(floor(monde / 3.0));
        float p2 = bruit(floor(monde / 11.0) + 7.3);
        vec3 voile = vec3(0.102, 0.122, 0.149) * (0.80 + p1 * 0.22 + p2 * 0.16);
        col = mix(col, voile, inconnu * 0.92);
    }

    /* Étalonnage : les basses valeurs bleuissent, les hautes s'ambrent. */
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col += vec3(-0.004, 0.006, 0.034) * (1.0 - smoothstep(0.0, 0.5, l));
    col += vec3(0.072, 0.042, -0.022) * smoothstep(0.34, 1.0, l);
    col = clamp(col, 0.0, 1.0);
    col = mix(col, col * col * (3.0 - 2.0 * col), 0.15);
    /* Exposition : un massif de sapins reste sombre par nature, mais une carte
       de jeu doit vivre dans les demi-teintes, pas dans les noirs. */
    col = pow(col, vec3(0.84));

    /* Grain animé. */
    float g = bruit(pos * 1.7 + vec2(uTemps.x * 61.0, uTemps.x * 37.0)) - 0.5;
    col += g * uReglages.z;

    /* Vignettage. */
    float vig = 1.0 - uReglages.x * smoothstep(0.22, 1.02, length(c) * 1.42);
    col *= vig;

    col = clamp(col, 0.0, 1.0);
    finalColor = vec4(col * alpha, alpha);
}
`;

/* ────────────────────────────────── WGSL ────────────────────────────────── */

const WGSL = `
struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};

struct Reglages {
  uReglages:vec4<f32>,
  uFogRect:vec4<f32>,
  uEcran:vec4<f32>,
  uTemps:vec4<f32>,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;

@group(1) @binding(0) var<uniform> reglages : Reglages;
@group(1) @binding(1) var uFogTexture: texture_2d<f32>;
@group(1) @binding(2) var uFogSampler : sampler;

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv : vec2<f32>
  };

fn filterVertexPosition(aPosition:vec2<f32>) -> vec4<f32>
{
    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

fn filterTextureCoord( aPosition:vec2<f32> ) -> vec2<f32>
{
    return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

@vertex
fn mainVertex(@location(0) aPosition : vec2<f32>) -> VSOutput {
  return VSOutput(filterVertexPosition(aPosition), filterTextureCoord(aPosition));
}

fn bruit(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

fn prendre(uv: vec2<f32>) -> vec3<f32> {
  let s = textureSample(uTexture, uSampler, clamp(uv, gfu.uInputClamp.xy, gfu.uInputClamp.zw));
  if (s.a > 0.0) { return s.rgb / s.a; }
  return s.rgb;
}

@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let pos = gfu.uOutputFrame.xy + uv * gfu.uInputSize.xy;
  let ecran = max(reglages.uEcran.xy, vec2<f32>(1.0, 1.0));
  let e = pos / ecran;
  let c = e - vec2<f32>(0.5, 0.5);
  let r2 = dot(c, c);

  let brut = textureSample(uTexture, uSampler, uv);
  let alpha = brut.a;
  var col = select(brut.rgb, brut.rgb / max(alpha, 0.0001), alpha > 0.0);

  let ab = reglages.uReglages.y * r2 * 4.0;
  var nd = vec2<f32>(0.0, 0.0);
  if (r2 > 0.00001) { nd = normalize(c); }
  let dir = nd * ab * gfu.uInputSize.zw;
  col.r = prendre(uv + dir).r;
  col.b = prendre(uv - dir).b;

  let seuil = vec3<f32>(reglages.uReglages.w);
  var halo = vec3<f32>(0.0, 0.0, 0.0);
  let pas = gfu.uInputSize.zw * reglages.uTemps.z;
  halo = halo + max(prendre(uv + vec2<f32>(pas.x, 0.0)) - seuil, vec3<f32>(0.0));
  halo = halo + max(prendre(uv - vec2<f32>(pas.x, 0.0)) - seuil, vec3<f32>(0.0));
  halo = halo + max(prendre(uv + vec2<f32>(0.0, pas.y)) - seuil, vec3<f32>(0.0));
  halo = halo + max(prendre(uv - vec2<f32>(0.0, pas.y)) - seuil, vec3<f32>(0.0));
  halo = halo + max(prendre(uv + pas * 1.7) - seuil, vec3<f32>(0.0));
  halo = halo + max(prendre(uv - pas * 1.7) - seuil, vec3<f32>(0.0));
  col = col + halo * 0.34;

  if (reglages.uTemps.y > 0.5) {
    let fuv = (pos - reglages.uFogRect.xy) / max(reglages.uFogRect.zw, vec2<f32>(1.0, 1.0));
    let niveau = textureSample(uFogTexture, uFogSampler, clamp(fuv, vec2<f32>(0.0015), vec2<f32>(0.9985))).r;
    let inconnu = clamp((0.5 - niveau) * 2.0, 0.0, 1.0);
    let explore = clamp((1.0 - niveau) * 2.0, 0.0, 1.0) * (1.0 - inconnu);
    let lum = dot(col, vec3<f32>(0.299, 0.587, 0.114));
    var dormant = mix(col, vec3<f32>(lum), 0.6) * 0.65;
    dormant = mix(dormant, vec3<f32>(0.227, 0.275, 0.341), 0.16);
    col = mix(col, dormant, explore);
    let monde = pos + reglages.uEcran.zw;
    let p1 = bruit(floor(monde / 3.0));
    let p2 = bruit(floor(monde / 11.0) + vec2<f32>(7.3, 7.3));
    let voile = vec3<f32>(0.102, 0.122, 0.149) * (0.80 + p1 * 0.22 + p2 * 0.16);
    col = mix(col, voile, inconnu * 0.92);
  }

  let l = dot(col, vec3<f32>(0.299, 0.587, 0.114));
  col = col + vec3<f32>(-0.004, 0.006, 0.034) * (1.0 - smoothstep(0.0, 0.5, l));
  col = col + vec3<f32>(0.072, 0.042, -0.022) * smoothstep(0.34, 1.0, l);
  col = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));
  col = mix(col, col * col * (vec3<f32>(3.0) - 2.0 * col), 0.15);
  col = pow(col, vec3<f32>(0.84));

  let g = bruit(pos * 1.7 + vec2<f32>(reglages.uTemps.x * 61.0, reglages.uTemps.x * 37.0)) - 0.5;
  col = col + vec3<f32>(g * reglages.uReglages.z);

  let vig = 1.0 - reglages.uReglages.x * smoothstep(0.22, 1.02, length(c) * 1.42);
  col = col * vig;
  col = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));

  return vec4<f32>(col * alpha, alpha);
}
`;

/* ─────────────────────────────── La fabrique ────────────────────────────── */

export interface ReglagesPostFx {
  vignettage: number;
  /** décalage chromatique au coin, en pixels */
  aberration: number;
  grain: number;
  /** seuil du bloom sélectif */
  seuilBloom: number;
  /** rayon du bloom, en pixels */
  rayonBloom: number;
}

export const POSTFX_DEFAUT: ReglagesPostFx = {
  vignettage: 0.22,
  aberration: 0.4,
  grain: 0.035,
  seuilBloom: 0.78,
  rayonBloom: 3.2,
};

export class PostTraitement {
  readonly filtre: Filter;
  private readonly groupe: UniformGroup;

  constructor(fogTexture: Texture, reglages: ReglagesPostFx = POSTFX_DEFAUT) {
    this.groupe = new UniformGroup({
      uReglages: {
        value: new Float32Array([
          reglages.vignettage,
          reglages.aberration,
          reglages.grain,
          reglages.seuilBloom,
        ]),
        type: 'vec4<f32>',
      },
      uFogRect: { value: new Float32Array([0, 0, 1, 1]), type: 'vec4<f32>' },
      uEcran: { value: new Float32Array([1, 1, 0, 0]), type: 'vec4<f32>' },
      uTemps: { value: new Float32Array([0, 1, reglages.rayonBloom, 0]), type: 'vec4<f32>' },
    });

    this.filtre = new Filter({
      glProgram: GlProgram.from({ vertex: VERT_GL, fragment: FRAG_GL, name: 'carte-postfx' }),
      gpuProgram: GpuProgram.from({
        vertex: { source: WGSL, entryPoint: 'mainVertex' },
        fragment: { source: WGSL, entryPoint: 'mainFragment' },
      }),
      resources: {
        reglages: this.groupe,
        uFogTexture: fogTexture.source,
        uFogSampler: fogTexture.source.style,
      },
      padding: 0,
      antialias: 'off',
    });
  }

  /** Met à jour ce qui change à chaque image. */
  regler(o: {
    temps: number;
    largeur: number;
    hauteur: number;
    ancreX: number;
    ancreY: number;
    brouillard: boolean;
    fogRect: { x: number; y: number; largeur: number; hauteur: number };
  }): void {
    const u = this.groupe.uniforms as Record<string, Float32Array>;
    const rect = u.uFogRect;
    rect[0] = o.fogRect.x;
    rect[1] = o.fogRect.y;
    rect[2] = o.fogRect.largeur;
    rect[3] = o.fogRect.hauteur;
    const ecran = u.uEcran;
    ecran[0] = o.largeur;
    ecran[1] = o.hauteur;
    ecran[2] = o.ancreX;
    ecran[3] = o.ancreY;
    const temps = u.uTemps;
    temps[0] = o.temps;
    temps[1] = o.brouillard ? 1 : 0;
    this.groupe.update();
  }

  destroy(): void {
    this.filtre.destroy();
  }
}

/**
 * Construit le filtre unique, ou `null` si le pilote le refuse : la carte doit
 * rester jouable même sans post-traitement (elle bascule alors sur un voile de
 * brouillard peint en calque).
 */
export function creerPostFx(fogTexture: Texture, reglages?: ReglagesPostFx): PostTraitement | null {
  try {
    return new PostTraitement(fogTexture, reglages);
  } catch (cause) {
    console.warn('[carte] post-traitement indisponible, repli sans filtre.', cause);
    return null;
  }
}
