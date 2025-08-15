/* global THREE */

/* ---------- Overlay d'erreur ---------- */
(function(){
  const box = document.getElementById('error');
  function show(msg){ try{ box.textContent = String(msg); box.style.display = 'block'; }catch{} }
  window.addEventListener('error', e => show(e.message || e.error || 'Erreur JS'));
  window.addEventListener('unhandledrejection', e => {
    const r = e && e.reason; show((r && (r.message || r)) || 'Unhandled rejection');
  });
})();

(function(){
  'use strict';
  if (!window.THREE || !THREE.WebGLRenderer) {
    const el = document.getElementById('error');
    el.textContent = 'Three.js n’a pas chargé. Recharge la page.'; el.style.display = 'block'; return;
  }

  /* =========================
     CONFIG GÉNÉRALE
     ========================= */
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5); // sûr pour iOS
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
    if (n < 10)  return 4900;  // ~70x70
    if (n < 20)  return 3600;  // ~60x60
    if (n < 50)  return 2600;  // ~51x51
    if (n < 120) return 1600;  // ~40x40
    if (n < 300) return 900;   // ~30x30
    return 256;                // ~16x16 (500+ invaders)
  }

  /* =========================
     RENDERER / SCÈNE / CAMÉRA
     ========================= */
  const canvas   = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:false, alpha:false, powerPreference:'default' });
  const gl = renderer.getContext();
  if (!gl) { const el = document.getElementById('error'); el.textContent = 'WebGL non disponible.'; el.style.display = 'block'; }
  renderer.setPixelRatio(DPR);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.6;

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.2, 200);

  /* =========================
     CONTRÔLES (inversion verticale + inertie)
     ========================= */
  function createSimpleOrbitControls(dom, cam, target) {
    const minDist = WORLD.planetRadius*1.05, maxDist = WORLD.planetRadius*4.5;
    let radius = WORLD.planetRadius*2.0, theta = Math.PI/6, phi = Math.PI/2.2;
    let tRadius = radius, vTheta=0, vPhi=0;
    const ROT_SENS=3.2, ROT_DAMP=8.0, ZOOM_DAMP=9.0;

    function apply(){
      const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
      const sinTh  = Math.sin(theta), cosTh = Math.cos(theta);
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
      theta += vTheta*dt; phi += vPhi*dt; vTheta*=rotDecay; vPhi*=rotDecay;
      const EPS=0.05; if (phi<EPS) phi=EPS; if (phi>Math.PI-EPS) phi=Math.PI-EPS;
      const k=1.0-Math.exp(-ZOOM_DAMP*dt); radius += (tRadius-radius)*k; apply();
    }
    return { update, apply, minDistance:minDist, maxDistance:maxDist };
  }
  const controls = createSimpleOrbitControls(renderer.domElement, camera, new THREE.Vector3(0,0,0));

  /* =========================
     LUMIÈRES / PLANÈTE / ÉTOILES
     ========================= */
  const sun  = new THREE.DirectionalLight(0xffffff, 1.18); sun.position.set(-4,6,8); scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xd7f0ff, 0x2a1e1a, 1.1));
  const fill = new THREE.DirectionalLight(0x9fd7ff, 0.38); fill.position.set(5,-2,-6); scene.add(fill);

  function generatePlanetTexture(w,h){
    w=w||512; h=h||256;
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const ctx=c.getContext('2d');
    const g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#56b3c9'); g.addColorStop(.55,'#67c0d5'); g.addColorStop(1,'#4aa3ba');
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    const seed=1337;
    function rand(n){ return (Math.sin(n*16807+seed)*43758.5453)%1; }
    function noise1d(x){ const i=Math.floor(x), f=x-i; const a=rand(i), b=rand(i+1); return a*(1-f)+b*f; }
    ctx.globalAlpha=.26;
    for(let y=0;y<h;y++){
      const v=y/h, band=.5+.5*Math.sin((v*3.5+.15)*Math.PI*2), n=.5+.5*noise1d(v*24.0);
      const t=Math.min(1,Math.max(0,band*.6+n*.4));
      ctx.fillStyle=`rgba(255,255,255,${0.16*t})`; ctx.fillRect(0,y,w,1);
    }
    ctx.globalAlpha=1;
    ctx.fillStyle='rgba(255,255,255,0.07)';
    for(let i=0;i<44;i++){
      const cx=Math.random()*w, cy=Math.random()*h, r=12+Math.random()*30;
      const grd=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
      grd.addColorStop(0,'rgba(255,255,255,0.14)'); grd.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
    }
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    tex.wrapS=tex.wrapT=THREE.MirroredRepeatWrapping; return tex;
  }

  // Géométrie + relief
  const planetGeo = new THREE.SphereGeometry(WORLD.planetRadius, 96, 64);
  const planetMat = new THREE.MeshStandardMaterial({
    map: generatePlanetTexture(512,256),
    color: new THREE.Color('#7ad1e2').convertSRGBToLinear(),
    roughness: .74, metalness: .1
  });
  const planet = new THREE.Mesh(planetGeo, planetMat); scene.add(planet);

  const BUMP_SCALE = 0.03;
  function planetBump(n){ return BUMP_SCALE*(Math.sin(7*n.x)+Math.sin(9*n.y)+Math.sin(11*n.z)); }
  (function applyBump(){
    const pos=planetGeo.attributes.position, v=new THREE.Vector3();
    for(let i=0;i<pos.count;i++){
      v.fromBufferAttribute(pos,i).normalize();
      const p=planetBump(v); v.multiplyScalar(WORLD.planetRadius+p);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    planetGeo.computeVertexNormals();
  })();

  // Étoiles statiques
  (function stars(){
    const N=2400, a=new Float32Array(3*N);
    for(let i=0;i<N;i++){
      const r=70+Math.random()*70, t=Math.acos(Math.random()*2-1), p=Math.random()*Math.PI*2;
      a[3*i]=r*Math.sin(t)*Math.cos(p); a[3*i+1]=r*Math.cos(t); a[3*i+2]=r*Math.sin(t)*Math.sin(p);
    }
    const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a,3));
    scene.add(new THREE.Points(g,new THREE.PointsMaterial({size:1.5,sizeAttenuation:false,color:0xffffff})));
  })();

  /* =========================
     OUTILS IMAGE – UltraSharp
     ========================= */
  function loadImage(file){ return new Promise((res,rej)=>{ const url=URL.createObjectURL(file); const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=url; }); }
  function lin255(c){ c/=255; return (c<=0.04045)?(c/12.92):Math.pow((c+0.055)/1.055,2.4); }
  function dist2(a,b){ const dr=lin255(a[0])-lin255(b[0]), dg=lin255(a[1])-lin255(b[1]), db=lin255(a[2])-lin255(b[2]); return dr*dr+dg*dg+db*db; }
  function s2l(u){ return (u<=0.04045)?(u/12.92):Math.pow((u+0.055)/1.055,2.4); }
  function rgb2hsv(r,g,b){ const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min; let h=0;
    if(d!==0){ if(max===r) h=((g-b)/d)%6; else if(max===g) h=(b-r)/d+2; else h=(r-g)/d+4; h/=6; if(h<0) h+=1; }
    return {h, s:max===0?0:d/max, v:max}; }
  function hsv2rgb(h,s,v){ const i=Math.floor(h*6), f=h*6-i, p=v*(1-s), q=v*(1-f*s), t=v*(1-(1-f)*s), m=i%6;
    return {r:[v,q,p,p,t,v][m], g:[t,v,v,q,p,p][m], b:[p,p,t,v,v,q][m]}; }
  function boostColor(c){ const hsv=rgb2hsv(c.r,c.g,c.b); const SAT=.12, GAMMA=.92;
    hsv.s=Math.min(1,hsv.s*(1+SAT)); hsv.v=Math.pow(hsv.v,GAMMA); return hsv2rgb(hsv.h,hsv.s,hsv.v); }

  function getEdgeBg(data,W,H){
    const m=Math.floor(Math.min(W,H)*.04), skip=Math.floor(H*.18);
    const regs=[{x:0,y:0,w:W,h:m},{x:0,y:m,w:m,h:H-m-skip},{x:W-m,y:m,w:m,h:H-m-skip},{x:0,y:H-m-skip,w:W,h:m}];
    let r=0,g=0,b=0,n=0, i, x, y, t;
    for(let ri=0;ri<regs.length;ri++){ t=regs[ri];
      for(y=t.y;y<t.y+t.h;y++) for(x=t.x;x<t.x+t.w;x++){ i=(y*W+x)*4; r+=data[i]; g+=data[i+1]; b+=data[i+2]; n++; }
    }
    return [r/n,g/n,b/n];
  }

  function kmeans(colors,K,it){
    K=K||5; it=it||10;
    const cents=[], assign=new Array(colors.length);
    for(let k=0;k<K;k++){ const c=colors[Math.floor(colors.length*(k+0.5)/(K+0.5))]; cents.push([c[0],c[1],c[2]]); }
    for(let t=0;t<it;t++){
      for(let i=0;i<colors.length;i++){ let best=0, bd=1e9;
        for(let k=0;k<K;k++){ const d=dist2(colors[i],cents[k]); if(d<bd){bd=d; best=k;} } assign[i]=best; }
      const acc=[]; for(let k=0;k<K;k++) acc.push([0,0,0,0]);
      for(let i=0;i<colors.length;i++){ const k=assign[i], cc=colors[i]; acc[k][0]+=cc[0]; acc[k][1]+=cc[1]; acc[k][2]+=cc[2]; acc[k][3]++; }
      for(let k=0;k<K;k++){ if(acc[k][3]>0){ cents[k][0]=acc[k][0]/acc[k][3]; cents[k][1]=acc[k][1]/acc[k][3]; cents[k][2]=acc[k][2]/acc[k][3]; } }
    }
    return { centers:cents, assign };
  }

  // Projections de gradient (diff simple, robuste et léger)
  function luminance(r,g,b){ return 0.2126*r + 0.7152*g + 0.0722*b; }
  function gradProjections(data,W,H,rect){
    const gx=new Float32Array(rect.w), gy=new Float32Array(rect.height||rect.h);
    const x0=rect.x, y0=rect.y, w=rect.w, h=rect.h;
    for(let y=y0;y<y0+h-1;y++){
      for(let x=x0;x<x0+w-1;x++){
        const i=(y*W+x)*4, ix=(y*W+(x+1))*4, iy=((y+1)*W+x)*4;
        const l = luminance(data[i],data[i+1],data[i+2]);
        const lx= luminance(data[ix],data[ix+1],data[ix+2]);
        const ly= luminance(data[iy],data[iy+1],data[iy+2]);
        gx[x-x0] += Math.abs(lx-l); gy[y-y0] += Math.abs(ly-l);
      }
    }
    return {gx, gy};
  }
  function autocorrBestPeriod(arr, minS, maxS){
    let bestS=minS, best=-1;
    for(let s=minS; s<=maxS; s++){
      let sum=0; for(let i=0;i<arr.length-s;i++) sum += arr[i]*arr[i+s];
      const score=sum/(arr.length-s);
      if(score>best){ best=score; bestS=s; }
    }
    return bestS;
  }
  function bestOffset(edgeProj, period){
    let bestO=0, best=-1;
    for(let o=0;o<period;o++){
      let sum=0;
      for(let x=o; x<edgeProj.length; x+=period) sum+=edgeProj[x];
      if(sum>best){ best=sum; bestO=o; }
    }
    return bestO;
  }

  // Morphologie binaires (cases)
  function dilate(bin){
    const r=bin.length, c=bin[0].length, out=bin.map(row=>row.slice());
    const inside=(y,x)=>y>=0&&y<r&&x>=0&&x<c;
    for(let y=0;y<r;y++)for(let x=0;x<c;x++) if(bin[y][x])
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ const ny=y+dy,nx=x+dx; if(inside(ny,nx)) out[ny][nx]=true; }
    return out;
  }
  function erode(bin){
    const r=bin.length, c=bin[0].length, out=bin.map(row=>row.slice());
    const inside=(y,x)=>y>=0&&y<r&&x>=0&&x<c;
    for(let y=0;y<r;y++)for(let x=0;x<c;x++){
      let ok=true;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ const ny=y+dy,nx=x+dx;
        if(!inside(ny,nx)||!bin[ny][nx]) { ok=false; break; } }
      out[y][x]=ok;
    }
    return out;
  }
  const closeBinary = bin => erode(dilate(bin));

  // UltraSharp – extraction exacte par grille
  async function imageToPixelMatrixUltraSharp(file, budget){
    const img = await loadImage(file);

    // 1) Mise à l’échelle raisonnable (perf iPhone)
    const maxSide = 1400;
    const scl = Math.min(1, maxSide/Math.max(img.naturalWidth, img.naturalHeight));
    const W = Math.round(img.naturalWidth*scl), H = Math.round(img.naturalHeight*scl);
    const cnv=document.createElement('canvas'); cnv.width=W; cnv.height=H;
    const ctx=cnv.getContext('2d', { willReadFrequently:true });
    ctx.drawImage(img,0,0,W,H);
    const rgba = ctx.getImageData(0,0,W,H); const data=rgba.data;

    // 2) Rect d’intérêt par différence au fond (large mais fiable)
    const bgEdge = getEdgeBg(data,W,H);
    const DIFF=0.012;
    let minX=W, minY=H, maxX=0, maxY=0;
    const skipB=Math.floor(H*.18), m=Math.floor(Math.min(W,H)*.04);
    for(let y=m;y<H-skipB;y++) for(let x=m;x<W-m;x++){
      const i=(y*W+x)*4, px=[data[i],data[i+1],data[i+2]];
      if(dist2(px,bgEdge)>DIFF){ if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y; }
    }
    if(minX>=maxX||minY>=maxY) throw new Error('Invader non détecté.');
    const rect={x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};

    // 3) Détection période des carreaux par gradients + autocorr
    const proj = gradProjections(data,W,H,rect);
    const minPitch = Math.max(4, Math.round(Math.min(rect.w,rect.h)/80));
    const maxPitch = Math.max(minPitch+3, Math.round(Math.min(rect.w,rect.h)/10));
    const tX = Math.max(4, Math.min(96, autocorrBestPeriod(proj.gx, minPitch, maxPitch)));
    const tY = Math.max(4, Math.min(96, autocorrBestPeriod(proj.gy, minPitch, maxPitch)));
    const offX = bestOffset(proj.gx, tX);
    const offY = bestOffset(proj.gy, tY);

    // 4) Échantillonnage EXACT au centre de chaque carreau (3x3 sous‑samples)
    let cols = Math.floor((rect.w - offX)/tX), rows = Math.floor((rect.h - offY)/tY);
    cols = Math.max(8, Math.min(180, cols)); rows = Math.max(8, Math.min(180, rows));
    const colors = []; // pour kmeans
    const cells = Array.from({length:rows},()=>Array(cols).fill(null));
    const S=3, voteNeeded = 4; // 3x3 → 9 points, garde si >=4 non‑fond
    function sampleAt(ix,iy){ const id=(iy*W+ix)*4; return [data[id],data[id+1],data[id+2]]; }
    function nearestCenterIndex(rgb, centers){
      let best=0, bd=1e9; for(let k=0;k<centers.length;k++){ const d=dist2(rgb,centers[k]); if(d<bd){bd=d; best=k;} }
      return {k:best, d:bd};
    }
    // prélèvement brut pour cluster initial
    for(let gy=0; gy<rows; gy++){
      for(let gx=0; gx<cols; gx++){
        const cx = rect.x + offX + gx*tX + tX/2;
        const cy = rect.y + offY + gy*tY + tY/2;
        const ix = Math.max(1, Math.min(W-2, Math.round(cx)));
        const iy = Math.max(1, Math.min(H-2, Math.round(cy)));
        const rgb = sampleAt(ix,iy);
        colors.push(rgb);
      }
    }
    // Clusters couleurs (cases)
    const km = kmeans(colors, 5, 10);

    // Décideurs fond via anneau périphérique
    const ringIdx=[];
    for(let x=0;x<cols;x++){ ringIdx.push(0*cols + x, (rows-1)*cols + x); }
    for(let y=1;y<rows-1;y++){ ringIdx.push(y*cols + 0, y*cols + (cols-1)); }
    const counts=new Array(km.centers.length).fill(0);
    for(const id of ringIdx){ counts[km.assign[id]]++; }
    const bg1 = counts.indexOf(Math.max.apply(null, counts));
    counts[bg1] = -1;
    const bg2 = counts.indexOf(Math.max.apply(null, counts)); // parfois cadre de 2 couleurs
    const BG = new Set([bg1,bg2]);

    // Remplissage au niveau cases : “est‑fond” si proche d’un centre de BG
    const bgThr = 0.006; // distance linéaire
    const isBg = (rgb)=>{
      const nb1=nearestCenterIndex(rgb, [km.centers[bg1]]), d1=nb1.d;
      const nb2=nearestCenterIndex(rgb, [km.centers[bg2]]), d2=nb2.d;
      return (d1<bgThr) || (d2<bgThr);
    };

    // Re‑échantillonnage multi‑points + vote
    const fgMask = Array.from({length:rows},()=>Array(cols).fill(false));
    for(let gy=0; gy<rows; gy++){
      for(let gx=0; gx<cols; gx++){
        const x0 = rect.x + offX + gx*tX, x1=x0+tX;
        const y0 = rect.y + offY + gy*tY, y1=y0+tY;
        const ix0=Math.max(1,Math.floor(x0+tX*0.22)), ix1=Math.min(W-2,Math.ceil(x1-tX*0.22));
        const iy0=Math.max(1,Math.floor(y0+tY*0.22)), iy1=Math.min(H-2,Math.ceil(y1-tY*0.22));
        let votes=0, R=0,G=0,B=0,N=0;
        for(let sy=0; sy<S; sy++){
          for(let sx=0; sx<S; sx++){
            const u=(sx+0.5)/S, v=(sy+0.5)/S;
            const px=Math.floor(ix0 + u*(ix1-ix0)), py=Math.floor(iy0 + v*(iy1-iy0));
            const rgb=sampleAt(px,py);
            const nb=nearestCenterIndex(rgb, km.centers);
            if(!BG.has(nb.k) || nb.d>bgThr){ votes++; R+=rgb[0]; G+=rgb[1]; B+=rgb[2]; N++; }
          }
        }
        if(votes>=voteNeeded && N>0){
          fgMask[gy][gx]=true;
          cells[gy][gx]={r:(R/N)/255,g:(G/N)/255,b:(B/N)/255};
        }
      }
    }

    // Nettoyage : close + composantes principales
    let cleaned = closeBinary(fgMask);
    // garde les plus grosses composantes tant que > ~6% de la plus grande
    (function keepMain(){
      const r=cleaned.length, c=cleaned[0].length, vis=Array.from({length:r},()=>Array(c).fill(false));
      const comps=[]; const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      for(let y=0;y<r;y++)for(let x=0;x<c;x++){ if(!cleaned[y][x]||vis[y][x]) continue;
        const q=[[y,x]]; vis[y][x]=true; let area=0, minY=y, maxY=y, minX=x, maxX=x;
        while(q.length){ const [cy,cx]=q.pop(); area++;
          if(cy<minY)minY=cy; if(cy>maxY)maxY=cy; if(cx<minX)minX=cx; if(cx>maxX)maxX=cx;
          for(const d of dirs){ const ny=cy+d[0], nx=cx+d[1];
            if(ny>=0&&ny<r&&nx>=0&&nx<c && cleaned[ny][nx] && !vis[ny][nx]){ vis[ny][nx]=true; q.push([ny,nx]); } }
        }
        comps.push({area,bbox:{minY,maxY,minX,maxX}});
      }
      if(!comps.length) return;
      comps.sort((a,b)=>b.area-a.area);
      const keep=[]; const largest=comps[0].area; let cum=0;
      for(const cc of comps){ if(cc.area>=Math.max(6, largest*0.06)){ keep.push(cc); cum+=cc.area; if(cum>largest*1.35) break; } }
      const out=cleaned.map(row=>row.map(()=>false));
      for(const cc of keep){ const bb=cc.bbox;
        for(let y=bb.minY;y<=bb.maxY;y++) for(let x=bb.minX;x<=bb.maxX;x++){ if(cleaned[y][x]) out[y][x]=true; } }
      cleaned = out;
    })();

    // Recadrage serré
    let minY=rows, minX2=cols, maxY2=0, maxX2=0, any=false;
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) if(cleaned[y][x]){ any=true; if(y<minY)minY=y; if(y>maxY2)maxY2=y; if(x<minX2)minX2=x; if(x>maxX2)maxX2=x; }
    if(!any) throw new Error('Silhouette trop faible.');
    const outH=maxY2-minY+1, outW=maxX2-minX2+1;

    // Palette lissée (quantification douce sur l’avant‑plan)
    const fgColors=[];
    for(let y=minY;y<=maxY2;y++) for(let x=minX2;x<=maxX2;x++) if(cleaned[y][x]){
      const c=cells[y][x]; if(c) fgColors.push([c.r*255,c.g*255,c.b*255]);
    }
    let palette = null;
    if(fgColors.length){
      const K = Math.min(8, Math.max(2, Math.round(Math.sqrt(fgColors.length/150))));
      const km2 = kmeans(fgColors, K, 8);
      palette = km2.centers.map(c=>({r:c[0]/255,g:c[1]/255,b:c[2]/255}));
    }

    // Sortie en grille compactée
    const pixels = Array.from({length:outH},()=>Array(outW).fill(null));
    for(let y=0;y<outH;y++) for(let x=0;x<outW;x++){
      const Y=y+minY, X=x+minX2;
      if(!cleaned[Y][X]) { pixels[y][x]=null; continue; }
      let col = cells[Y][X];
      if(!col){ // secours (rare)
        let R=0,G=0,B=0,N=0;
        for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
          const ny=Y+dy,nx=X+dx; if(ny<0||ny>=rows||nx<0||nx>=cols) continue;
          const c=cells[ny][nx]; if(!c) continue; R+=c.r; G+=c.g; B+=c.b; N++;
        }
        if(N>0) col={r:R/N,g:G/N,b:B/N}; else col={r:0,g:0,b:0};
      }
      // accrochage à la palette
      if(palette){
        let best=0, bd=1e9;
        for(let i=0;i<palette.length;i++){
          const p=palette[i]; const d=(p.r-col.r)*(p.r-col.r)+(p.g-col.g)*(p.g-col.g)+(p.b-col.b)*(p.b-col.b);
          if(d<bd){ bd=d; best=i; }
        }
        col = palette[best];
      }
      pixels[y][x]=col;
    }

    // LOD si nécessaire
    let vox=0; for(let y=0;y<pixels.length;y++) for(let x=0;x<pixels[0].length;x++) if(pixels[y][x]) vox++;
    const budgetV = budget || 2000;
    if(vox>budgetV){
      const factor=Math.ceil(Math.sqrt(vox/budgetV));
      const R=Math.ceil(pixels.length/factor), C=Math.ceil(pixels[0].length/factor);
      const out=Array.from({length:R},()=>Array(C).fill(null));
      for(let gy=0;gy<R;gy++) for(let gx=0;gx<C;gx++){
        let Rsum=0,Gsum=0,Bsum=0,N=0;
        for(let y2=gy*factor;y2<Math.min(pixels.length,(gy+1)*factor);y2++)
          for(let x2=gx*factor;x2<Math.min(pixels[0].length,(gx+1)*factor);x2++){
            const cl=pixels[y2][x2]; if(!cl) continue; Rsum+=cl.r; Gsum+=cl.g; Bsum+=cl.b; N++;
          }
        if(N>0) out[gy][gx]={r:Rsum/N,g:Gsum/N,b:Bsum/N};
      }
      return out;
    }
    return pixels;
  }

  /* =========================
     MESH INVADER (instanced) – net et sans z‑fighting
     ========================= */
  function buildInvaderMesh(pixelGrid){
    const rows=pixelGrid.length, cols=pixelGrid[0].length;
    const size=WORLD.invaderScale, gap=size*WORLD.spacingRatio, depth=size*WORLD.depthFactor;
    const geom=new THREE.BoxGeometry(size-gap,size-gap,depth);

    const colAttr=new Float32Array(geom.attributes.position.count*3);
    for(let i=0;i<geom.attributes.position.count;i++){
      const z=geom.attributes.position.getZ(i); const shade=z<0?0.82:1.0;
      colAttr[3*i]=shade; colAttr[3*i+1]=shade; colAttr[3*i+2]=shade;
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colAttr,3));

    const mat=new THREE.MeshStandardMaterial({
      roughness:.42, metalness:.06, vertexColors:true, flatShading:true,
      color:0xffffff, emissive:0x151515, emissiveIntensity:.22,
      polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2
    });

    const mesh=new THREE.InstancedMesh(geom,mat,rows*cols);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const dummy=new THREE.Object3D();
    const w=cols*size, h=rows*size;
    const x0=-w/2+size/2, y0=-h/2+size/2;
    let idx=0;
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
      const c=pixelGrid[y][x]; if(!c) continue;
      const srgb=boostColor({r:c.r,g:c.g,b:c.b});
      const col=new THREE.Color(srgb.r,srgb.g,srgb.b); if(col.convertSRGBToLinear) col.convertSRGBToLinear();
      dummy.position.set(x0+x*size, y0+(rows-1-y)*size, 0);
      dummy.rotation.set(0,0,0); dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix); mesh.setColorAt(idx, col); idx++;
    }
    mesh.count=idx; if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
    return { mesh, width:w, height:h, depth };
  }

  /* =========================
     AGENTS – déplacement tangent + altitude “no‑clip”
     ========================= */
  function alignZAxisTo(obj, normal){
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), normal.clone().normalize());
    obj.quaternion.copy(q);
  }
  const planetRadiusAt = n => WORLD.planetRadius + planetBump(n);

  function createWanderer(invader){
    const g=new THREE.Group(); g.add(invader.mesh);
    const targetWorldSize=WORLD.invaderMaxWorldSize*(WORLD.planetRadius*2);
    const scale=targetWorldSize/Math.max(invader.width,invader.height); g.scale.setScalar(scale);
    const hover=(invader.depth*scale)/2 + WORLD.hoverMargin;

    const normal=new THREE.Vector3().randomDirection();
    const radius=planetRadiusAt(normal)+hover; g.position.copy(normal).multiplyScalar(radius);
    alignZAxisTo(g,normal); g.rotateOnAxis(new THREE.Vector3(0,0,1), Math.random()*Math.PI*2);

    const axis=new THREE.Vector3().randomDirection();
    const baseSpeed=0.08+Math.random()*0.06;
    const rot=new THREE.Quaternion();

    return {
      object:g, normal, axis, hover, baseSpeed,
      update(dt, peers, speedFactor){
        const push=new THREE.Vector3();
        for(let i=0;i<peers.length;i++){
          const p=peers[i]; if(p===this) continue;
          const d=this.object.position.clone().sub(p.object.position); const L=d.length();
          if(L<WORLD.repelRadius) push.add(d.multiplyScalar((WORLD.repelRadius-L)/WORLD.repelRadius));
        }
        if(push.lengthSq()>0){ this.axis.add(push.normalize().multiplyScalar(0.02)).normalize(); }

        rot.setFromAxisAngle(this.axis, this.baseSpeed*speedFactor*dt);
        this.normal.applyQuaternion(rot).normalize();

        const R=planetRadiusAt(this.normal)+this.hover;
        this.object.position.copy(this.normal).multiplyScalar(R);
        alignZAxisTo(this.object, this.normal);
      }
    };
  }

  /* =========================
     MÉTÉORITES & ÉTOILES FILANTES
     ========================= */
  const transients=[];
  function streakTexture(){ const c=document.createElement('canvas'); c.width=128; c.height=4; const ctx=c.getContext('2d');
    const g=ctx.createLinearGradient(0,0,128,0); g.addColorStop(0,'rgba(255,255,255,0)');
    g.addColorStop(.2,'rgba(255,255,255,0.3)'); g.addColorStop(1,'rgba(255,255,255,0)'); ctx.fillStyle=g; ctx.fillRect(0,0,128,4);
    const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping; t.needsUpdate=true; return t; }
  const TRAIL_TEX=streakTexture();

  function spawnMeteor(){
    const startDir=new THREE.Vector3().randomDirection(), targetDir=new THREE.Vector3().randomDirection();
    const startPos=startDir.clone().multiplyScalar(WORLD.planetRadius*6.0);
    const targetPos=targetDir.clone().multiplyScalar(WORLD.planetRadius*1.01);
    const body=new THREE.Mesh(new THREE.IcosahedronGeometry(0.10,0),
      new THREE.MeshStandardMaterial({color:0xffcc88,roughness:.65,metalness:.25,emissive:0x442200,emissiveIntensity:.35}));
    body.position.copy(startPos);
    const trail=new THREE.Mesh(new THREE.PlaneGeometry(1.2,0.07),
      new THREE.MeshBasicMaterial({map:TRAIL_TEX,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
    trail.position.copy(startPos); trail.rotation.y=Math.PI/2; scene.add(body); scene.add(trail);

    let t=0, speed=0.20+Math.random()*0.08, dir=new THREE.Vector3(), exploded=false;
    function impactFlash(where){
      const g=new THREE.SphereGeometry(0.18,12,10);
      const m=new THREE.MeshBasicMaterial({color:0xffffcc,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false});
      const flash=new THREE.Mesh(g,m); flash.position.copy(where); scene.add(flash);
      transients.push({done:false,update(dt){ flash.scale.multiplyScalar(1+dt*3.0); m.opacity*=Math.exp(-4*dt);
        if(m.opacity<.02){ this.done=true; scene.remove(flash); g.dispose(); m.dispose(); }},dispose(){ }});
    }
    transients.push({done:false,update(dt){
      t+=speed*dt; if(t>1) t=1;
      const prev=body.position.clone(); body.position.lerpVectors(startPos,targetPos,t);
      dir.copy(body.position).sub(prev).normalize();
      body.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),dir);
      trail.position.copy(body.position).addScaledVector(dir,-0.6); trail.lookAt(trail.position.clone().add(dir));
      const dist=body.position.length();
      if(!exploded && dist<=WORLD.planetRadius*1.01){
        exploded=true; impactFlash(body.position.clone()); this.done=true;
        scene.remove(body); scene.remove(trail);
        body.geometry.dispose(); body.material.dispose(); trail.geometry.dispose(); trail.material.dispose();
      }
    },dispose(){ }});
  }

  function spawnShootingStar(){
    const radius=120, p0=new THREE.Vector3().randomDirection().multiplyScalar(radius);
    const p1=new THREE.Vector3().randomDirection().multiplyScalar(radius);
    const streak=new THREE.Mesh(new THREE.PlaneGeometry(1.8,0.08),
      new THREE.MeshBasicMaterial({map:TRAIL_TEX,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
    streak.position.copy(p0); scene.add(streak);
    let t=0, speed=0.25+Math.random()*0.12;
    transients.push({done:false,update(dt){
      t+=speed*dt; if(t>1){ this.done=true; scene.remove(streak); streak.geometry.dispose(); streak.material.dispose(); return; }
      streak.position.lerpVectors(p0,p1,t); streak.lookAt(camera.position);
      streak.material.opacity = Math.max(0, 1-Math.abs(t-.5)*2);
    },dispose(){ }});
  }

  let nextMeteor=performance.now()+9000+Math.random()*10000;
  let nextStar  =performance.now()+4000+Math.random()*9000;

  /* =========================
     UI / Import iOS
     ========================= */
  const addBtn=document.getElementById('addBtn');
  const countLbl=document.getElementById('count');
  const speedSlider=document.getElementById('speed');
  const agents=[];
  let globalSpeedFactor = Number(speedSlider.value)/100; // 0.33 par défaut
  function updateCount(){ const n=agents.length; countLbl.textContent = n + (n>1?' invaders':' invader'); }
  speedSlider.addEventListener('input', ()=>{ globalSpeedFactor=Number(speedSlider.value)/100; });

  function handleFiles(files){
    const arr=[].slice.call(files);
    (async function(){
      for(let i=0;i<arr.length;i++){
        try{
          const px = await imageToPixelMatrixUltraSharp(arr[i], voxelsBudget(agents.length));
          const built = buildInvaderMesh(px);
          const agent = createWanderer(built);
          scene.add(agent.object);
          agents.push(agent); updateCount();
        }catch(err){
          const el=document.getElementById('error'); el.textContent=err.message||String(err); el.style.display='block';
        }
      }
    })();
  }
  function openPicker(){
    const input=document.createElement('input');
    input.type='file'; input.accept='image/*'; input.multiple=true;
    input.style.position='fixed'; input.style.left='-10000px'; input.style.top='-10000px';
    document.body.appendChild(input);
    input.addEventListener('change', e=>{ try{ handleFiles(e.target.files); } finally{ document.body.removeChild(input); } }, {once:true});
    input.click();
  }
  addBtn.addEventListener('click', e=>{ e.preventDefault(); openPicker(); }, {passive:false});
  addBtn.addEventListener('touchstart', e=>{ e.preventDefault(); }, {passive:false});
  addBtn.addEventListener('touchend', e=>{ e.preventDefault(); openPicker(); }, {passive:false});

  /* =========================
     BOUCLE
     ========================= */
  const clock=new THREE.Clock();
  function loop(){
    const dt=clock.getDelta();
    controls.update(dt);
    for(let i=0;i<agents.length;i++) agents[i].update(dt, agents, globalSpeedFactor);

    const now=performance.now();
    if(now>nextMeteor){ let alive=0; for(const t of transients) if(!t.done) alive++; if(alive<3) spawnMeteor();
      nextMeteor = now + 9000 + Math.random()*14000; }
    if(now>nextStar){ let alive=0; for(const t of transients) if(!t.done) alive++; if(alive<6) spawnShootingStar();
      nextStar   = now + 5000 + Math.random()*12000; }
    for(const T of transients){ if(!T.done) T.update(dt); }
    for(let i=transients.length-1;i>=0;i--) if(transients[i].done) transients.splice(i,1);

    renderer.render(scene,camera);
    requestAnimationFrame(loop);
  }
  loop();

  window.addEventListener('resize', function(){
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); controls.apply();
  });
})();