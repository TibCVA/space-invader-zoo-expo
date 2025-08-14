// Hotfix: imports ESM explicites (fiables sur Safari iOS)
// Utilise le paramètre ?module pour que les dépendances internes soient résolues.
// Sans cela, le navigateur ne sait pas interpréter l'import "three" présent dans
// OrbitControls.js, ce qui empêche le chargement sur Safari iOS ou Chrome Windows.
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js?module';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js?module';

/* =========================
   CONFIG & CONSTANTES
   ========================= */
const DPR = Math.min(window.devicePixelRatio || 1, 2);

const WORLD = {
  planetRadius: 3.2,
  invaderScale: 0.02,        // taille d'un "pixel" AVANT scaling
  invaderDepth: 0.035,
  spacingRatio: 0.08,
  maxVoxelsPerInvader: 900,  // ~30x30
  maxInstancesGlobal: 300000,
  invaderMaxWorldSize: 0.10, // 10% du diamètre => petit (500+ invaders ok)
  repelRadius: 0.35,
  repelStrength: 1.0,
  hoverMargin: 0.03
};

/* =========================
   RENDERER / SCÈNE / CAMÉRA
   ========================= */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(DPR);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 150);
camera.position.set(0, WORLD.planetRadius*0.75, WORLD.planetRadius*2.0);

/* =========================
   LUMIÈRES
   ========================= */
const sun = new THREE.DirectionalLight(0xffffff, 0.95);
sun.position.set(-4, 6, 8);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfdfff, 0x2a1e1a, 0.7));

/* =========================
   PLANÈTE PASTEL + ATMOSPHÈRE
   ========================= */
function generatePlanetTexture(w=512, h=256) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  const g = ctx.createLinearGradient(0,0,0,h);
  g.addColorStop(0.00, '#2b5b6a');
  g.addColorStop(0.55, '#3a7083');
  g.addColorStop(1.00, '#2c5563');
  ctx.fillStyle = g; ctx.fillRect(0,0,w,h);

  const seed = 1337;
  function rand(n){ return Math.sin(n*16807 + seed)*43758.5453 % 1; }
  function noise1d(x){ const i=Math.floor(x), f=x-i; const a=rand(i), b=rand(i+1); return a*(1-f)+b*f; }

  ctx.globalAlpha = 0.25;
  for (let y=0; y<h; y++) {
    const v = y/h;
    const band = 0.5 + 0.5*Math.sin((v*3.5 + 0.15)*Math.PI*2);
    const n = 0.5 + 0.5*noise1d(v*24.0);
    const t = Math.min(1, Math.max(0, (band*0.6 + n*0.4)));
    ctx.fillStyle = `rgba(255,255,255,${0.12*t})`;
    ctx.fillRect(0,y,w,1);
  }
  ctx.globalAlpha = 1.0;

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i=0;i<40;i++){
    const cx = Math.random()*w, cy=Math.random()*h;
    const r = 10 + Math.random()*30;
    const grd = ctx.createRadialGradient(cx,cy,0,cx,cy,r);
    grd.addColorStop(0, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  return tex;
}

const planetGeo = new THREE.SphereGeometry(WORLD.planetRadius, 128, 96);
const planetMat = new THREE.MeshStandardMaterial({
  map: generatePlanetTexture(512,256),
  color: new THREE.Color('#274b59').convertSRGBToLinear(),
  roughness: 0.9,
  metalness: 0.03
});
const planet = new THREE.Mesh(planetGeo, planetMat);
scene.add(planet);

// relief doux
(() => {
  const pos = planetGeo.attributes.position, v=new THREE.Vector3();
  for(let i=0;i<pos.count;i++){
    v.fromBufferAttribute(pos,i).normalize();
    const p=0.05*(Math.sin(7*v.x)+Math.sin(9*v.y)+Math.sin(11*v.z));
    v.multiplyScalar(WORLD.planetRadius + p);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  planetGeo.computeVertexNormals();
})();

// halo atmosphérique
(() => {
  const g = new THREE.SphereGeometry(WORLD.planetRadius*1.02, 64, 48);
  const vshader = `
    varying float vDot;
    void main(){
      vec3 n = normalize(normalMatrix * normal);
      vec3 v = normalize((modelViewMatrix * vec4(position,1.0)).xyz);
      vDot = 1.0 - max(dot(n, -v), 0.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }`;
  const fshader = `
    varying float vDot;
    void main(){ float a = pow(vDot, 4.0);
      gl_FragColor = vec4(0.3, 0.6, 1.0, a*0.25); }`;
  const m = new THREE.ShaderMaterial({
    vertexShader: vshader, fragmentShader: fshader,
    blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true, depthWrite: false
  });
  scene.add(new THREE.Mesh(g, m));
})();

/* =========================
   ÉTOILES
   ========================= */
(() => {
  const N=3200, a=new Float32Array(3*N);
  for(let i=0;i<N;i++){
    const r=70+Math.random()*70, t=Math.acos(Math.random()*2-1), p=Math.random()*Math.PI*2;
    a[3*i]=r*Math.sin(t)*Math.cos(p); a[3*i+1]=r*Math.cos(t); a[3*i+2]=r*Math.sin(t)*Math.sin(p);
  }
  const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a,3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size:.6, color:0xffffff })));
})();

/* =========================
   CONTRÔLES
   ========================= */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor=.06;
controls.enablePan = false;
controls.minDistance = WORLD.planetRadius*1.05;
controls.maxDistance = WORLD.planetRadius*4.5;

/* =========================
   OUTILS IMAGE
   ========================= */
function lin(c){c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
function dist2(a,b){const dr=lin(a[0])-lin(b[0]);const dg=lin(a[1])-lin(b[1]);const db=lin(a[2])-lin(b[2]);return dr*dr+dg*dg+db*db;}
async function loadImage(file){return new Promise((res,rej)=>{const url=URL.createObjectURL(file);const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=url;});}

function getEdgeBg(data,W,H){
  const m=Math.floor(Math.min(W,H)*.04), skip=Math.floor(H*.18);
  const regs=[{x:0,y:0,w:W,h:m},{x:0,y:m,w:m,h:H-m-skip},{x:W-m,y:m,w:m,h:H-m-skip},{x:0,y:H-m-skip,w:W,h:m}];
  let r=0,g=0,b=0,n=0;
  for(const t of regs){for(let y=t.y;y<t.y+t.h;y++){for(let x=t.x;x<t.x+t.w;x++){const i=(y*W+x)*4;r+=data[i];g+=data[i+1];b+=data[i+2];n++;}}}
  return [r/n,g/n,b/n];
}

function kmeans(colors, K=3, it=8){
  const cents=[]; for(let k=0;k<K;k++){const c=colors[Math.floor(colors.length*(k+0.5)/(K+0.5))]; cents.push(c.slice());}
  const assign=new Array(colors.length).fill(0);
  for(let t=0;t<it;t++){
    for(let i=0;i<colors.length;i++){let best=0,bd=1e9;for(let k=0;k<K;k++){const d=dist2(colors[i],cents[k]); if(d<bd){bd=d; best=k;}} assign[i]=best;}
    const acc=Array.from({length:K},()=>[0,0,0,0]);
    for(let i=0;i<colors.length;i++){const k=assign[i],c=colors[i];acc[k][0]+=c[0];acc[k][1]+=c[1];acc[k][2]+=c[2];acc[k][3]++;}
    for(let k=0;k<K;k++){if(acc[k][3]>0){cents[k][0]=acc[k][0]/acc[k][3];cents[k][1]=acc[k][1]/acc[k][3];cents[k][2]=acc[k][2]/acc[k][3];}}
  }
  return { centers:cents, assign };
}

function estimateGrid(imgData, W, H, rect, range=[14,64]){
  const {x,y,w,h}=rect;
  const get=(ix,iy)=>{const i=((y+iy)*W+(x+ix))*4;return [imgData[i],imgData[i+1],imgData[i+2]];};
  function changes(len, sample){
    const arr=[]; for(let i=0;i<len;i++){ let prev=sample(i,0), c=0; for(let j=1;j<len;j++){const v=sample(i,j); if(dist2(v,prev)>0.01){c++; prev=v;} } arr.push(c); }
    const s=[...arr].sort((a,b)=>a-b); return s[Math.floor(s.length/2)];
  }
  const cols=changes(w, (i,j)=>get(i, Math.floor(j*h/(w||1))%h));
  const rows=changes(h, (i,j)=>get(Math.floor(j*w/(h||1))%w, i));
  function clamp(n,len){ let g=Math.max(range[0], Math.min(range[1], n||Math.round(len/14))); if(g%2!==0) g++; return g; }
  return { cols:clamp(cols,w), rows:clamp(rows,h) };
}

/* Morphologie ouverture+fermeture */
function dilate(bin){
  const r=bin.length, c=bin[0].length, out=bin.map(row=>row.slice());
  const inside=(y,x)=> y>=0 && y<r && x>=0 && x<c;
  for(let y=0;y<r;y++) for(let x=0;x<c;x++) if(bin[y][x]){
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){const ny=y+dy,nx=x+dx;if(inside(ny,nx)) out[ny][nx]=true;}
  }
  return out;
}
function erode(bin){
  const r=bin.length, c=bin[0].length, out=bin.map(row=>row.slice());
  const inside=(y,x)=> y>=0 && y<r && x>=0 && x<c;
  for(let y=0;y<r;y++) for(let x=0;x<c;x++){
    let ok=true;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      const ny=y+dy,nx=x+dx; if(!inside(ny,nx)||!bin[ny][nx]) { ok=false; break; }
    }
    out[y][x]=ok;
  }
  return out;
}
const openBinary = bin => dilate(erode(bin));
const closeBinary = bin => erode(dilate(bin));

/* Composantes connexes: garder les plus significatives */
function filterLargestComponents(bin){
  const r=bin.length, c=bin[0].length;
  const vis=Array.from({length:r},()=>Array(c).fill(false));
  const comp=[];
  const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

  for(let y=0;y<r;y++) for(let x=0;x<c;x++){
    if(!bin[y][x] || vis[y][x]) continue;
    const q=[[y,x]]; vis[y][x]=true; let area=0, minY=y, maxY=y, minX=x, maxX=x;
    while(q.length){
      const [cy,cx]=q.pop(); area++;
      if(cy<minY)minY=cy; if(cy>maxY)maxY=cy; if(cx<minX)minX=cx; if(cx>maxX)maxX=cx;
      for(const [dy,dx] of dirs){
        const ny=cy+dy, nx=cx+dx;
        if(ny>=0&&ny<r&&nx>=0&&nx<c && bin[ny][nx] && !vis[ny][nx]){ vis[ny][nx]=true; q.push([ny,nx]); }
      }
    }
    comp.push({area, bbox:{minY,maxY,minX,maxX}});
  }

  if(!comp.length) return bin;

  comp.sort((a,b)=>b.area-a.area);
  const keep = [];
  const largest = comp[0].area;
  let cum = 0;
  for(const cc of comp){
    if(cc.area >= Math.max(6, largest*0.06)){
      keep.push(cc);
      cum += cc.area;
      if(cum > largest*1.35) break;
    }
  }

  const out = bin.map(row=>row.map(()=>false));
  for(const cc of keep){
    for(let y=cc.bbox.minY; y<=cc.bbox.maxY; y++){
      for(let x=cc.bbox.minX; x<=cc.bbox.maxX; x++){
        if(bin[y][x]) out[y][x]=true;
      }
    }
  }
  return out;
}

/* Quantification couleurs & downsample */
function quantizeColors(pixels, tol=0.004){
  const rows=pixels.length, cols=pixels[0].length, palette=[];
  function match(c){ for(const p of palette){ if(((p.r-c.r)**2+(p.g-c.g)**2+(p.b-c.b)**2) < tol) return p; } return null; }
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
    const c=pixels[y][x]; if(!c) continue; const m=match(c); if(m) pixels[y][x]=m; else palette.push(c);
  }
  return pixels;
}
function downsamplePixels(pixels, factor){
  if(factor<=1) return pixels;
  const rows=pixels.length, cols=pixels[0].length;
  const R=Math.ceil(rows/factor), C=Math.ceil(cols/factor);
  const out=Array.from({length:R},()=>Array(C).fill(null));
  for(let gy=0;gy<R;gy++){
    for(let gx=0;gx<C;gx++){
      let Rsum=0,Gsum=0,Bsum=0,N=0;
      for(let y=gy*factor; y<Math.min(rows, (gy+1)*factor); y++){
        for(let x=gx*factor; x<Math.min(cols, (gx+1)*factor); x++){
          const c=pixels[y][x]; if(!c) continue;
          Rsum+=c.r; Gsum+=c.g; Bsum+=c.b; N++;
        }
      }
      if(N>0) out[gy][gx]={r:Rsum/N,g:Gsum/N,b:Bsum/N};
    }
  }
  return out;
}

/* conversion image -> grille */
async function imageToPixelMatrix(file){
  const img=await loadImage(file);
  const maxSide=1000, scl=Math.min(1, maxSide/Math.max(img.naturalWidth,img.naturalHeight));
  const W=Math.round(img.naturalWidth*scl), H=Math.round(img.naturalHeight*scl);
  const cnv=document.createElement('canvas'); cnv.width=W; cnv.height=H;
  const ctx=cnv.getContext('2d', { willReadFrequently:true });
  ctx.drawImage(img,0,0,W,H);
  const { data } = ctx.getImageData(0,0,W,H);

  const bgEdge=getEdgeBg(data,W,H);
  const TH=0.012; let minX=W,minY=H,maxX=0,maxY=0;
  const skipB=Math.floor(H*.18), m=Math.floor(Math.min(W,H)*.04);
  for(let y=m;y<H-skipB;y++) for(let x=m;x<W-m;x++){
    const i=(y*W+x)*4; const px=[data[i],data[i+1],data[i+2]];
    if(dist2(px,bgEdge)>TH){ if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y; }
  }
  if(minX>=maxX||minY>=maxY) throw new Error("Invader non détecté.");
  const rect={x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};

  const cols=[];
  for(let y=0;y<rect.h;y+=2) for(let x=0;x<rect.w;x+=2){
    const i=((rect.y+y)*W+(rect.x+x))*4; cols.push([data[i],data[i+1],data[i+2]]);
  }
  const km=kmeans(cols,3,8);
  let bgk=0,bd=1e9; for(let k=0;k<3;k++){const d=dist2(km.centers[k], bgEdge); if(d<bd){bd=d; bgk=k;}}

  const grid = estimateGrid(data, W, H, rect, [14,72]);
  const cellW=rect.w/grid.cols, cellH=rect.h/grid.rows;

  const bin = Array.from({length:grid.rows},()=>Array(grid.cols).fill(false));
  const colsRGB = Array.from({length:grid.rows},()=>Array(grid.cols).fill(null));
  const keepTH=0.008;
  for(let gy=0;gy<grid.rows;gy++){
    for(let gx=0;gx<grid.cols;gx++){
      const x0=Math.floor(rect.x+gx*cellW), y0=Math.floor(rect.y+gy*cellH);
      const x1=Math.min(W, Math.floor(rect.x+(gx+1)*cellW));
      const y1=Math.min(H, Math.floor(rect.y+(gy+1)*cellH));
      let r=0,g=0,b=0,n=0;
      for(let y=y0;y<y1;y+=1) for(let x=x0;x<x1;x+=1){
        const i=(y*W+x)*4; r+=data[i]; g+=data[i+1]; b+=data[i+2]; n++;
      }
      const c=[r/n,g/n,b/n];
      if(dist2(c, km.centers[bgk])>keepTH){
        bin[gy][gx]=true;
        colsRGB[gy][gx]={r:c[0]/255,g:c[1]/255,b:c[2]/255};
      }
    }
  }

  const closed = closeBinary(openBinary(bin));
  const filtered = filterLargestComponents(closed);

  let minY=filtered.length, minX=filtered[0].length, maxY=0, maxX=0, any=false;
  for(let y=0;y<filtered.length;y++) for(let x=0;x<filtered[0].length;x++) if(filtered[y][x]){
    any=true; if(y<minY)minY=y; if(y>maxY)maxY=y; if(x<minX)minX=x; if(x>maxX)maxX=x;
  }
  if(!any) throw new Error("Silhouette trop faible. Essaie une photo plus frontale.");
  const croppedH=maxY-minY+1, croppedW=maxX-minX+1;

  const pixels=Array.from({length:croppedH},()=>Array(croppedW).fill(null));
  for(let y=0;y<croppedH;y++) for(let x=0;x<croppedW;x++){
    const Y=y+minY, X=x+minX;
    if(filtered[Y][X]){
      if(colsRGB[Y][X]) pixels[y][x]=colsRGB[Y][X];
      else {
        let R=0,G=0,B=0,N=0;
        for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
          const ny=Y+dy, nx=X+dx;
          if(ny>=0&&ny<grid.rows&&nx>=0&&nx<grid.cols&&colsRGB[ny][nx]){ R+=colsRGB[ny][nx].r; G+=colsRGB[ny][nx].g; B+=colsRGB[ny][nx].b; N++; }
        }
        if(N>0) pixels[y][x]={r:R/N,g:G/N,b:B/N};
      }
    }
  }

  quantizeColors(pixels, 0.004);
  let voxelCount = 0;
  for(let y=0;y<pixels.length;y++) for(let x=0;x<pixels[0].length;x++){ if(pixels[y][x]) voxelCount++; }
  if(voxelCount > WORLD.maxVoxelsPerInvader){
    const factor = Math.ceil(Math.sqrt(voxelCount / WORLD.maxVoxelsPerInvader));
    return downsamplePixels(pixels, factor);
  }
  return pixels;
}

/* =========================
   INVADER 3D (Instanced)
   ========================= */
function buildInvaderMesh(pixelGrid){
  const rows=pixelGrid.length, cols=pixelGrid[0].length;
  const size=WORLD.invaderScale, gap=size*WORLD.spacingRatio, depth=WORLD.invaderDepth;

  const geom=new THREE.BoxGeometry(size-gap, size-gap, depth);
  const colAttr=new Float32Array(geom.attributes.position.count*3);
  for(let i=0;i<geom.attributes.position.count;i++){
    const z=geom.attributes.position.getZ(i); const shade=z<0?0.76:1.0;
    colAttr[3*i]=colAttr[3*i+1]=colAttr[3*i+2]=shade;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colAttr,3));
  const mat=new THREE.MeshStandardMaterial({ roughness:0.5, metalness:0.04, vertexColors:true, color:0xffffff });

  const mesh=new THREE.InstancedMesh(geom, mat, rows*cols);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const dummy=new THREE.Object3D();
  const w=cols*size,h=rows*size;
  const x0=-w/2+size/2, y0=-h/2+size/2;
  let idx=0;
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
    const c=pixelGrid[y][x]; if(!c) continue;
    dummy.position.set(x0 + x*size, y0 + (rows-1-y)*size, 0);
    dummy.rotation.set(0,0,0); dummy.updateMatrix();
    mesh.setMatrixAt(idx, dummy.matrix);
    mesh.setColorAt(idx, new THREE.Color(c.r,c.g,c.b)); idx++;
  }
  mesh.count=idx; if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true;

  return { mesh, width:w, height:h, depth };
}

/* =========================
   AGENT (déplacement tangent)
   ========================= */
function alignZAxisTo(obj, normal){
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), normal.clone().normalize());
  obj.quaternion.copy(q);
}

function createWanderer(invader){
  const g=new THREE.Group(); g.add(invader.mesh);

  // scale global (petit par défaut)
  const targetWorldSize = WORLD.invaderMaxWorldSize * (WORLD.planetRadius*2);
  const maxDim = Math.max(invader.width, invader.height);
  const scale = targetWorldSize / maxDim;
  g.scale.setScalar(scale);

  const normal=new THREE.Vector3().randomDirection();
  const hover = (invader.depth*scale)/2 + WORLD.hoverMargin;
  const radiusOffset = WORLD.planetRadius + hover;
  g.position.copy(normal).multiplyScalar(radiusOffset);
  alignZAxisTo(g, normal);
  g.rotateOnAxis(new THREE.Vector3(0,0,1), Math.random()*Math.PI*2);

  const axis=new THREE.Vector3().randomDirection();
  const baseSpeed = 0.08 + Math.random()*0.06; // ~3x plus lent qu'avant
  const rot=new THREE.Quaternion();

  return {
    object: g, normal, axis, radiusOffset, baseSpeed,
    update(dt, peers, speedFactor){
      const push=new THREE.Vector3();
      for(const p of peers){ if(p===this) continue;
        const d=this.object.position.clone().sub(p.object.position);
        const L=d.length();
        if(L<WORLD.repelRadius) push.add(d.multiplyScalar((WORLD.repelRadius-L)/WORLD.repelRadius));
      }
      if(push.lengthSq()>0){ this.axis.add(push.normalize().multiplyScalar(0.02)).normalize(); }

      rot.setFromAxisAngle(this.axis, this.baseSpeed * speedFactor * dt);
      this.normal.applyQuaternion(rot).normalize();

      this.object.position.copy(this.normal).multiplyScalar(this.radiusOffset);
      alignZAxisTo(this.object, this.normal);

      const t=performance.now()*0.001;
      this.object.position.addScaledVector(this.normal, Math.sin(t*1.6 + this.normal.x*5.1)*0.003);
    }
  };
}

/* =========================
   UI & IMPORT (iOS-safe)
   ========================= */
const addBtn=document.getElementById('addBtn');
const fileInput=document.getElementById('file');
const countLbl=document.getElementById('count');
const speedSlider=document.getElementById('speed');

let agents=[];
let globalSpeedFactor = Number(speedSlider.value)/100; // 0.33 par défaut

function updateCount(){ const n=agents.length; countLbl.textContent = n + (n>1?' invaders':' invader'); }
speedSlider.addEventListener('input', ()=>{ globalSpeedFactor = Number(speedSlider.value)/100; });

// iOS : utiliser un handler "tap" direct
const openPicker = () => { try { fileInput.click(); } catch(e) { /* iOS 13- : accept */ } };
addBtn.addEventListener('click', openPicker, { passive: true });
addBtn.addEventListener('touchend', openPicker, { passive: true });

fileInput.addEventListener('change', async e=>{
  if(!e.target.files || e.target.files.length===0) return;
  const files = Array.from(e.target.files);
  for (const f of files) {
    try {
      const px=await imageToPixelMatrix(f);
      const built=buildInvaderMesh(px);
      const agent=createWanderer(built);
      scene.add(agent.object);
      agents.push(agent); updateCount();
    } catch(err){ alert(err.message||String(err)); }
  }
  fileInput.value='';
});

/* =========================
   BOUCLE
   ========================= */
const clock=new THREE.Clock();
function loop(){
  const dt=clock.getDelta();
  agents.forEach(a=>a.update(dt, agents, globalSpeedFactor));
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();

window.addEventListener('resize', ()=>{
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
});