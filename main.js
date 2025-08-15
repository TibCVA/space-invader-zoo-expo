/* global THREE */

/* ---------- Overlay d'erreur ---------- */
(function(){
  const box = document.getElementById('error');
  function show(msg){ try{ box.textContent = String(msg); box.style.display = 'block'; }catch{} }
  window.addEventListener('error', e => show(e.message || e.error || 'Erreur JS'));
  window.addEventListener('unhandledrejection', e => { const r=e&&e.reason; show((r&&(r.message||r))||'Unhandled rejection'); });
})();

(function(){
  'use strict';
  if(!window.THREE || !THREE.WebGLRenderer){ const el=document.getElementById('error'); el.textContent='Three.js n’a pas chargé.'; el.style.display='block'; return; }

  /* ====== CONFIG ====== */
  const DPR = Math.min(window.devicePixelRatio||1, 1.5);
  const WORLD = {
    planetRadius: 3.2,
    invaderScale: 0.022,
    depthFactor: 0.95,
    spacingRatio: 0.01,
    repelRadius: 0.35,
    hoverMargin: 0.11,
    invaderMaxWorldSize: 0.10
  };
  function voxelsBudget(n){
    if (n < 10)  return 4900;
    if (n < 20)  return 3600;
    if (n < 50)  return 2600;
    if (n < 120) return 1600;
    if (n < 300) return 900;
    return 256;
  }

  /* ====== RENDERER/SCÈNE/CAMÉRA ====== */
  const canvas=document.getElementById('scene');
  const renderer=new THREE.WebGLRenderer({canvas, antialias:false, alpha:false, powerPreference:'default'});
  renderer.setClearColor(0x000010, 1);               // fond noir bleuté (visible même sans planète)
  renderer.setPixelRatio(DPR); renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.75;

  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.2, 200);

  // Position de départ GARANTIE visible
  const startPos = new THREE.Vector3(0, WORLD.planetRadius*0.4, WORLD.planetRadius*3.8);
  camera.position.copy(startPos);
  camera.lookAt(0,0,0);

  /* ====== Contrôles (inversion verticale + inertie) ====== */
  function createSimpleOrbitControls(dom, cam, target) {
    const minDist=WORLD.planetRadius*1.05, maxDist=WORLD.planetRadius*4.5;

    // Départ calé sur la position courante de la caméra
    const sph = new THREE.Spherical().setFromVector3(cam.position.clone());
    let radius = Math.max(minDist, Math.min(maxDist, sph.radius));
    let theta  = sph.theta;             // azimut
    let phi    = Math.min(Math.PI-0.05, Math.max(0.05, sph.phi)); // inclinaison

    let tRadius=radius, vTheta=0, vPhi=0;
    const ROT_SENS=3.2, ROT_DAMP=8.0, ZOOM_DAMP=9.0;

    function apply(){
      const sinPhi=Math.sin(phi), cosPhi=Math.cos(phi);
      const sinTh=Math.sin(theta), cosTh=Math.cos(theta);
      cam.position.set(radius*sinPhi*sinTh, radius*cosPhi, radius*sinPhi*cosTh);
      cam.lookAt(target);
    }
    apply();

    const st={rotating:false,sx:0,sy:0,pinching:false,d0:0,r0:radius};
    dom.addEventListener('mousedown', e=>{e.preventDefault(); st.rotating=true; st.sx=e.clientX; st.sy=e.clientY;},{passive:false});
    window.addEventListener('mousemove', e=>{
      if(!st.rotating) return; e.preventDefault();
      const dx=(e.clientX-st.sx)/dom.clientWidth, dy=(e.clientY-st.sy)/dom.clientHeight;
      vTheta += -dx*ROT_SENS*Math.PI; vPhi += -dy*ROT_SENS*Math.PI; // inversion verticale
      st.sx=e.clientX; st.sy=e.clientY;
    }, {passive:false});
    window.addEventListener('mouseup', ()=>{ st.rotating=false; });

    dom.addEventListener('wheel', e=>{ e.preventDefault(); const s=Math.exp(e.deltaY*0.001);
      tRadius=Math.max(minDist,Math.min(maxDist,radius*s)); }, {passive:false});

    dom.addEventListener('touchstart', e=>{
      if(e.touches.length===1){ st.rotating=true; st.sx=e.touches[0].clientX; st.sy=e.touches[0].clientY; }
      else if(e.touches.length===2){
        st.pinching=true; const dx=e.touches[0].clientX-e.touches[1].clientX, dy=e.touches[0].clientY-e.touches[1].clientY;
        st.d0=Math.hypot(dx,dy); st.r0=radius;
      }
    }, {passive:false});
    dom.addEventListener('touchmove', e=>{
      if(st.pinching && e.touches.length===2){
        e.preventDefault(); const dx=e.touches[0].clientX-e.touches[1].clientX, dy=e.touches[0].clientY-e.touches[1].clientY;
        const d=Math.hypot(dx,dy), scale=st.d0/d; tRadius=Math.max(minDist,Math.min(maxDist,st.r0*scale));
      } else if(st.rotating && e.touches.length===1){
        e.preventDefault(); const dx=(e.touches[0].clientX-st.sx)/dom.clientWidth, dy=(e.touches[0].clientY-st.sy)/dom.clientHeight;
        vTheta += -dx*ROT_SENS*Math.PI; vPhi += -dy*ROT_SENS*Math.PI;
        st.sx=e.touches[0].clientX; st.sy=e.touches[0].clientY;
      }
    }, {passive:false});
    dom.addEventListener('touchend', ()=>{ st.rotating=false; st.pinching=false; }, {passive:false});

    function update(dt){
      const rotDecay=Math.exp(-ROT_DAMP*dt);
      theta+=vTheta*dt; phi+=vPhi*dt; vTheta*=rotDecay; vPhi*=rotDecay;
      const EPS=0.05; if(phi<EPS)phi=EPS; if(phi>Math.PI-EPS)phi=Math.PI-EPS;
      const k=1.0-Math.exp(-ZOOM_DAMP*dt); radius += (tRadius-radius)*k; apply();
    }
    return {update, apply, setRadius(r){ tRadius = Math.max(minDist, Math.min(maxDist, r)); }};
  }
  const controls=createSimpleOrbitControls(renderer.domElement,camera,new THREE.Vector3(0,0,0));

  /* ====== Lumières / Planète / Étoiles ====== */
  const sun=new THREE.DirectionalLight(0xffffff,1.25); sun.position.set(-4,6,8); scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xe5f4ff,0x2a1e1a,1.2));
  const fill=new THREE.DirectionalLight(0xa6e0ff,0.45); fill.position.set(5,-2,-6); scene.add(fill);

  function generatePlanetTexture(w,h){
    w=w||512; h=h||256;
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const ctx=c.getContext('2d');
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#62c9de'); g.addColorStop(.55,'#76d4e7'); g.addColorStop(1,'#56b9d3');
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    const seed=1337; function rand(n){return (Math.sin(n*16807+seed)*43758.5453)%1;}
    function noise1d(x){const i=Math.floor(x),f=x-i;const a=rand(i),b=rand(i+1);return a*(1-f)+b*f;}
    ctx.globalAlpha=.26;
    for(let y=0;y<h;y++){
      const v=y/h, band=.5+.5*Math.sin((v*3.5+.15)*Math.PI*2), n=.5+.5*noise1d(v*24.0);
      const t=Math.min(1,Math.max(0,band*.6+n*.4));
      ctx.fillStyle=`rgba(255,255,255,${0.18*t})`; ctx.fillRect(0,y,w,1);
    }
    ctx.globalAlpha=1;
    ctx.fillStyle='rgba(255,255,255,0.08)';
    for(let i=0;i<48;i++){
      const cx=Math.random()*w,cy=Math.random()*h,r=12+Math.random()*32;
      const grd=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
      grd.addColorStop(0,'rgba(255,255,255,0.15)'); grd.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
    }
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace; tex.wrapS=tex.wrapT=THREE.MirroredRepeatWrapping; return tex;
  }

  const planetGeo=new THREE.SphereGeometry(WORLD.planetRadius,96,64);
  const planetMat=new THREE.MeshStandardMaterial({
    map:generatePlanetTexture(512,256),
    color:new THREE.Color('#8fd7e6').convertSRGBToLinear(),  // plus clair
    roughness:.66, metalness:.08
  });
  const planet=new THREE.Mesh(planetGeo,planetMat); scene.add(planet);

  const BUMP_SCALE=0.028; // léger relief
  function planetBump(n){ return BUMP_SCALE*(Math.sin(7*n.x)+Math.sin(9*n.y)+Math.sin(11*n.z)); }
  (function(){
    const pos=planetGeo.attributes.position, v=new THREE.Vector3();
    for(let i=0;i<pos.count;i++){ v.fromBufferAttribute(pos,i).normalize();
      const p=planetBump(v); v.multiplyScalar(WORLD.planetRadius+p); pos.setXYZ(i,v.x,v.y,v.z); }
    planetGeo.computeVertexNormals();
  })();

  (function(){ // étoiles
    const N=2400, a=new Float32Array(3*N);
    for(let i=0;i<N;i++){ const r=70+Math.random()*70,t=Math.acos(Math.random()*2-1),p=Math.random()*Math.PI*2;
      a[3*i]=r*Math.sin(t)*Math.cos(p); a[3*i+1]=r*Math.cos(t); a[3*i+2]=r*Math.sin(t)*Math.sin(p); }
    const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a,3));
    scene.add(new THREE.Points(g,new THREE.PointsMaterial({size:1.5,sizeAttenuation:false,color:0xffffff})));
  })();

  /* ====== (… le reste du fichier – extraction UltraSharp‑Flood, buildInvaderMesh,
             agents/no‑clip, météorites, UI, boucle, resize …) ======
     >>> COPIE **IDENTIQUE** à la v4.2 que je t’ai donnée juste avant <<<
     Pour garder la réponse compacte, je ne le répète pas ici.
     Replace simplement ce bloc RENDERER/SCÈNE/CAMÉRA/LUMIÈRES par celui‑ci
     et garde tout le reste inchangé dans ton `main.js` v4.2.
  */
})();