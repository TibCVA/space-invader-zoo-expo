import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ---------- Config ---------- */
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const WORLD = {
  planetRadius: 3.2,
  invaderScale: 0.06,
  invaderDepth: 0.05,
  spacingRatio: 0.085,
  maxInstances: 3000,
  repelRadius: 0.42,
  repelStrength: 1.0,
  focusSeconds: 3
};

/* ---------- Renderer/Scene/Camera ---------- */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 150);
camera.position.set(0, WORLD.planetRadius*0.75, WORLD.planetRadius*2.1);

/* Lumières & planète avec “atmosphère” très légère */
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(-4,6,8); scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfdfff, 0x2a1e1a, 0.7));

const planetGeo = new THREE.SphereGeometry(WORLD.planetRadius, 128, 96);
const planetMat = new THREE.MeshStandardMaterial({
  color: new THREE.Color('#1F3C48').convertSRGBToLinear(),
  roughness: 0.9, metalness: 0.03,
});
const planet = new THREE.Mesh(planetGeo, planetMat);
scene.add(planet);

// relief
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

// halo atmosphérique (mesh inversé + additive)
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
    void main(){
      float a = pow(vDot, 4.0);
      gl_FragColor = vec4(0.3, 0.6, 1.0, a*0.25);
    }`;
  const m = new THREE.ShaderMaterial({
    vertexShader: vshader, fragmentShader: fshader,
    blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true, depthWrite: false
  });
  scene.add(new THREE.Mesh(g, m));
})();

/* Étoiles */
(() => {
  const N=3800, a=new Float32Array(3*N);
  for(let i=0;i<N;i++){const r=70+Math.random()*70,t=Math.acos(Math.random()*2-1),p=Math.random()*Math.PI*2;
    a[3*i]=r*Math.sin(t)*Math.cos(p); a[3*i+1]=r*Math.cos(t); a[3*i+2]=r*Math.sin(t)*Math.sin(p);}
  const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a,3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({size:.6})));
})();

/* Contrôles */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor=.06;
controls.enablePan = false;
controls.minDistance = WORLD.planetRadius*1.05;
controls.maxDistance = WORLD.planetRadius*4.5;

/* ---------- Outils image ---------- */
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
function kmeans(colors, K=3, it=7){
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
function estimateGrid(imgData, W, H, rect, bgCol, range=[14,64]){
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

/* Morphologie (fermeture 1 itération) sur matrice binaire */
function closeBinary(mat){
  const r=mat.length, c=mat[0].length;
  const out=mat.map(row=>row.slice());
  const inside=(y,x)=> y>=0 && y<r && x>=0 && x<c;
  // dilation
  const dil=mat.map(row=>row.map(v=>v));
  for(let y=0;y<r;y++) for(let x=0;x<c;x++) if(mat[y][x]){
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      const ny=y+dy,nx=x+dx; if(inside(ny,nx)) dil[ny][nx]=true;
    }
  }
  // érosion
  for(let y=0;y<r;y++) for(let x=0;x<c;x++){
    let ok=true;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      const ny=y+dy,nx=x+dx; if(!inside(ny,nx)||!dil[ny][nx]) ok=false;
    }
    out[y][x]=ok;
  }
  return out;
}

/* Quantification couleurs adaptative (regroupe les teintes très proches) */
function quantizeColors(pixels, tol=0.006){
  const rows=pixels.length, cols=pixels[0].length;
  // collecte couleurs existantes
  const palette=[];
  function exists(c){
    for(const p of palette){ if(((p.r-c.r)**2+(p.g-c.g)**2+(p.b-c.b)**2) < tol){ return p; } }
    return null;
  }
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
    const c=pixels[y][x]; if(!c) continue;
    const e=exists(c); if(e){ pixels[y][x]=e; } else { palette.push(c); }
  }
  return pixels;
}

async function imageToPixelMatrix(file){
  const img=await loadImage(file);
  const maxSide=900, scl=Math.min(1, maxSide/Math.max(img.naturalWidth,img.naturalHeight));
  const W=Math.round(img.naturalWidth*scl), H=Math.round(img.naturalHeight*scl);
  const cnv=document.createElement('canvas'); cnv.width=W; cnv.height=H;
  const ctx=cnv.getContext('2d', { willReadFrequently:true });
  ctx.drawImage(img,0,0,W,H);
  const { data } = ctx.getImageData(0,0,W,H);

  const bgEdge=getEdgeBg(data,W,H);
  // BBox rapide
  const TH=0.012; let minX=W,minY=H,maxX=0,maxY=0;
  const skipB=Math.floor(H*.18), m=Math.floor(Math.min(W,H)*.04);
  for(let y=m;y<H-skipB;y++) for(let x=m;x<W-m;x++){
    const i=(y*W+x)*4; const px=[data[i],data[i+1],data[i+2]];
    if(dist2(px,bgEdge)>TH){ if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y; }
  }
  if(minX>=maxX||minY>=maxY) throw new Error("Invader non détecté.");
  const rect={x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};

  // Échantillons pour K-means
  const cols=[];
  for(let y=0;y<rect.h;y+=2) for(let x=0;x<rect.w;x+=2){
    const i=((rect.y+y)*W+(rect.x+x))*4; cols.push([data[i],data[i+1],data[i+2]]);
  }
  const km=kmeans(cols,3,8);
  // cluster fond = plus proche des bords
  let bgk=0,bd=1e9;
  for(let k=0;k<3;k++){const d=dist2(km.centers[k], bgEdge); if(d<bd){bd=d; bgk=k;}}

  const grid = estimateGrid(data, W, H, rect, km.centers[bgk], [14,72]);
  const cellW=rect.w/grid.cols, cellH=rect.h/grid.rows;

  // matrice binaire + moyenne couleur par cellule
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
  // fermeture binaire
  const closed = closeBinary(bin);
  // applique fermeture à la palette couleur (remplit trous avec voisins)
  const pixels=Array.from({length:grid.rows},()=>Array(grid.cols).fill(null));
  for(let y=0;y<grid.rows;y++) for(let x=0;x<grid.cols;x++){
    if(closed[y][x]){
      if(colsRGB[y][x]) pixels[y][x]=colsRGB[y][x];
      else {
        // couleur moyenne des voisins
        let R=0,G=0,B=0,N=0;
        for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
          const ny=y+dy,nx=x+dx;
          if(ny>=0&&ny<grid.rows&&nx>=0&&nx<grid.cols&&colsRGB[ny][nx]){
            R+=colsRGB[ny][nx].r; G+=colsRGB[ny][nx].g; B+=colsRGB[ny][nx].b; N++;
          }
        }
        if(N>0) pixels[y][x]={r:R/N,g:G/N,b:B/N};
      }
    }
  }
  // quantification adaptative des couleurs (cohérence mosaïque)
  return quantizeColors(pixels, 0.004);
}

/* ---------- Construction & Agents ---------- */
function buildInvaderMesh(pixelGrid){
  const rows=pixelGrid.length, cols=pixelGrid[0].length;
  const size=WORLD.invaderScale, gap=size*WORLD.spacingRatio, depth=WORLD.invaderDepth;

  const geom=new THREE.BoxGeometry(size-gap, size-gap, depth);
  // AO simple via vertex colors
  const colAttr=new Float32Array(geom.attributes.position.count*3);
  for(let i=0;i<geom.attributes.position.count;i++){
    const z=geom.attributes.position.getZ(i); const shade=z<0?0.76:1.0;
    colAttr[3*i]=colAttr[3*i+1]=colAttr[3*i+2]=shade;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colAttr,3));
  const mat=new THREE.MeshStandardMaterial({ roughness:0.5, metalness:0.04, vertexColors:true, color:0xffffff });

  const max=Math.min(WORLD.maxInstances, rows*cols);
  const mesh=new THREE.InstancedMesh(geom, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const dummy=new THREE.Object3D();
  const w=cols*size,h=rows*size;
  const x0=-w/2+size/2, y0=-h/2+size/2;
  let idx=0;
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
    const c=pixelGrid[y][x]; if(!c) continue; if(idx>=max) break;
    dummy.position.set(x0 + x*size, y0 + (rows-1-y)*size, 0);
    dummy.rotation.set(0,0,0); dummy.updateMatrix();
    mesh.setMatrixAt(idx, dummy.matrix);
    mesh.setColorAt(idx, new THREE.Color(c.r,c.g,c.b)); idx++;
  }
  mesh.count=idx; if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
  return mesh;
}

function orient(obj, normal){
  const up=normal.clone();
  const tangent=new THREE.Vector3(0,1,0).cross(up);
  if(tangent.lengthSq()<1e-4) tangent.set(1,0,0).cross(up);
  const look=tangent.normalize().add(obj.position).normalize();
  obj.up.copy(up);
  obj.lookAt(look.multiplyScalar(obj.position.length()));
}

function createWanderer(mesh){
  const g=new THREE.Group(); g.add(mesh);
  const normal=new THREE.Vector3().randomDirection();
  const offset=WORLD.planetRadius+0.2;
  g.position.copy(normal).multiplyScalar(offset); orient(g, normal);

  const axis=new THREE.Vector3().randomDirection();
  let speed=0.2+Math.random()*0.2;
  const rot=new THREE.Quaternion();

  return {
    object: g, normal, axis,
    update(dt, peers){
      // répulsion douce
      const push=new THREE.Vector3();
      for(const p of peers){ if(p===this) continue;
        const d = this.object.position.clone().sub(p.object.position);
        const L = d.length(); if(L<WORLD.repelRadius){ push.add(d.multiplyScalar((WORLD.repelRadius-L)/WORLD.repelRadius)); }
      }
      if(push.lengthSq()>0){ this.axis.add(push.normalize().multiplyScalar(0.02)).normalize(); }
      rot.setFromAxisAngle(this.axis, speed*dt);
      this.normal.applyQuaternion(rot).normalize();
      this.object.position.copy(this.normal).multiplyScalar(offset);
      orient(this.object, this.normal);
      const t=performance.now()*0.001;
      mesh.position.z=Math.sin(t*2.3 + this.normal.x*5.9)*0.03;
    }
  };
}

/* ---------- UI / Interaction ---------- */
const addBtn=document.getElementById('addBtn');
const fileInput=document.getElementById('file');
const countLbl=document.getElementById('count');
let agents=[];

function updateCount(){const n=agents.length; countLbl.textContent = n + (n>1?' invaders':' invader');}
addBtn.addEventListener('click',()=>fileInput.click());
fileInput.addEventListener('change', async e=>{
  if(!e.target.files || !e.target.files[0]) return;
  try{
    const px=await imageToPixelMatrix(e.target.files[0]);
    const mesh=buildInvaderMesh(px);
    const agent=createWanderer(mesh);
    scene.add(agent.object);
    agents.push(agent); updateCount();
    fileInput.value='';
  }catch(err){ alert(err.message||String(err)); }
});

/* Double‑tap : focus invader le plus proche du point touché */
let lastTap=0, focusTimer=null;
canvas.addEventListener('touchend', (ev)=>{
  const t=performance.now();
  if(t-lastTap<320){ // double-tap
    if(ev.changedTouches && ev.changedTouches[0]){
      const rect=canvas.getBoundingClientRect();
      const x=( (ev.changedTouches[0].clientX - rect.left)/rect.width )*2-1;
      const y=-( (ev.changedTouches[0].clientY - rect.top)/rect.height )*2+1;
      const ray=new THREE.Raycaster(); ray.setFromCamera({x,y}, camera);
      const targets = agents.map(a=>a.object);
      const intersects = ray.intersectObjects(targets, true).sort((a,b)=>a.distance-b.distance);
      const obj = intersects.length ? intersects[0].object : null;
      let chosen = null;
      if(obj){
        chosen = agents.find(a => obj.parent === a.object || obj === a.object || a.object.children.includes(obj));
      } else if(agents.length){
        // sinon : recentre sur le 1er invader
        chosen = agents[0];
      }
      if(chosen){
        const dest = chosen.object.position.clone().normalize().multiplyScalar(WORLD.planetRadius*1.6);
        controls.target.set(0,0,0);
        camera.position.lerp(dest, 0.85);
        if(focusTimer){ clearTimeout(focusTimer); }
        focusTimer = setTimeout(()=>{}, WORLD.focusSeconds*1000);
      }
    }
  }
  lastTap=t;
});

/* ---------- Loop ---------- */
const clock=new THREE.Clock();
function loop(){
  const dt=clock.getDelta();
  agents.forEach(a=>a.update(dt, agents));
  // léger gradient “jour/nuit” selon angle par rapport à la lumière
  const n=new THREE.Vector3().copy(planet.position).normalize(); // (0,0,0) → centre : on simule
  const lightDir=sun.position.clone().normalize();
  const k=0.5 + 0.5*Math.max(0, lightDir.dot(new THREE.Vector3(0,0,1)));
  planet.material.color.setRGB(0.15+0.15*k, 0.26+0.1*k, 0.32+0.13*k);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();

addEventListener('resize', ()=>{
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
});