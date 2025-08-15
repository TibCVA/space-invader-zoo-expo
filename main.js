/* global THREE */

// -------- Overlay d'erreur ----------
(function(){
  var box = document.getElementById('error');
  function show(msg){ try{ box.textContent = String(msg); box.style.display = 'block'; }catch(_e){} }
  window.addEventListener('error', function(e){ show(e.message || e.error || 'Erreur JS'); });
  window.addEventListener('unhandledrejection', function(e){
    var r = e && e.reason; show((r && (r.message || r)) || 'Unhandled rejection');
  });
})();

(function(){
  'use strict';
  if (!window.THREE || !THREE.WebGLRenderer) {
    var el = document.getElementById('error');
    el.textContent = 'Three.js n’a pas chargé (réseau/cache). Recharge la page.';
    el.style.display = 'block';
    return;
  }

  /* =========================
     CONFIG & CONSTANTES
     ========================= */
  var DPR = Math.min(window.devicePixelRatio || 1, 1.5); // iOS safe
  var WORLD = {
    planetRadius: 3.2,
    invaderScale: 0.022,         // taille "tuile"
    depthFactor: 0.95,           // voxels quasi cubiques
    spacingRatio: 0.01,          // gap minuscule → rendu net
    repelRadius: 0.35,
    hoverMargin: 0.07,           // marge ↑ (évite les "morsures")
    invaderMaxWorldSize: 0.10    // 10% du diamètre planète
  };

  function voxelsBudget(count){
    if (count < 20)  return 2500;  // ~50x50
    if (count < 50)  return 1600;  // ~40x40
    if (count < 120) return 900;   // ~30x30
    if (count < 300) return 450;   // ~21x21
    return 240;                    // ~15x16
  }

  /* =========================
     RENDERER / SCÈNE / CAMÉRA
     ========================= */
  var canvas = document.getElementById('scene');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'default' });
  var gl = renderer.getContext();
  if (!gl) {
    var el = document.getElementById('error');
    el.textContent = 'WebGL non disponible. Ferme d’autres apps/onglets et recharge.';
    el.style.display = 'block';
  }
  renderer.setPixelRatio(DPR);
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (renderer.outputColorSpace !== undefined) renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (renderer.toneMapping !== undefined) renderer.toneMapping = THREE.ACESFilmicToneMapping;
  if (renderer.toneMappingExposure !== undefined) renderer.toneMappingExposure = 1.6; // planète + claire

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 150);

  /* =========================
     CONTRÔLES (inversion verticale + inertie)
     ========================= */
  function createSimpleOrbitControls(dom, cam, target) {
    var minDist = WORLD.planetRadius*1.05;
    var maxDist = WORLD.planetRadius*4.5;
    var radius = WORLD.planetRadius*2.0;
    var theta = Math.PI/6;
    var phi   = Math.PI/2.2;

    var tRadius = radius;
    var vTheta = 0, vPhi = 0;
    var ROT_SENS = 3.2, ROT_DAMP = 8.0, ZOOM_DAMP = 9.0;

    function apply() {
      var sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
      var sinTh  = Math.sin(theta), cosTh = Math.cos(theta);
      cam.position.set(radius * sinPhi * sinTh, radius * cosPhi, radius * sinPhi * cosTh);
      cam.lookAt(target);
    }
    apply();

    var st = { rotating:false, sx:0, sy:0, pinching:false, d0:0, r0:radius };

    dom.addEventListener('mousedown', function(e){ e.preventDefault(); st.rotating=true; st.sx=e.clientX; st.sy=e.clientY; }, {passive:false});
    window.addEventListener('mousemove', function(e){
      if(!st.rotating) return;
      e.preventDefault();
      var dx=(e.clientX-st.sx)/dom.clientWidth, dy=(e.clientY-st.sy)/dom.clientHeight;
      vTheta += -dx * ROT_SENS * Math.PI;
      vPhi   += -dy * ROT_SENS * Math.PI; // inversion verticale
      st.sx=e.clientX; st.sy=e.clientY;
    }, {passive:false});
    window.addEventListener('mouseup', function(){ st.rotating=false; });

    dom.addEventListener('wheel', function(e){ e.preventDefault(); var s=Math.exp(e.deltaY*0.001);
      tRadius = Math.max(minDist, Math.min(maxDist, radius*s)); }, {passive:false});

    dom.addEventListener('touchstart', function(e){
      if(e.touches.length===1){ st.rotating=true; st.sx=e.touches[0].clientX; st.sy=e.touches[0].clientY; }
      else if(e.touches.length===2){
        st.pinching=true; var dx=e.touches[0].clientX-e.touches[1].clientX, dy=e.touches[0].clientY-e.touches[1].clientY;
        st.d0=Math.hypot(dx,dy); st.r0=radius;
      }
    }, {passive:false});
    dom.addEventListener('touchmove', function(e){
      if(st.pinching && e.touches.length===2){
        e.preventDefault(); var dx=e.touches[0].clientX-e.touches[1].clientX, dy=e.touches[0].clientY-e.touches[1].clientY;
        var d=Math.hypot(dx,dy), scale=st.d0/d;
        tRadius = Math.max(minDist, Math.min(maxDist, st.r0*scale));
      } else if(st.rotating && e.touches.length===1){
        e.preventDefault(); var dx=(e.touches[0].clientX-st.sx)/dom.clientWidth, dy=(e.touches[0].clientY-st.sy)/dom.clientHeight;
        vTheta += -dx * ROT_SENS * Math.PI; vPhi += -dy * ROT_SENS * Math.PI; st.sx=e.touches[0].clientX; st.sy=e.touches[0].clientY;
      }
    }, {passive:false});
    dom.addEventListener('touchend', function(){ st.rotating=false; st.pinching=false; }, {passive:false});

    function update(dt){
      var rotDecay=Math.exp(-ROT_DAMP*dt);
      theta += vTheta*dt; phi += vPhi*dt; vTheta*=rotDecay; vPhi*=rotDecay;
      var EPS=0.05; if (phi<EPS) phi=EPS; if (phi>Math.PI-EPS) phi=Math.PI-EPS;
      var k=1.0-Math.exp(-ZOOM_DAMP*dt); radius += (tRadius-radius)*k;
      apply();
    }
    return { update:update, apply:apply, minDistance:minDist, maxDistance:maxDist };
  }
  var controls = createSimpleOrbitControls(renderer.domElement, camera, new THREE.Vector3(0,0,0));

  /* =========================
     LUMIÈRES & PLANÈTE
     ========================= */
  var sun = new THREE.DirectionalLight(0xffffff, 1.18); sun.position.set(-4,6,8); scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xd7f0ff, 0x2a1e1a, 1.1));
  var fill = new THREE.DirectionalLight(0x9fd7ff, 0.38); fill.position.set(5,-2,-6); scene.add(fill);

  function generatePlanetTexture(w, h) {
    w = w || 512; h = h || 256;
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0, '#56b3c9'); g.addColorStop(0.55, '#67c0d5'); g.addColorStop(1, '#4aa3ba');
    ctx.fillStyle = g; ctx.fillRect(0,0,w,h);

    var seed = 1337;
    function rand(n){ return (Math.sin(n*16807 + seed)*43758.5453) % 1; }
    function noise1d(x){ var i=Math.floor(x), f=x-i; var a=rand(i), b=rand(i+1); return a*(1-f)+b*f; }
    ctx.globalAlpha = 0.26;
    for (var y=0; y<h; y++) {
      var v=y/h, band=0.5+0.5*Math.sin((v*3.5+0.15)*Math.PI*2), n=0.5+0.5*noise1d(v*24.0);
      var t=Math.min(1,Math.max(0,band*0.6+n*0.4));
      ctx.fillStyle='rgba(255,255,255,'+(0.16*t)+')'; ctx.fillRect(0,y,w,1);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (var i=0;i<44;i++){
      var cx=Math.random()*w, cy=Math.random()*h, r=12+Math.random()*30;
      var grd=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
      grd.addColorStop(0,'rgba(255,255,255,0.14)'); grd.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
    }
    var tex=new THREE.CanvasTexture(c);
    if (tex.colorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
    return tex;
  }
  var planetGeo = new THREE.SphereGeometry(WORLD.planetRadius, 96, 64);
  var planetMat = new THREE.MeshStandardMaterial({
    map: generatePlanetTexture(512,256),
    color: new THREE.Color('#7ad1e2').convertSRGBToLinear(),
    roughness: 0.74, metalness: 0.1
  });
  var planet = new THREE.Mesh(planetGeo, planetMat); scene.add(planet);
  (function(){
    var pos=planetGeo.attributes.position, v=new THREE.Vector3();
    for(var i=0;i<pos.count;i++){
      v.fromBufferAttribute(pos,i).normalize();
      var p=0.03*(Math.sin(7*v.x)+Math.sin(9*v.y)+Math.sin(11*v.z));
      v.multiplyScalar(WORLD.planetRadius + p);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    planetGeo.computeVertexNormals();
  })();

  (function(){ // étoiles
    var N=2400, a=new Float32Array(3*N);
    for(var i=0;i<N;i++){ var r=70+Math.random()*70, t=Math.acos(Math.random()*2-1), p=Math.random()*Math.PI*2;
      a[3*i]=r*Math.sin(t)*Math.cos(p); a[3*i+1]=r*Math.cos(t); a[3*i+2]=r*Math.sin(t)*Math.sin(p); }
    var g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a,3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, color: 0xffffff })));
  })();

  /* =========================
     OUTILS IMAGE & SEGMENTATION
     ========================= */
  function lin(c){ c/=255; return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4); }
  function dist2(a,b){ var dr=lin(a[0])-lin(b[0]); var dg=lin(a[1])-lin(b[1]); var db=lin(a[2])-lin(b[2]); return dr*dr+dg*dg+db*db; }
  function loadImage(file){ return new Promise(function(res,rej){ var url=URL.createObjectURL(file); var im=new Image(); im.onload=function(){ res(im); }; im.onerror=rej; im.src=url; }); }

  // Couleur "blanc-ish" (pour supprimer un cadre blanc bord à bord)
  function isWhitish(c){
    if(!c) return false;
    var r=c.r, g=c.g, b=c.b, l=0.2126*r + 0.7152*g + 0.0722*b;
    var max=Math.max(r,g,b), min=Math.min(r,g,b), chroma=max-min;
    return (l>0.82 && chroma<0.12);
  }

  function getEdgeBg(data,W,H){
    var m=Math.floor(Math.min(W,H)*.04), skip=Math.floor(H*.18);
    var regs=[{x:0,y:0,w:W,h:m},{x:0,y:m,w:m,h:H-m-skip},{x:W-m,y:m,w:m,h:H-m-skip},{x:0,y:H-m-skip,w:W,h:m}];
    var r=0,g=0,b=0,n=0, t, y, x, i;
    for(var ri=0;ri<regs.length;ri++){ t=regs[ri];
      for(y=t.y;y<t.y+t.h;y++) for(x=t.x;x<t.x+t.w;x++){ i=(y*W+x)*4; r+=data[i]; g+=data[i+1]; b+=data[i+2]; n++; }
    }
    return [r/n,g/n,b/n];
  }

  function kmeans(colors, K, it){
    K = K||4; it = it||9;
    var cents=[], assign=new Array(colors.length), i, k;
    for(k=0;k<K;k++){ var c=colors[Math.floor(colors.length*(k+0.5)/(K+0.5))]; cents.push([c[0],c[1],c[2]]); }
    for(var t=0;t<it;t++){
      for(i=0;i<colors.length;i++){ var best=0,bd=1e9; for(k=0;k<K;k++){ var d=dist2(colors[i],cents[k]); if(d<bd){bd=d; best=k;} } assign[i]=best; }
      var acc=[]; for(k=0;k<K;k++) acc.push([0,0,0,0]);
      for(i=0;i<colors.length;i++){ k=assign[i]; var cc=colors[i];
        acc[k][0]+=cc[0]; acc[k][1]+=cc[1]; acc[k][2]+=cc[2]; acc[k][3]++; }
      for(k=0;k<K;k++){ if(acc[k][3]>0){ cents[k][0]=acc[k][0]/acc[k][3];
        cents[k][1]=acc[k][1]/acc[k][3]; cents[k][2]=acc[k][2]/acc[k][3]; } }
    }
    return { centers:cents, assign:assign };
  }

  function estimateGrid(imgData, W, H, rect, range){
    range = range || [14,80];
    var x=rect.x,y=rect.y,w=rect.w,h=rect.h;
    function get(ix,iy){ var i=((y+iy)*W+(x+ix))*4; return [imgData[i],imgData[i+1],imgData[i+2]]; }
    function changes(len, sample){
      var arr=[], i, j, prev, c;
      for(i=0;i<len;i++){ prev=sample(i,0); c=0; for(j=1;j<len;j++){ var v=sample(i,j); if(dist2(v,prev)>0.01){c++; prev=v;} } arr.push(c); }
      arr.sort(function(a,b){return a-b;}); return arr[Math.floor(arr.length/2)];
    }
    var cols=changes(w, function(i,j){ return get(i, Math.floor(j*h/(w||1))%h); });
    var rows=changes(h, function(i,j){ return get(Math.floor(j*w/(h||1))%w, i); });

    // cellules carrées
    function clamp(n,min,max){ n=Math.max(min,Math.min(max,n)); if(n%2!==0) n++; return n; }
    var cW = w/cols, cH = h/rows, unit = Math.min(cW,cH);
    return { cols:clamp(Math.round(w/unit), range[0], range[1]),
             rows:clamp(Math.round(h/unit), range[0], range[1]) };
  }

  function dilate(bin){
    var r=bin.length, c=bin[0].length, out=bin.map(function(row){return row.slice();});
    function inside(y,x){ return y>=0&&y<r&&x>=0&&x<c; }
    for(var y=0;y<r;y++) for(var x=0;x<c;x++) if(bin[y][x]){
      for(var dy=-1;dy<=1;dy++) for(var dx=-1;dx<=1;dx++){ var ny=y+dy,nx=x+dx; if(inside(ny,nx)) out[ny][nx]=true; }
    }
    return out;
  }
  function erode(bin){
    var r=bin.length, c=bin[0].length, out=bin.map(function(row){return row.slice();});
    function inside(y,x){ return y>=0&&y<r&&x>=0&&x<c; }
    for(var y=0;y<r;y++) for(var x=0;x<c;x++){
      var ok=true;
      for(var dy=-1;dy<=1;dy++) for(var dx=-1;dx<=1;dx++){ var ny=y+dy,nx=x+dx; if(!inside(ny,nx)||!bin[ny][nx]) { ok=false; break; } }
      out[y][x]=ok;
    }
    return out;
  }
  function openBinary(bin){ return dilate(erode(bin)); }
  function closeBinary(bin){ return erode(dilate(bin)); }

  // >>>>>>>>>> HOTFIX ré‑ajouté : garde seulement les grandes composantes (invader)
  function filterLargestComponents(bin){
    var r=bin.length, c=bin[0].length;
    var vis=Array.from({length:r},function(){return Array(c).fill(false);});
    var comp=[], dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]], y,x;
    for(y=0;y<r;y++) for(x=0;x<c;x++){
      if(!bin[y][x] || vis[y][x]) continue;
      var q=[[y,x]]; vis[y][x]=true; var area=0, minY=y, maxY=y, minX=x, maxX=x;
      while(q.length){
        var cur=q.pop(), cy=cur[0], cx=cur[1]; area++;
        if(cy<minY)minY=cy; if(cy>maxY)maxY=cy; if(cx<minX)minX=cx; if(cx>maxX)maxX=cx;
        for(var d=0;d<dirs.length;d++){
          var ny=cy+dirs[d][0], nx=cx+dirs[d][1];
          if(ny>=0&&ny<r&&nx>=0&&nx<c && bin[ny][nx] && !vis[ny][nx]){ vis[ny][nx]=true; q.push([ny,nx]); }
        }
      }
      comp.push({area:area, bbox:{minY:minY,maxY:maxY,minX:minX,maxX:maxX}});
    }
    if(!comp.length) return bin;
    comp.sort(function(a,b){return b.area-a.area;});
    var keep=[], largest=comp[0].area, cum=0;
    for(var i=0;i<comp.length;i++){
      var cc=comp[i];
      if(cc.area >= Math.max(6, largest*0.06)){ keep.push(cc); cum += cc.area; if(cum > largest*1.35) break; }
    }
    var out = bin.map(function(row){ return row.map(function(){return false;}); });
    for(i=0;i<keep.length;i++){
      var bb=keep[i].bbox;
      for(y=bb.minY;y<=bb.maxY;y++) for(x=bb.minX;x<=bb.maxX;x++){
        if(bin[y][x]) out[y][x]=true;
      }
    }
    return out;
  }
  // <<<<<<<<<< HOTFIX

  // Lissage colorimétrique (majorité 3×3)
  function smoothColors(pixels){
    var rows=pixels.length, cols=pixels[0].length;
    var out=Array.from({length:rows}, function(){ return Array(cols).fill(null); });
    var TH=0.0015;
    for(var y=0;y<rows;y++) for(var x=0;x<cols;x++){
      var c=pixels[y][x]; if(!c){ out[y][x]=null; continue; }
      var pals=[], count=[];
      for(var dy=-1;dy<=1;dy++) for(var dx=-1;dx<=1;dx++){
        var ny=y+dy, nx=x+dx; if(ny<0||ny>=rows||nx<0||nx>=cols) continue;
        var n=pixels[ny][nx]; if(!n) continue;
        var found=-1;
        for(var i=0;i<pals.length;i++){
          var p=pals[i]; var d=(p.r-n.r)*(p.r-n.r)+(p.g-n.g)*(p.g-n.g)+(p.b-n.b)*(p.b-n.b);
          if(d<TH){ found=i; break; }
        }
        if(found===-1){ pals.push(n); count.push(1); } else count[found]++;
      }
      var maxI=0; for(var i=1;i<count.length;i++) if(count[i]>count[maxI]) maxI=i;
      out[y][x] = (count[maxI] >= 4) ? pals[maxI] : c;
    }
    return out;
  }

  function downsamplePixels(pixels, factor){
    if(factor<=1) return pixels;
    var rows=pixels.length, cols=pixels[0].length;
    var R=Math.ceil(rows/factor), C=Math.ceil(cols/factor);
    var out=Array.from({length:R}, function(){ return Array(C).fill(null); });
    for(var gy=0;gy<R;gy++) for(var gx=0;gx<C;gx++){
      var Rsum=0,Gsum=0,Bsum=0,N=0;
      for(var y=gy*factor; y<Math.min(rows,(gy+1)*factor); y++)
        for(var x=gx*factor; x<Math.min(cols,(gx+1)*factor); x++){
          var cl=pixels[y][x]; if(!cl) continue; Rsum+=cl.r; Gsum+=cl.g; Bsum+=cl.b; N++;
        }
      if(N>0) out[gy][gx]={r:Rsum/N,g:Gsum/N,b:Bsum/N};
    }
    return out;
  }

  // HSV helpers + boost couleur
  function hsv2rgb(h,s,v){ var i=Math.floor(h*6), f=h*6-i, p=v*(1-s), q=v*(1-f*s), t=v*(1-(1-f)*s), m=i%6;
    return {r:[v,q,p,p,t,v][m], g:[t,v,v,q,p,p][m], b:[p,p,t,v,v,q][m]}; }
  function rgb2hsv(r,g,b){ var max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min, h=0;
    if(d!==0){ if(max===r) h=((g-b)/d)%6; else if(max===g) h=(b-r)/d+2; else h=(r-g)/d+4; h/=6; if(h<0) h+=1; }
    return {h:h,s:max===0?0:d/max,v:max}; }
  function boostColor(c){ var hsv=rgb2hsv(c.r,c.g,c.b); var SAT=0.12, GAMMA=0.92;
    hsv.s=Math.min(1,hsv.s*(1+SAT)); hsv.v=Math.pow(hsv.v,GAMMA); return hsv2rgb(hsv.h,hsv.s,hsv.v); }

  async function imageToPixelMatrix(file, budget){
    var img=await loadImage(file);
    var maxSide=1200, scl=Math.min(1, maxSide/Math.max(img.naturalWidth,img.naturalHeight));
    var W=Math.round(img.naturalWidth*scl), H=Math.round(img.naturalHeight*scl);
    var cnv=document.createElement('canvas'); cnv.width=W; cnv.height=H;
    var ctx=cnv.getContext('2d', { willReadFrequently:true });
    ctx.drawImage(img,0,0,W,H);
    var data = ctx.getImageData(0,0,W,H).data;

    var bgEdge=getEdgeBg(data,W,H);
    var TH=0.012; var minX=W,minY=H,maxX=0,maxY=0;
    var skipB=Math.floor(H*.18), m=Math.floor(Math.min(W,H)*.04);
    for(var y=m;y<H-skipB;y++) for(var x=m;x<W-m;x++){
      var i=(y*W+x)*4; var px=[data[i],data[i+1],data[i+2]];
      if(dist2(px,bgEdge)>TH){ if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y; }
    }
    if(minX>=maxX||minY>=maxY) throw new Error('Invader non détecté.');
    var rect={x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};

    var cols=[], yy, xx;
    for(yy=0;yy<rect.h;yy+=2) for(xx=0;xx<rect.w;xx+=2){ var ii=((rect.y+yy)*W+(rect.x+xx))*4; cols.push([data[ii],data[ii+1],data[ii+2]]); }
    var km=kmeans(cols,4,9);
    var bgk=0,bd=1e9; for(var k=0;k<km.centers.length;k++){ var d=dist2(km.centers[k], bgEdge); if(d<bd){bd=d; bgk=k;} }

    var grid = estimateGrid(data, W, H, rect, [14,80]);
    var cellW=rect.w/grid.cols, cellH=rect.h/grid.rows;

    var bin=Array.from({length:grid.rows}, function(){return Array(grid.cols).fill(false);});
    var colsRGB=Array.from({length:grid.rows}, function(){return Array(grid.cols).fill(null);});
    var keepTH=0.008;

    // Échantillonnage CENTRAL (évite les joints)
    var inner=0.20;
    for(var gy=0;gy<grid.rows;gy++){
      for(var gx=0;gx<grid.cols;gx++){
        var x0=Math.floor(rect.x+gx*cellW), y0=Math.floor(rect.y+gy*cellH);
        var x1=Math.min(W, Math.floor(rect.x+(gx+1)*cellW));
        var y1=Math.min(H, Math.floor(rect.y+(gy+1)*cellH));
        var ix0 = Math.floor(x0 + (x1-x0)*inner), ix1 = Math.ceil(x1 - (x1-x0)*inner);
        var iy0 = Math.floor(y0 + (y1-y0)*inner), iy1 = Math.ceil(y1 - (y1-y0)*inner);
        if(ix1<=ix0 || iy1<=iy0){ ix0=x0; ix1=x1; iy0=y0; iy1=y1; } // fallback si cellule minuscule

        var r=0,g=0,b=0,n=0;
        for(y=iy0;y<iy1;y++) for(x=ix0;x<ix1;x++){ var idx=(y*W+x)*4; r+=data[idx]; g+=data[idx+1]; b+=data[idx+2]; n++; }
        var c=[r/n,g/n,b/n];
        if(dist2(c, km.centers[bgk])>keepTH){ bin[gy][gx]=true; colsRGB[gy][gx]={r:c[0]/255,g:c[1]/255,b:c[2]/255}; }
      }
    }

    var cleaned = closeBinary(openBinary(bin));
    cleaned = filterLargestComponents(cleaned); // <<< la fonction est maintenant définie

    // Recadrage silhouette
    var minY=cleaned.length, minX2=cleaned[0].length, maxY2=0, maxX2=0, any=false, x, y;
    for(y=0;y<cleaned.length;y++) for(x=0;x<cleaned[0].length;x++) if(cleaned[y][x]){
      any=true; if(y<minY)minY=y; if(y>maxY2)maxY2=y; if(x<minX2)minX2=x; if(x>maxX2)maxX2=x;
    }
    if(!any) throw new Error('Silhouette trop faible. Essaie une photo plus frontale.');
    var croppedH=maxY2-minY+1, croppedW=maxX2-minX2+1;

    var pixels=Array.from({length:croppedH}, function(){return Array(croppedW).fill(null);});
    for(y=0;y<croppedH;y++) for(x=0;x<croppedW;x++){
      var Y=y+minY, X=x+minX2;
      if(cleaned[Y][X]){
        if(colsRGB[Y][X]) pixels[y][x]=colsRGB[Y][X];
        else {
          var R=0,G=0,B=0,N=0;
          for(var dy=-1;dy<=1;dy++) for(var dx=-1;dx<=1;dx++){
            var ny=Y+dy, nx=X+dx;
            if(ny>=0&&ny<grid.rows&&nx>=0&&nx<grid.cols&&colsRGB[ny][nx]){ R+=colsRGB[ny][nx].r; G+=colsRGB[ny][nx].g; B+=colsRGB[ny][nx].b; N++; }
          }
          if(N>0) pixels[y][x]={r:R/N,g:G/N,b:B/N};
        }
      }
    }

    // Suppression cadres blancs (flood-fill depuis les bords)
    var R=croppedH, C=croppedW, seen=Array.from({length:R},function(){return Array(C).fill(false);});
    function inB(y,x){ return y>=0&&y<R&&x>=0&&x<C; }
    function flood(y0,x0){
      var q=[[y0,x0]]; seen[y0][x0]=true;
      while(q.length){
        var t=q.pop(), yy=t[0], xx=t[1];
        if(pixels[yy][xx] && isWhitish(pixels[yy][xx])) pixels[yy][xx]=null;
        var dirs=[[1,0],[-1,0],[0,1],[0,-1]];
        for(var d=0;d<4;d++){
          var ny=yy+dirs[d][0], nx=xx+dirs[d][1];
          if(inB(ny,nx) && !seen[ny][nx] && pixels[ny][nx] && isWhitish(pixels[ny][nx])){ seen[ny][nx]=true; q.push([ny,nx]); }
        }
      }
    }
    for(x=0;x<C;x++){ if(pixels[0][x]&&isWhitish(pixels[0][x])) flood(0,x); if(pixels[R-1][x]&&isWhitish(pixels[R-1][x])) flood(R-1,x); }
    for(y=0;y<R;y++){ if(pixels[y][0]&&isWhitish(pixels[y][0])) flood(y,0); if(pixels[y][C-1]&&isWhitish(pixels[y][C-1])) flood(y,C-1); }

    pixels = smoothColors(pixels);

    // LOD
    var vox=0; for(y=0;y<pixels.length;y++) for(x=0;x<pixels[0].length;x++) if(pixels[y][x]) vox++;
    var budgetV = budget || 1600;
    if(vox > budgetV){ var factor = Math.ceil(Math.sqrt(vox / budgetV)); pixels = downsamplePixels(pixels, factor); }
    return pixels;
  }

  /* =========================
     INVADER 3D (instanced)
     ========================= */
  function buildInvaderMesh(pixelGrid){
    var rows=pixelGrid.length, cols=pixelGrid[0].length;
    var size=WORLD.invaderScale, gap=size*WORLD.spacingRatio, depth=size*WORLD.depthFactor;

    var geom=new THREE.BoxGeometry(size-gap, size-gap, depth);
    var colAttr=new Float32Array(geom.attributes.position.count*3);
    for(var i=0;i<geom.attributes.position.count;i++){
      var z=geom.attributes.position.getZ(i); var shade=z<0?0.82:1.0;
      colAttr[3*i]=shade; colAttr[3*i+1]=shade; colAttr[3*i+2]=shade;
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colAttr,3));
    var mat=new THREE.MeshStandardMaterial({
      roughness:0.46, metalness:0.06, vertexColors:true, flatShading:true,
      color:0xffffff, emissive:0x151515, emissiveIntensity:0.18
    });

    var mesh=new THREE.InstancedMesh(geom, mat, rows*cols);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    var dummy=new THREE.Object3D();
    var w=cols*size,h=rows*size;
    var x0=-w/2+size/2, y0=-h/2+size/2;
    var idx=0;
    for(var y=0;y<rows;y++) for(var x=0;x<cols;x++){
      var c=pixelGrid[y][x]; if(!c) continue;

      var srgb = boostColor({r:c.r,g:c.g,b:c.b});
      var col = new THREE.Color(srgb.r, srgb.g, srgb.b);
      if (col.convertSRGBToLinear) col.convertSRGBToLinear();

      dummy.position.set(x0 + x*size, y0 + (rows-1-y)*size, 0);
      dummy.rotation.set(0,0,0); dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
      mesh.setColorAt(idx, col);
      idx++;
    }
    mesh.count=idx; if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true;

    return { mesh:mesh, width:w, height:h, depth:depth };
  }

  /* =========================
     AGENTS (déplacement tangent)
     ========================= */
  function alignZAxisTo(obj, normal){
    var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), normal.clone().normalize());
    obj.quaternion.copy(q);
  }
  function createWanderer(invader){
    var g=new THREE.Group(); g.add(invader.mesh);
    var targetWorldSize = WORLD.invaderMaxWorldSize * (WORLD.planetRadius*2);
    var maxDim = Math.max(invader.width, invader.height);
    var scale = targetWorldSize / maxDim; g.scale.setScalar(scale);

    var normal=new THREE.Vector3().randomDirection();
    var hover = (invader.depth*scale)/2 + WORLD.hoverMargin;
    var radiusOffset = WORLD.planetRadius + hover;
    g.position.copy(normal).multiplyScalar(radiusOffset);
    alignZAxisTo(g, normal);
    g.rotateOnAxis(new THREE.Vector3(0,0,1), Math.random()*Math.PI*2);

    var axis=new THREE.Vector3().randomDirection();
    var baseSpeed = 0.08 + Math.random()*0.06;
    var rot=new THREE.Quaternion();

    return {
      object: g, normal: normal, axis: axis, radiusOffset: radiusOffset, baseSpeed: baseSpeed,
      update: function(dt, peers, speedFactor){
        var push=new THREE.Vector3();
        for(var i=0;i<peers.length;i++){ var p=peers[i]; if(p===this) continue;
          var d=this.object.position.clone().sub(p.object.position); var L=d.length();
          if(L<0.001) continue;
          if(L<WORLD.repelRadius) push.add(d.multiplyScalar((WORLD.repelRadius-L)/WORLD.repelRadius));
        }
        if(push.lengthSq()>0){ this.axis.add(push.normalize().multiplyScalar(0.02)).normalize(); }

        rot.setFromAxisAngle(this.axis, this.baseSpeed * speedFactor * dt);
        this.normal.applyQuaternion(rot).normalize();

        this.object.position.copy(this.normal).multiplyScalar(this.radiusOffset);
        alignZAxisTo(this.object, this.normal);

        var t=performance.now()*0.001;
        this.object.position.addScaledVector(this.normal, Math.sin(t*1.6 + this.normal.x*5.1)*0.003);
      }
    };
  }

  /* =========================
     UI & IMPORT
     ========================= */
  var addBtn=document.getElementById('addBtn'), countLbl=document.getElementById('count'), speedSlider=document.getElementById('speed');
  var agents=[], globalSpeedFactor = Number(speedSlider.value)/100;
  function updateCount(){ var n=agents.length; countLbl.textContent = n + (n>1?' invaders':' invader'); }
  speedSlider.addEventListener('input', function(){ globalSpeedFactor = Number(speedSlider.value)/100; });

  function handleFiles(files){
    var arr = Array.prototype.slice.call(files);
    (async function(){
      for (var i=0;i<arr.length;i++){
        try {
          var px=await imageToPixelMatrix(arr[i], voxelsBudget(agents.length));
          var built=buildInvaderMesh(px);
          var agent=createWanderer(built);
          scene.add(agent.object);
          agents.push(agent); updateCount();
        } catch(err){
          var el=document.getElementById('error'); el.textContent=err.message||String(err); el.style.display='block';
        }
      }
    })();
  }

  function openPicker(){
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
    input.style.position='fixed'; input.style.left='-10000px'; input.style.top='-10000px';
    document.body.appendChild(input);
    input.addEventListener('change', function(e){
      try { handleFiles(e.target.files); } finally { document.body.removeChild(input); }
    }, { once:true });
    input.click();
  }

  addBtn.addEventListener('click', function(e){ e.preventDefault(); openPicker(); }, { passive:false });
  addBtn.addEventListener('touchstart', function(e){ e.preventDefault(); }, { passive:false });
  addBtn.addEventListener('touchend', function(e){ e.preventDefault(); openPicker(); }, { passive:false });

  /* =========================
     BOUCLE
     ========================= */
  var clock=new THREE.Clock();
  function loop(){
    var dt=clock.getDelta();
    controls.update(dt);
    for (var i=0;i<agents.length;i++) agents[i].update(dt, agents, globalSpeedFactor);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  loop();

  window.addEventListener('resize', function(){
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    controls.apply();
  });
})();