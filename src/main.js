// Space Invader Zoo — EXPO (iOS: pas de dropzone, import via boutons)
import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.158.0/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'https://unpkg.com/three@0.158.0/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'https://unpkg.com/three@0.158.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.158.0/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'https://unpkg.com/three@0.158.0/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'https://unpkg.com/three@0.158.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'https://unpkg.com/three@0.158.0/examples/jsm/shaders/FXAAShader.js';
import { SMAAPass } from 'https://unpkg.com/three@0.158.0/examples/jsm/postprocessing/SMAAPass.js';
import { SSAOPass } from 'https://unpkg.com/three@0.158.0/examples/jsm/postprocessing/SSAOPass.js';

import { createPlanetEXPO } from './planetExpo.js';
import { buildInvaderFromImageEXPO } from './invaderExpo.js';
import { AudioUI } from './sound.js';

// ---------------- Renderer / Scene
const canvas = document.querySelector('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

// Camera / Controls
const camera = new THREE.PerspectiveCamera(56, innerWidth/innerHeight, 0.1, 2000);
camera.position.set(0, 7.6, 13);
scene.add(camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 6;
controls.maxDistance = 32;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.45;

// Lights
const hemi = new THREE.HemisphereLight(0xbfd7ff, 0x202638, 0.65);
scene.add(hemi);
const dirLight = new THREE.DirectionalLight(0xffffff, 1.05);
dirLight.position.set(8,10,6);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048,2048);
dirLight.shadow.bias = -0.00035;
scene.add(dirLight);

// Sky gradient
const skyGeo = new THREE.SphereGeometry(600, 32, 32);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { topColor:{value:new THREE.Color(0x0a1128)}, bottomColor:{value:new THREE.Color(0x01040b)} },
  vertexShader: `varying vec3 vPos; void main(){vPos=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(vPos,1.);} `,
  fragmentShader:`varying vec3 vPos; uniform vec3 topColor; uniform vec3 bottomColor;
    void main(){ float h = normalize(vPos).y*0.5+0.5; vec3 col = mix(bottomColor, topColor, pow(h,1.8)); gl_FragColor=vec4(col,1.); }`
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

// Stars
(function addStars(){
  const N=8000, pos=new Float32Array(N*3);
  for (let i=0;i<N;i++){ const r=270+Math.random()*150, t=Math.acos(2*Math.random()-1), p=Math.random()*Math.PI*2;
    pos[i*3+0]=r*Math.sin(t)*Math.cos(p); pos[i*3+1]=r*Math.cos(t); pos[i*3+2]=r*Math.sin(t)*Math.sin(p); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  const m=new THREE.PointsMaterial({ size:0.72, sizeAttenuation:true, color:0xbfd6ff, transparent:true, opacity:0.82, depthWrite:false });
  scene.add(new THREE.Points(g,m));
})();

// Planet
const planetRadius = 4.0;
const planet = createPlanetEXPO(planetRadius, THREE);
scene.add(planet.group);

// ---------------- Post-processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
let aaPass;
try { aaPass = new SMAAPass(innerWidth, innerHeight); composer.addPass(aaPass); }
catch(e) { const fxaa = new ShaderPass(FXAAShader); fxaa.material.uniforms['resolution'].value.set(1/innerWidth, 1/innerHeight); composer.addPass(fxaa); }
const ssao = new SSAOPass(scene, camera, innerWidth, innerHeight);
ssao.kernelRadius = 8; ssao.minDistance = 0.0025; ssao.maxDistance = 0.12;
composer.addPass(ssao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.42, 0.9, 0.8);
composer.addPass(bloom);

// Resize
addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  if (aaPass && aaPass.setSize) aaPass.setSize(innerWidth, innerHeight);
  ssao.setSize(innerWidth, innerHeight);
});

// ---------------- UI
const exitExpoBtn = document.querySelector('#exit-expo');
const fileInput   = document.querySelector('#file');
const btnSamples  = document.querySelector('#btn-samples');
const btnShot     = document.querySelector('#btn-shot');
const btnReset    = document.querySelector('#btn-reset');
const btnGear     = document.querySelector('#btn-gear');
const btnExpo     = document.querySelector('#btn-expo');
const panel       = document.querySelector('#panel');
const toast       = document.querySelector('#toast');

const thrRange = document.querySelector('#thr');
const bevelRange = document.querySelector('#bevel');
const gapRange = document.querySelector('#gap');
const depthRange = document.querySelector('#depth');
const timeRange = document.querySelector('#time');
const terrainRange = document.querySelector('#terrain');
const maxNRange = document.querySelector('#maxN');
const autoChk = document.querySelector('#auto');

const expoSpeed = document.querySelector('#expoSpeed');
const expoZoom  = document.querySelector('#expoZoom');
const expoPause = document.querySelector('#expoPause');

const thrVal = document.querySelector('#thrVal');
const bevelVal = document.querySelector('#bevelVal');
const gapVal = document.querySelector('#gapVal');
const depthVal = document.querySelector('#depthVal');
const timeVal = document.querySelector('#timeVal');
const terrainVal = document.querySelector('#terrainVal');
const maxNVal = document.querySelector('#maxNVal');
const expoSpeedVal = document.querySelector('#expoSpeedVal');
const expoZoomVal  = document.querySelector('#expoZoomVal');
const expoPauseVal = document.querySelector('#expoPauseVal');

function syncLabels(){
  thrVal.textContent = thrRange.value;
  bevelVal.textContent = bevelRange.value;
  gapVal.textContent = gapRange.value;
  depthVal.textContent = depthRange.value;
  timeVal.textContent = parseFloat(timeRange.value).toFixed(1)+'h';
  terrainVal.textContent = terrainRange.value;
  maxNVal.textContent = maxNRange.value;
  expoSpeedVal.textContent = expoSpeed.value;
  expoZoomVal.textContent  = expoZoom.value;
  expoPauseVal.textContent = expoPause.value;
}
[thrRange, bevelRange, gapRange, depthRange, timeRange, terrainRange, maxNRange, expoSpeed, expoZoom, expoPause]
  .forEach(e=>e.addEventListener('input', syncLabels));
syncLabels();

btnGear.addEventListener('click', ()=> panel.classList.toggle('hidden'));

// ---------------- Import (mobile‑first)
function loadImageFromURL(url){
  return new Promise((resolve, reject)=>{ const img=new Image(); img.crossOrigin='anonymous'; img.onload=()=>resolve(img); img.onerror=reject; img.src=url; });
}
function fileToDataURL(file){
  return new Promise((resolve, reject)=>{ const fr=new FileReader(); fr.onload=()=>resolve(fr.result); fr.onerror=reject; fr.readAsDataURL(file); });
}
async function handleFile(file){ const dataURL=await fileToDataURL(file); const img=await loadImageFromURL(dataURL); await addInvader(img, dataURL); }

fileInput.addEventListener('change', async ()=>{
  for (const f of fileInput.files) await handleFile(f);
  fileInput.value = '';
});

btnSamples.addEventListener('click', async ()=>{
  const samples = ['assets/samples/mars_56.jpg','assets/samples/mars_36.jpg','assets/samples/caz_32.jpg'];
  const url = samples[Math.floor(Math.random()*samples.length)];
  const img = await loadImageFromURL(url);
  await addInvader(img, url);
});

btnShot.addEventListener('click', ()=>{
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a'); a.href = url; a.download = 'space-invader-zoo-expo.png'; a.click();
});
btnReset.addEventListener('click', ()=>{
  for (const c of invadersGroup.children) c.removeFromParent();
  invaders.length = 0; saveState();
});

// ---------------- Mode EXPO (UI visible par défaut)
let expo = false;
function toggleExpo(on){
  expo = on;
  document.querySelector('#ui').classList.toggle('hidden', on);
  exitExpoBtn.classList.toggle('hidden', !on);
  controls.autoRotate = !on; // en EXPO on pilote la caméra nous-mêmes
  if (on) audio.note('start'); else audio.note('stop');
}
btnExpo.addEventListener('click', ()=> toggleExpo(true));
exitExpoBtn.addEventListener('click', ()=> toggleExpo(false));
addEventListener('keydown', (e)=>{ if (e.key.toLowerCase()==='e') toggleExpo(!expo); });
toggleExpo(false); // état initial garanti

// Son
const audio = new AudioUI(document.body, toast);

// ---------------- Planet inputs
timeRange.addEventListener('input', ()=>{ planet.setTime(parseFloat(timeRange.value)/24); updateLights(); });
terrainRange.addEventListener('input', ()=>{ planet.setRelief(parseFloat(terrainRange.value)); });
function updateLights(){ dirLight.position.copy(planet.sunDir().multiplyScalar(12)); dirLight.intensity = THREE.MathUtils.lerp(0.2, 1.3, planet.sunElev()); }
updateLights();

// ---------------- Invaders
const invadersGroup = new THREE.Group(); scene.add(invadersGroup);
const invaders = []; // { node, dir, speed, bob, dataURL }

function currentParams(){
  return {
    extraThreshold: parseInt(thrRange.value, 10),
    bevel: parseFloat(bevelRange.value),
    gap: parseFloat(gapRange.value),
    depth: parseFloat(depthRange.value),
    auto: autoChk.checked
  };
}

async function addInvader(img, dataURL=null){
  const node = await buildInvaderFromImageEXPO(img, currentParams(), THREE);
  const box = new THREE.Box3().setFromObject(node);
  const size = new THREE.Vector3(); box.getSize(size);
  node.scale.setScalar(1.9/Math.max(size.x, size.y, size.z));

  const holder = new THREE.Group(); holder.add(node);
  invadersGroup.add(holder);

  const dir = new THREE.Vector3().randomDirection();
  const r = planet.surfaceRadius(dir) + 0.34;
  holder.position.copy(dir.clone().multiplyScalar(r));
  alignToTerrain(holder, dir);

  const speed = THREE.MathUtils.lerp(0.15, 0.36, Math.random());
  const bob = Math.random()*Math.PI*2;
  invaders.push({ node: holder, dir, speed, bob, dataURL });

  audio.note('spawn');

  const maxN = parseInt(maxNRange.value, 10);
  while (invaders.length > maxN){ const it=invaders.shift(); it.node.removeFromParent(); }
  saveState();
}
function alignToTerrain(object, dir){
  const n = planet.normal(dir);
  const t = new THREE.Vector3(-n.z, 0, n.x).normalize();
  const b = new THREE.Vector3().crossVectors(n, t).normalize();
  const m = new THREE.Matrix4().makeBasis(t,b,n);
  object.quaternion.setFromRotationMatrix(m);
}

// Boids + interactions
function updateInvaders(dt){
  const sep=1.25, ali=2.4, coh=3.2;
  for (let i=0;i<invaders.length;i++){
    const a = invaders[i];
    const pos = a.node.position.clone();
    const n = pos.clone().normalize();
    const R = planet.surfaceRadius(n) + 0.34;

    const acc = new THREE.Vector3();
    let aliC=0, cohC=0;
    const avgN=new THREE.Vector3(), avgP=new THREE.Vector3();
    for (let j=0;j<invaders.length;j++) if (i!==j){
      const b = invaders[j];
      const d = pos.distanceTo(b.node.position);
      if (d<sep){
        const diff = pos.clone().sub(b.node.position).normalize();
        const tangent = diff.sub(n.clone().multiplyScalar(diff.dot(n))).normalize();
        acc.addScaledVector(tangent, 0.7*(sep-d));
        if (Math.random()<0.04) audio.note('near');
      }
      if (d<ali){ avgN.add(b.node.position.clone().normalize()); aliC++; }
      if (d<coh){ avgP.add(b.node.position); cohC++; }
    }
    if (aliC>0){
      avgN.multiplyScalar(1/aliC);
      const tang = avgN.sub(n.clone().multiplyScalar(avgN.dot(n))).normalize();
      acc.addScaledVector(tang, 0.06);
    }
    if (cohC>0){
      avgP.multiplyScalar(1/cohC);
      const to = avgP.sub(pos).normalize();
      const tang = to.sub(n.clone().multiplyScalar(to.dot(n))).normalize();
      acc.addScaledVector(tang, 0.05);
    }
    const rand = new THREE.Vector3().randomDirection();
    const randTan = rand.sub(n.clone().multiplyScalar(rand.dot(n))).normalize();
    acc.addScaledVector(randTan, 0.04);

    const grad = planet.gradient(n);
    if (grad.lengthSq() > 0.0004){
      const downhill = grad.negate().sub(n.clone().multiplyScalar(grad.negate().dot(n))).normalize();
      acc.addScaledVector(downhill, 0.06);
    }

    const heading = pos.clone().cross(n).normalize();
    const vel = heading.add(acc.multiplyScalar(dt*0.0015)).normalize();
    const axis = new THREE.Vector3().crossVectors(pos, vel).normalize();
    const ang = (a.speed*dt*0.12)/R;
    pos.applyAxisAngle(axis, ang).setLength(R);
    a.node.position.copy(pos);

    a.bob += dt*0.0027;
    a.node.position.add(n.multiplyScalar(Math.sin(a.bob)*0.06));
    alignToTerrain(a.node, a.node.position.clone().normalize());
  }
}

// Focus caméra au clic
const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2();
addEventListener('pointerdown', (e)=>{
  mouse.x=(e.clientX/innerWidth)*2-1; mouse.y=-(e.clientY/innerHeight)*2+1;
  ray.setFromCamera(mouse,camera);
  const hits = ray.intersectObjects(invadersGroup.children,true);
  if (hits.length){ const p=hits[0].object.getWorldPosition(new THREE.Vector3()); controls.target.lerp(p,0.9); audio.note('focus'); }
});

// ---------------- Persistance
const LS='sizo-expo-v3'; // bump version
function saveState(){ try{ const inv=invaders.map(i=>({dataURL:i.dataURL??null})); localStorage.setItem(LS, JSON.stringify({inv})); }catch(e){} }
async function restoreState(){ try{ const txt=localStorage.getItem(LS); if(!txt) return; const st=JSON.parse(txt); for (const it of st.inv??[]){ if(!it.dataURL) continue; const img=await loadImageFromURL(it.dataURL); await addInvader(img, it.dataURL); } }catch(e){} }

// ---------------- Expo camera autopilot
let expoTimer = 0;
function updateExpo(dt){
  if (!expo) return;
  expoTimer += dt*0.001*parseFloat(expoSpeed.value);
  const zoom = parseFloat(expoZoom.value);
  const angle = expoTimer*0.4;
  const elev = Math.sin(expoTimer*0.7)*0.3 + 0.5;
  const R = THREE.MathUtils.lerp(9, 14, zoom);
  const x = Math.cos(angle)*R, y = THREE.MathUtils.lerp(4, 8, elev), z = Math.sin(angle*1.2)*R;
  camera.position.lerp(new THREE.Vector3(x,y,z), 0.04);
  const hour = (parseFloat(timeRange.value) + dt*0.005*parseFloat(expoSpeed.value)) % 24;
  timeRange.value = hour.toFixed(1); planet.setTime(hour/24); updateLights();
  if (invaders.length){
    const idx = Math.floor((expoTimer/Math.max(0.1, parseFloat(expoPause.value))) % invaders.length);
    const target = invaders[idx].node.position;
    controls.target.lerp(target, 0.02);
  } else {
    controls.target.lerp(new THREE.Vector3(), 0.02);
  }
}

// ---------------- Animation
let last = performance.now();
function animate(){
  const now=performance.now(); const dt=now-last; last=now;
  controls.update();
  planet.update(dt);
  updateInvaders(dt);
  updateExpo(dt);
  composer.render();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// Restore previous session
restoreState();