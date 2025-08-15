/* global THREE */

/* -------- Overlay d'erreur ---------- */
(function(){
  var box = document.getElementById('error');
  function show(msg){ try{ box.textContent = String(msg); box.style.display = 'block'; }catch(_e){} }
  window.addEventListener('error', function(e){ show(e.message || e.error || 'Erreur JS'); });
  window.addEventListener('unhandledrejection', function(e){ var r=e&&e.reason; show((r&&(r.message||r))||'Unhandled rejection'); });
})();

(function(){
  'use strict';
  if (!window.THREE || !THREE.WebGLRenderer) {
    var el=document.getElementById('error');
    el.textContent='Three.js n’a pas chargé (réseau/cache). Recharge la page.';
    el.style.display='block'; return;
  }

  /* ====== CONFIG ====== */
  var DPR = Math.min(window.devicePixelRatio||1, 1.5);
  var WORLD = {
    planetRadius: 3.2,
    invaderScale: 0.022,
    depthFactor: 0.95,
    spacingRatio: 0.01,
    repelRadius: 0.35,
    hoverMargin: 0.11,
    invaderMaxWorldSize: 0.10
  };

  function voxelsBudget(n){
    if (n < 10)  return 4900;  // ~70x70 (ultra net quand peu d’invaders)
    if (n < 20)  return 3600;  // ~60x60
    if (n < 50)  return 2600;  // ~51x51
    if (n < 120) return 1600;  // ~40x40
    if (n < 300) return 900;   // ~30x30
    return 256;                // ~16x16 (pour 500+ invaders)
  }

  /* ====== RENDERER/SCÈNE/CAMÉRA ====== */
  var canvas=document.getElementById('scene');
  var renderer=new THREE.WebGLRenderer({canvas, antialias:false, alpha:false, powerPreference:'default'});
  var gl=renderer.getContext();
  if(!gl){ var el=document.getElementById('error'); el.textContent='WebGL non dispo.'; el.style.display='block'; }
  renderer.setPixelRatio(DPR);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.6;

  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.2, 200);

  /* ====== Contrôles (inversion verticale + inertie) ====== */
  function createSimpleOrbitControls(dom, cam, target) {
    var minDist=WORLD.planetRadius*1.05, maxDist=WORLD.planetRadius*4.5;
    var radius=WORLD.planetRadius*2.0, theta=Math.PI/6, phi=Math.PI/2.2;
    var tRadius=radius, vTheta=0, vPhi=0, ROT_SENS=3.2, ROT_DAMP=8.0, ZOOM_DAMP=9.0;

    function apply(){
      var sinPhi=Math.sin(phi), cosPhi=Math.cos(phi);
      var sinTh=Math.sin(theta), cosTh=Math.cos(theta);
      cam.position.set(radius*sinPhi*sinTh, radius*cosPhi, radius*sinPhi*cosTh);
      cam.lookAt(target);
    } apply();

    var st={rotating:false,sx:0,sy:0,pinching:false,d0:0,r0:radius};
    dom.addEventListener('mousedown', e=>{e.preventDefault(); st.rotating=true; st.sx=e.clientX; st.sy=e.clientY;},{passive:false});
    window.addEventListener('mousemove', e=>{
      if(!st.rotating) return; e.preventDefault();
      var dx=(e.clientX-st.sx)/dom.clientWidth, dy=(e.clientY-st.sy)/dom.clientHeight;
      vTheta += -dx*ROT_SENS*Math.PI; vPhi += -dy*ROT_SENS*Math.PI; // inversion verticale
      st.sx=e.clientX; st.sy=e.clientY;
    }, {passive:false});
    window.addEventListener('mouseup', ()=>{st.rotating=false;});

    dom.addEventListener('wheel', e=>{e.preventDefault(); var s=Math.exp(e.deltaY*0.001);
      tRadius=Math.max(minDist,Math.min(maxDist,radius*s));},{passive:false});

    dom.addEventListener('touchstart', e=>{
      if(e.touches.length===1){ st.rotating=true; st.sx=e.touches[0].clientX; st.sy=e.touches[0].clientY; }
      else if(e.touches.length===2){
        st.pinching=true; var dx=e.touches[0].clientX-e.touches[1].clientX, dy=e.touches[0].clientY-e.touches[1].clientY;
        st.d0=Math.hypot(dx,dy); st.r0=radius;
      }
    }, {passive:false});
    dom.addEventListener('touchmove', e=>{
      if(st.pinching && e.touches.length===2){
        e.preventDefault(); var dx=e.touches[0].clientX-e.touches[1].clientX, dy=e.touches[0].clientY-e.touches[1].clientY;
        var d=Math.hypot(dx,dy), scale=st.d0/d; tRadius=Math.max(minDist,Math.min(maxDist,st.r0*scale));
      } else if(st.rotating && e.touches.length===1){
        e.preventDefault(); var dx=(e.touches[0].clientX-st.sx)/dom.clientWidth, dy=(e.touches[0].clientY-st.sy)/dom.clientHeight;
        vTheta += -dx*ROT_SENS*Math.PI; vPhi += -dy*ROT_SENS*Math.PI;
        st.sx=e.touches[0].clientX; st.sy=e.touches[0].clientY;
      }
    }, {passive:false});
    dom.addEventListener('touchend', ()=>{ st.rotating=false; st.pinching=false; }, {passive:false});

    function update(dt){
      var rotDecay=Math.exp(-ROT_DAMP*dt); theta+=vTheta*dt; phi+=vPhi*dt; vTheta*=rotDecay; vPhi*=rotDecay;
      var EPS=0.05; if(phi<EPS)phi=EPS; if(phi>Math.PI-EPS)phi=Math.PI-EPS;
      var k=1.0-Math.exp(-ZOOM_DAMP*dt); radius += (tRadius-radius)*k; apply();
    }
    return {update, apply, minDistance:minDist, maxDistance:maxDist};
  }
  var controls=createSimpleOrbitControls(renderer.domElement, camera, new THREE.Vector3(0,0,0));

  /* ====== Lumières / Planète / Étoiles ====== */
  var sun=new THREE.DirectionalLight(0xffffff,1.18); sun.position.set(-4,6,8); scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xd7f0ff,0x2a1e1a,1.1));
  var fill=new THREE.DirectionalLight(0x9fd7ff,0.38); fill.position.set(5,-2,-6); scene.add(fill);

  function generatePlanetTexture(w,h){
    w=w||512; h=h||256;
    var c=document.createElement('canvas'); c.width=w; c.height=h;
    var ctx=c.getContext('2d');
    var g=ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#56b3c9'); g.addColorStop(0.55,'#67c0d5'); g.addColorStop(1,'#4aa3ba');
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    var seed=1337; function rand(n){return (Math.sin(n*16807+seed)*43758.5453)%1;}
    function noise1d(x){var i=Math.floor(x),f=x-i; var a=rand(i),b=rand(i+1);return a*(1-f)+b*f;}
    ctx.globalAlpha=.26;
    for(var y=0;y<h;y++){
      var v=y/h, band=.5+.5*Math.sin((v*3.5+.15)*Math.PI*2), n=.5+.5*noise1d(v*24.0);
      var t=Math.min(1,Math.max(0,band*.6+n*.4));
      ctx.fillStyle='rgba(255,255,255,'+(0.16*t)+')'; ctx.fillRect(0,y,w,1);
    }
    ctx.globalAlpha=1;
    ctx.fillStyle='rgba(255,255,255,0.07)';
    for(var i=0;i<44;i++){
      var cx=Math.random()*w, cy=Math.random()*h, r=12+Math.random()*30;
      var grd=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
      grd.addColorStop(0,'rgba(255,255,255,0.14)'); grd.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
    }
    var tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace; tex.wrapS=tex.wrapT=THREE.MirroredRepeatWrapping; return tex;
  }

  var planetGeo=new THREE.SphereGeometry(WORLD.planetRadius,96,64);
  var planetMat=new THREE.MeshStandardMaterial({
    map: generatePlanetTexture(512,256),
    color: new THREE.Color('#7ad1e2').convertSRGBToLinear(),
    roughness:.74, metalness:.1
  });
  var planet=new THREE.Mesh(planetGeo,planetMat); scene.add(planet);

  // Relief — doit être identique à celui utilisé pour l'altitude no‑clip
  var BUMP_SCALE=0.03;
  function planetBump(n){ return BUMP_SCALE*(Math.sin(7*n.x)+Math.sin(9*n.y)+Math.sin(11*n.z)); }
  (function(){
    var pos=planetGeo.attributes.position, v=new THREE.Vector3();
    for(var i=0;i<pos.count;i++){
      v.fromBufferAttribute(pos,i).normalize();
      var p=planetBump(v); v.multiplyScalar(WORLD.planetRadius + p);
      pos.setXYZ(i,v.x,v.y,v.z);
    }
    planetGeo.computeVertexNormals();
  })();

  (function(){ // étoiles
    var N=2400, a=new Float32Array(3*N);
    for(var i=0;i<N;i++){ var r=70+Math.random()*70,t=Math.acos(Math.random()*2-1),p=Math.random()*Math.PI*2;
      a[3*i]=r*Math.sin(t)*Math.cos(p); a[3*i+1]=r*Math.cos(t); a[3*i+2]=r*Math.sin(t)*Math.sin(p); }
    var g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a,3));
    scene.add(new THREE.Points(g,new THREE.PointsMaterial({size:1.5,sizeAttenuation:false,color:0xffffff})));
  })();

  /* ====== OUTILS IMAGE (Edge‑Pro Hi‑Def) ====== */
  function lin255(c){ c/=255; return (c<=0.04045)?(c/12.92):Math.pow((c+0.055)/1.055,2.4); }
  function dist2(a,b){ var dr=lin255(a[0])-lin255(b[0]), dg=lin255(a[1])-lin255(b[1]), db=lin255(a[2])-lin255(b[2]); return dr*dr+dg*dg+db*db; }
  function s2l(u){ return (u<=0.04045)?(u/12.92):Math.pow((u+0.055)/1.055,2.4); }
  function loadImage(file){ return new Promise(function(res,rej){ var url=URL.createObjectURL(file); var im=new Image(); im.onload=function(){res(im)}; im.onerror=rej; im.src=url; }); }
  function isWhitish(c){ if(!c)return false; var r=c.r,g=c.g,b=c.b; var l=.2126*r+.7152*g+.0722*b; var chroma=Math.max(r,g,b)-Math.min(r,g,b); return (l>0.75 && chroma<0.20); }

  function getEdgeBg(data,W,H){
    var m=Math.floor(Math.min(W,H)*.04), skip=Math.floor(H*.18);
    var regs=[{x:0,y:0,w:W,h:m},{x:0,y:m,w:m,h:H-m-skip},{x:W-m,y:m,w:m,h:H-m-skip},{x:0,y:H-m-skip,w:W,h:m}];
    var r=0,g=0,b=0,n=0,t,y,x,i;
    for(var ri=0;ri<regs.length;ri++){ t=regs[ri];
      for(y=t.y;y<t.y+t.h;y++) for(x=t.x;x<t.x+t.w;x++){ i=(y*W+x)*4; r+=data[i]; g+=data[i+1]; b+=data[i+2]; n++; }
    }
    return [r/n,g/n,b/n];
  }

  function kmeans(colors,K,it){
    K=K||4; it=it||9; var cents=[],assign=new Array(colors.length),i,k;
    for(k=0;k<K;k++){ var c=colors[Math.floor(colors.length*(k+0.5)/(K+0.5))]; cents.push([c[0],c[1],c[2]]); }
    for(var t=0;t<it;t++){
      for(i=0;i<colors.length;i++){ var best=0,bd=1e9; for(k=0;k<K;k++){ var d=dist2(colors[i],cents[k]); if(d<bd){bd=d; best=k;} } assign[i]=best; }
      var acc=[]; for(k=0;k<K;k++) acc.push([0,0,0,0]);
      for(i=0;i<colors.length;i++){ k=assign[i]; var cc=colors[i]; acc[k][0]+=cc[0]; acc[k][1]+=cc[1]; acc[k][2]+=cc[2]; acc[k][3]++; }
      for(k=0;k<K;k++){ if(acc[k][3]>0){ cents[k][0]=acc[k][0]/acc[k][3]; cents[k][1]=acc[k][1]/acc[k][3]; cents[k][2]=acc[k][2]/acc[k][3]; } }
    }
    return {centers:cents, assign:assign};
  }

  function estimateGrid(imgData,W,H,rect,range){
    range=range||[14,80];
    var x=rect.x,y=rect.y,w=rect.w,h=rect.h;
    function get(ix,iy){ var i=((y+iy)*W+(x+ix))*4; return [imgData[i],imgData[i+1],imgData[i+2]]; }
    function changes(len,sample){
      var arr=[],i,j,prev,c; for(i=0;i<len;i++){ prev=sample(i,0); c=0; for(j=1;j<len;j++){ var v=sample(i,j); if(dist2(v,prev)>0.01){c++; prev=v;} } arr.push(c); }
      arr.sort(function(a,b){return a-b;}); return arr[Math.floor(arr.length/2)];
    }
    var cols=changes(w, function(i,j){ return get(i, Math.floor(j*h/(w||1))%h); });
    var rows=changes(h, function(i,j){ return get(Math.floor(j*w/(h||1))%w, i); });
    function clamp(n,min,max){ n=Math.max(min,Math.min(max,n)); if(n%2!==0) n++; return n; }
    var cW=w/cols, cH=h/rows, unit=Math.min(cW,cH);
    return { cols:clamp(Math.round(w/unit),range[0],range[1]),
             rows:clamp(Math.round(h/unit),range[0],range[1]) };
  }

  function dilate(bin){ var r=bin.length,c=bin[0].length,out=bin.map(row=>row.slice());
    function inside(y,x){return y>=0&&y<r&&x>=0&&x<c;}
    for(var y=0;y<r;y++)for(var x=0;x<c;x++)if(bin[y][x])
      for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){ var ny=y+dy,nx=x+dx; if(inside(ny,nx)) out[ny][nx]=true; }
    return out; }
  function erode(bin){ var r=bin.length,c=bin[0].length,out=bin.map(row=>row.slice());
    function inside(y,x){return y>=0&&y<r&&x>=0&&x<c;}
    for(var y=0;y<r;y++)for(var x=0;x<c;x++){ var ok=true;
      for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){ var ny=y+dy,nx=x+dx; if(!inside(ny,nx)||!bin[ny][nx]){ok=false;break;} }
      out[y][x]=ok; }
    return out; }
  function closeBinary(bin){ return erode(dilate(bin)); } // (on n’“open” plus)

  function filterLargestComponents(bin){
    var r=bin.length,c=bin[0].length,vis=Array.from({length:r},()=>Array(c).fill(false)),comp=[],dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for(var y=0;y<r;y++)for(var x=0;x<c;x++){
      if(!bin[y][x]||vis[y][x]) continue; var q=[[y,x]]; vis[y][x]=true; var area=0,minY=y,maxY=y,minX=x,maxX=x;
      while(q.length){ var cur=q.pop(),cy=cur[0],cx=cur[1]; area++;
        if(cy<minY)minY=cy; if(cy>maxY)maxY=cy; if(cx<minX)minX=cx; if(cx>maxX)maxX=cx;
        for(var d=0;d<dirs.length;d++){ var ny=cy+dirs[d][0], nx=cx+dirs[d][1];
          if(ny>=0&&ny<r&&nx>=0&&nx<c && bin[ny][nx] && !vis[ny][nx]){ vis[ny][nx]=true; q.push([ny,nx]); } } }
      comp.push({area, bbox:{minY,maxY,minX,maxX}});
    }
    if(!comp.length) return bin;
    comp.sort((a,b)=>b.area-a.area);
    var keep=[], largest=comp[0].area, cum=0;
    for(var i=0;i<comp.length;i++){ var cc=comp[i];
      if(cc.area >= Math.max(6, largest*0.06)){ keep.push(cc); cum+=cc.area; if(cum>largest*1.35) break; } }
    var out=bin.map(row=>row.map(()=>false));
    for(i=0;i<keep.length;i++){ var bb=keep[i].bbox;
      for(var y2=bb.minY;y2<=bb.maxY;y2++) for(var x2=bb.minX;x2<=bb.maxX;x2++){ if(bin[y2][x2]) out[y2][x2]=true; } }
    return out;
  }

  function purgeFromEdgesByPredicate(pixels,predicate){
    var R=pixels.length,C=pixels[0].length,seen=Array.from({length:R},()=>Array(C).fill(false));
    function inB(y,x){return y>=0&&y<R&&x>=0&&x<C;}
    function flood(y0,x0){ var q=[[y0,x0]]; seen[y0][x0]=true;
      while(q.length){ var t=q.pop(),yy=t[0],xx=t[1];
        if(pixels[yy][xx] && predicate(pixels[yy][xx])) pixels[yy][xx]=null;
        var dirs=[[1,0],[-1,0],[0,1],[0,-1]];
        for(var d=0;d<4;d++){ var ny=yy+dirs[d][0], nx=xx+dirs[d][1];
          if(inB(ny,nx)&&!seen[ny][nx]&&pixels[ny][nx]&&predicate(pixels[ny][nx])){ seen[ny][nx]=true; q.push([ny,nx]); } } } }
    for(var x=0;x<C;x++){ if(pixels[0][x]) flood(0,x); if(pixels[R-1][x]) flood(R-1,x); }
    for(var y=0;y<R;y++){ if(pixels[y][0]) flood(y,0); if(pixels[y][C-1]) flood(y,C-1); }
  }
  function purgeEdgeWhitish(pixels){ purgeFromEdgesByPredicate(pixels, isWhitish); }
  function purgeEdgeByBg(pixels,bgSRGB,thrLin){
    var bg={r:bgSRGB.r,g:bgSRGB.g,b:bgSRGB.b}, t2=thrLin*thrLin;
    function nearBg(c){ var dr=s2l(c.r)-s2l(bg.r), dg=s2l(c.g)-s2l(bg.g), db=s2l(c.b)-s2l(bg.b); return (dr*dr+dg*dg+db*db)<t2; }
    purgeFromEdgesByPredicate(pixels, nearBg);
  }

  function pruneLonely(pixels,minSame){
    var rows=pixels.length,cols=pixels[0].length,out=Array.from({length:rows},()=>Array(cols).fill(null));
    for(var y=0;y<rows;y++) for(var x=0;x<cols;x++){
      var c=pixels[y][x]; if(!c){out[y][x]=null; continue;}
      var same=0; for(var dy=-1;dy<=1;dy++) for(var dx=-1;dx<=1;dx++){
        if(!dx&&!dy) continue; var ny=y+dy,nx=x+dx; if(ny<0||ny>=rows||nx<0||nx>=cols) continue;
        var n=pixels[ny][nx]; if(!n) continue; var dd=(c.r-n.r)*(c.r-n.r)+(c.g-n.g)*(c.g-n.g)+(c.b-n.b)*(c.b-n.b);
        if(dd<0.002) same++; }
      out[y][x]=(same>=minSame)?c:null;
    }
    return out;
  }

  function hsv2rgb(h,s,v){var i=Math.floor(h*6),f=h*6-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s),m=i%6;return{r:[v,q,p,p,t,v][m],g:[t,v,v,q,p,p][m],b:[p,p,t,v,v,q][m]};}
  function rgb2hsv(r,g,b){var max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,h=0;if(d!==0){if(max===r)h=((g-b)/d)%6;else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h/=6;if(h<0)h+=1;}return{h:h,s:max===0?0:d/max,v:max};}
  function boostColor(c){var hsv=rgb2hsv(c.r,c.g,c.b); var SAT=0.12,GAMMA=0.92; hsv.s=Math.min(1,hsv.s*(1+SAT)); hsv.v=Math.pow(hsv.v,GAMMA); return hsv2rgb(hsv.h,hsv.s,hsv.v);}

  async function imageToPixelMatrix(file,budget){
    var img=await loadImage(file);
    var maxSide=1200, scl=Math.min(1, maxSide/Math.max(img.naturalWidth,img.naturalHeight));
    var W=Math.round(img.naturalWidth*scl), H=Math.round(img.naturalHeight*scl);
    var cnv=document.createElement('canvas'); cnv.width=W; cnv.height=H;
    var ctx=cnv.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(img,0,0,W,H);
    var data=ctx.getImageData(0,0,W,H).data;

    // rectangle d'intérêt
    var bgEdge=getEdgeBg(data,W,H), TH=0.012, minX=W,minY=H,maxX=0,maxY=0;
    var skipB=Math.floor(H*.18), m=Math.floor(Math.min(W,H)*.04);
    for(var y=m;y<H-skipB;y++) for(var x=m;x<W-m;x++){
      var i=(y*W+x)*4, px=[data[i],data[i+1],data[i+2]];
      if(dist2(px,bgEdge)>TH){ if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y; }
    }
    if(minX>=maxX||minY>=maxY) throw new Error('Invader non détecté.');
    var rect={x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};

    // Clusters couleur
    var cols=[], yy, xx; for(yy=0;yy<rect.h;yy+=2) for(xx=0;xx<rect.w;xx+=2){ var ii=((rect.y+yy)*W+(rect.x+xx))*4; cols.push([data[ii],data[ii+1],data[ii+2]]); }
    var km=kmeans(cols,4,9); // 4 clusters
    var bgk=0,bd=1e9; for(var k=0;k<km.centers.length;k++){ var d=dist2(km.centers[k],bgEdge); if(d<bd){bd=d; bgk=k;} }

    // Grille
    var grid=estimateGrid(data,W,H,rect,[14,80]);
    var cellW=rect.w/grid.cols, cellH=rect.h/grid.rows;

    // --- Hi‑Def par samples multiples ---
    var bin=Array.from({length:grid.rows},()=>Array(grid.cols).fill(false));
    var colsRGB=Array.from({length:grid.rows},()=>Array(grid.cols).fill(null));

    var KEEP_BG_DIFF = 0.006;      // seuil de distance au fond (plus permissif)
    var CELL_MARGIN  = 0.18;       // marge interne (moins serrée qu'avant)
    var SAMPLE_GRID  = 3;          // 3x3 points par cellule
    var FG_VOTE_RATIO= 0.36;       // % min de votes “avant‑plan”

    function sampleAt(ix,iy){ var idx=(iy*W+ix)*4; return [data[idx],data[idx+1],data[idx+2]]; }
    function nearestCenterIndex(rgb){
      var best=0,bd=1e9; for(var k=0;k<km.centers.length;k++){ var d=dist2(rgb,km.centers[k]); if(d<bd){bd=d; best=k;} }
      return {k:best, d:bd};
    }

    for(var gy=0; gy<grid.rows; gy++){
      for(var gx=0; gx<grid.cols; gx++){
        var x0=rect.x+gx*cellW, y0=rect.y+gy*cellH, x1=x0+cellW, y1=y0+cellH;
        var ix0 = Math.floor(x0 + (x1-x0)*CELL_MARGIN), ix1=Math.ceil(x1 - (x1-x0)*CELL_MARGIN);
        var iy0 = Math.floor(y0 + (y1-y0)*CELL_MARGIN), iy1=Math.ceil(y1 - (y1-y0)*CELL_MARGIN);
        if(ix1<=ix0 || iy1<=iy0){ ix0=Math.floor(x0); ix1=Math.ceil(x1); iy0=Math.floor(y0); iy1=Math.ceil(y1); }

        var votes=0, needed=Math.ceil(SAMPLE_GRID*SAMPLE_GRID*FG_VOTE_RATIO);
        var R=0,G=0,B=0,N=0;

        for(var sy=0; sy<SAMPLE_GRID; sy++){
          for(var sx=0; sx<SAMPLE_GRID; sx++){
            var u=(sx+0.5)/SAMPLE_GRID, v=(sy+0.5)/SAMPLE_GRID;
            var px=Math.floor(ix0 + u*(ix1-ix0-1)), py=Math.floor(iy0 + v*(iy1-iy0-1));
            var rgb=sampleAt(px,py);
            var nb=nearestCenterIndex(rgb);
            if(nb.k!==bgk || nb.d>KEEP_BG_DIFF){ votes++; R+=rgb[0]; G+=rgb[1]; B+=rgb[2]; N++; }
          }
        }

        if(votes>=needed && N>0){
          bin[gy][gx]=true; colsRGB[gy][gx]={ r:(R/N)/255, g:(G/N)/255, b:(B/N)/255 };
        }
      }
    }

    // Nettoyage “doux”
    var cleaned = closeBinary(bin);           // (pas d'open)
    cleaned = filterLargestComponents(cleaned);

    // Recadrage
    var minY=cleaned.length, minX2=cleaned[0].length, maxY2=0, maxX2=0, any=false, x,y;
    for(y=0;y<cleaned.length;y++) for(x=0;x<cleaned[0].length;x++) if(cleaned[y][x]){ any=true; if(y<minY)minY=y; if(y>maxY2)maxY2=y; if(x<minX2)minX2=x; if(x>maxX2)maxX2=x; }
    if(!any) throw new Error('Silhouette trop faible.');
    var croppedH=maxY2-minY+1, croppedW=maxX2-minX2+1;

    var pixels=Array.from({length:croppedH},()=>Array(croppedW).fill(null));
    for(y=0;y<croppedH;y++) for(x=0;x<croppedW;x++){
      var Y=y+minY, X=x+minX2;
      if(cleaned[Y][X]){
        if(colsRGB[Y][X]) pixels[y][x]=colsRGB[Y][X];
        else { // voisinage
          var Rl=0,Gl=0,Bl=0,Nl=0;
          for(var dy=-1;dy<=1;dy++) for(var dx=-1;dx<=1;dx++){
            var ny=Y+dy,nx=X+dx; if(ny<0||ny>=grid.rows||nx<0||nx>=grid.cols) continue;
            var c=colsRGB[ny][nx]; if(!c) continue; Rl+=c.r; Gl+=c.g; Bl+=c.b; Nl++;
          }
          if(Nl>0) pixels[y][x]={r:Rl/Nl,g:Gl/Nl,b:Bl/Nl};
        }
      }
    }

    // Purges depuis les bords (fond & blanc) + anti-miettes
    var bgSRGB={r:bgEdge[0]/255,g:bgEdge[1]/255,b:bgEdge[2]/255};
    purgeEdgeByBg(pixels,bgSRGB,0.065); // ne touche que les pixels joignables depuis les bords
    purgeEdgeWhitish(pixels);
    pixels = pruneLonely(pixels, 1);    // une seule passe, seuil 1 (préserve les détails fins)

    // Lissage léger
    (function smooth(){
      var rows=pixels.length, cols=pixels[0].length, out=Array.from({length:rows},()=>Array(cols).fill(null)), TH=0.0015;
      for(var y=0;y<rows;y++) for(var x=0;x<cols;x++){
        var c=pixels[y][x]; if(!c){out[y][x]=null; continue;}
        var pals=[],count=[];
        for(var dy=-1;dy<=1;dy++) for(var dx=-1;dx<=1;dx++){
          var ny=y+dy,nx=x+dx; if(ny<0||ny>=rows||nx<0||nx>=cols) continue;
          var n=pixels[ny][nx]; if(!n) continue;
          var found=-1; for(var i=0;i<pals.length;i++){ var p=pals[i], d=(p.r-n.r)*(p.r-n.r)+(p.g-n.g)*(p.g-n.g)+(p.b-n.b)*(p.b-n.b); if(d<TH){found=i;break;} }
          if(found==-1){pals.push(n);count.push(1);} else count[found]++;
        }
        var mi=0; for(var j=1;j<count.length;j++) if(count[j]>count[mi]) mi=j;
        out[y][x]=(count.length? pals[mi]:c);
      }
      pixels=out;
    })();

    // LOD
    var vox=0; for(y=0;y<pixels.length;y++) for(x=0;x<pixels[0].length;x++) if(pixels[y][x]) vox++;
    var budgetV=budget || 2000;
    if(vox>budgetV){
      var factor=Math.ceil(Math.sqrt(vox/budgetV)), rows=pixels.length, cols=pixels[0].length;
      var R=Math.ceil(rows/factor), C=Math.ceil(cols/factor), out=Array.from({length:R},()=>Array(C).fill(null));
      for(var gy=0;gy<R;gy++) for(var gx=0;gx<C;gx++){
        var Rsum=0,Gsum=0,Bsum=0,N=0;
        for(var y2=gy*factor;y2<Math.min(rows,(gy+1)*factor);y2++)
          for(var x2=gx*factor;x2<Math.min(cols,(gx+1)*factor);x2++){
            var cl=pixels[y2][x2]; if(!cl) continue; Rsum+=cl.r; Gsum+=cl.g; Bsum+=cl.b; N++;
          }
        if(N>0) out[gy][gx]={r:Rsum/N,g:Gsum/N,b:Bsum/N};
      }
      pixels=out;
    }
    return pixels;
  }

  /* ====== INVADER 3D (instanced) ====== */
  function buildInvaderMesh(pixelGrid){
    var rows=pixelGrid.length, cols=pixelGrid[0].length;
    var size=WORLD.invaderScale, gap=size*WORLD.spacingRatio, depth=size*WORLD.depthFactor;

    var geom=new THREE.BoxGeometry(size-gap,size-gap,depth);
    var colAttr=new Float32Array(geom.attributes.position.count*3);
    for(var i=0;i<geom.attributes.position.count;i++){
      var z=geom.attributes.position.getZ(i); var shade=z<0?0.82:1.0;
      colAttr[3*i]=shade; colAttr[3*i+1]=shade; colAttr[3*i+2]=shade;
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colAttr,3));
    var mat=new THREE.MeshStandardMaterial({
      roughness:0.42, metalness:0.06, vertexColors:true, flatShading:true,
      color:0xffffff, emissive:0x151515, emissiveIntensity:0.22,
      polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2
    });

    var mesh=new THREE.InstancedMesh(geom,mat,rows*cols);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    var dummy=new THREE.Object3D(), w=cols*size, h=rows*size, x0=-w/2+size/2, y0=-h/2+size/2, idx=0;
    for(var y=0;y<rows;y++) for(var x=0;x<cols;x++){
      var c=pixelGrid[y][x]; if(!c) continue;
      var srgb=boostColor({r:c.r,g:c.g,b:c.b});
      var col=new THREE.Color(srgb.r,srgb.g,srgb.b); if(col.convertSRGBToLinear) col.convertSRGBToLinear();
      dummy.position.set(x0+x*size, y0+(rows-1-y)*size, 0); dummy.rotation.set(0,0,0); dummy.updateMatrix();
      mesh.setMatrixAt(idx,dummy.matrix); mesh.setColorAt(idx,col); idx++;
    }
    mesh.count=idx; if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
    return {mesh,width:w,height:h,depth:depth};
  }

  /* ====== AGENTS (no‑clip) ====== */
  function alignZAxisTo(obj, normal){
    var q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), normal.clone().normalize());
    obj.quaternion.copy(q);
  }
  function planetRadiusAt(n){ return WORLD.planetRadius + planetBump(n); }

  function createWanderer(invader){
    var g=new THREE.Group(); g.add(invader.mesh);
    var targetWorldSize = WORLD.invaderMaxWorldSize*(WORLD.planetRadius*2);
    var maxDim=Math.max(invader.width,invader.height);
    var scale=targetWorldSize/maxDim; g.scale.setScalar(scale);
    var hover=(invader.depth*scale)/2 + WORLD.hoverMargin;

    var normal=new THREE.Vector3().randomDirection();
    var radius=planetRadiusAt(normal)+hover; g.position.copy(normal).multiplyScalar(radius);
    alignZAxisTo(g,normal); g.rotateOnAxis(new THREE.Vector3(0,0,1), Math.random()*Math.PI*2);

    var axis=new THREE.Vector3().randomDirection();
    var baseSpeed=0.08+Math.random()*0.06; var rot=new THREE.Quaternion();

    return {
      object:g, normal, axis, hover, baseSpeed,
      update:function(dt,peers,speedFactor){
        var push=new THREE.Vector3();
        for(var i=0;i<peers.length;i++){ var p=peers[i]; if(p===this) continue;
          var d=this.object.position.clone().sub(p.object.position), L=d.length();
          if(L<0.001) continue; if(L<WORLD.repelRadius) push.add(d.multiplyScalar((WORLD.repelRadius-L)/WORLD.repelRadius)); }
        if(push.lengthSq()>0){ this.axis.add(push.normalize().multiplyScalar(0.02)).normalize(); }

        rot.setFromAxisAngle(this.axis, this.baseSpeed*speedFactor*dt);
        this.normal.applyQuaternion(rot).normalize();

        var R=planetRadiusAt(this.normal)+this.hover;
        this.object.position.copy(this.normal).multiplyScalar(R);
        alignZAxisTo(this.object,this.normal);
      }
    };
  }

  /* ====== MÉTÉORITES & ÉTOILES FILANTES ====== */
  var transients=[];
  function streakTexture(){ var c=document.createElement('canvas'); c.width=128; c.height=4; var ctx=c.getContext('2d');
    var g=ctx.createLinearGradient(0,0,128,0); g.addColorStop(0,'rgba(255,255,255,0)');
    g.addColorStop(0.2,'rgba(255,255,255,0.3)'); g.addColorStop(1,'rgba(255,255,255,0)'); ctx.fillStyle=g; ctx.fillRect(0,0,128,4);
    var t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping; t.needsUpdate=true; return t; }
  var TRAIL_TEX=streakTexture();

  function spawnMeteor(){
    var startDir=new THREE.Vector3().randomDirection(), targetDir=new THREE.Vector3().randomDirection();
    var startPos=startDir.clone().multiplyScalar(WORLD.planetRadius*6.0), targetPos=targetDir.clone().multiplyScalar(WORLD.planetRadius*1.01);
    var body=new THREE.Mesh(new THREE.IcosahedronGeometry(0.10,0), new THREE.MeshStandardMaterial({color:0xffcc88,roughness:.65,metalness:.25,emissive:0x442200,emissiveIntensity:.35}));
    body.position.copy(startPos);
    var trail=new THREE.Mesh(new THREE.PlaneGeometry(1.2,0.07), new THREE.MeshBasicMaterial({map:TRAIL_TEX,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
    trail.position.copy(startPos); trail.rotation.y=Math.PI/2; scene.add(body); scene.add(trail);
    var t=0,speed=0.20+Math.random()*0.08,dir=new THREE.Vector3(), exploded=false;

    function impactFlash(where){
      var g=new THREE.SphereGeometry(0.18,12,10);
      var m=new THREE.MeshBasicMaterial({color:0xffffcc,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false});
      var flash=new THREE.Mesh(g,m); flash.position.copy(where); scene.add(flash);
      transients.push({done:false,update:function(dt){ flash.scale.multiplyScalar(1+dt*3.0); m.opacity*=Math.exp(-4*dt); if(m.opacity<.02){this.done=true; scene.remove(flash); g.dispose(); m.dispose();}},dispose:function(){}});
    }

    transients.push({done:false,update:function(dt){
      t+=speed*dt; if(t>1) t=1; var prev=body.position.clone(); body.position.lerpVectors(startPos,targetPos,t);
      dir.copy(body.position).sub(prev).normalize(); body.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),dir);
      trail.position.copy(body.position).addScaledVector(dir,-0.6); trail.lookAt(trail.position.clone().add(dir));
      var dist=body.position.length(); if(!exploded && dist<=WORLD.planetRadius*1.01){
        exploded=true; impactFlash(body.position.clone()); this.done=true; scene.remove(body); scene.remove(trail);
        body.geometry.dispose(); body.material.dispose(); trail.geometry.dispose(); trail.material.dispose(); }
    },dispose:function(){}});
  }

  function spawnShootingStar(){
    var radius=120, p0=new THREE.Vector3().randomDirection().multiplyScalar(radius), p1=new THREE.Vector3().randomDirection().multiplyScalar(radius);
    var streak=new THREE.Mesh(new THREE.PlaneGeometry(1.8,0.08), new THREE.MeshBasicMaterial({map:TRAIL_TEX,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
    streak.position.copy(p0); scene.add(streak); var t=0,speed=0.25+Math.random()*0.12;
    transients.push({done:false,update:function(dt){ t+=speed*dt; if(t>1){this.done=true; scene.remove(streak); streak.geometry.dispose(); streak.material.dispose(); return;}
      streak.position.lerpVectors(p0,p1,t); streak.lookAt(camera.position); streak.material.opacity=Math.max(0,1-Math.abs(t-.5)*2);},dispose:function(){}});
  }

  var nextMeteor=performance.now()+9000+Math.random()*10000;
  var nextStar  =performance.now()+4000+Math.random()*9000;

  /* ====== UI / Import iOS ====== */
  var addBtn=document.getElementById('addBtn'), countLbl=document.getElementById('count'), speedSlider=document.getElementById('speed');
  var agents=[], globalSpeedFactor=Number(speedSlider.value)/100;
  function updateCount(){ var n=agents.length; countLbl.textContent = n + (n>1?' invaders':' invader'); }
  speedSlider.addEventListener('input', ()=>{ globalSpeedFactor=Number(speedSlider.value)/100; });

  function handleFiles(files){
    var arr=[].slice.call(files);
    (async function(){
      for(var i=0;i<arr.length;i++){
        try{
          var px=await imageToPixelMatrix(arr[i], voxelsBudget(agents.length));
          var built=buildInvaderMesh(px);
          var agent=createWanderer(built);
          scene.add(agent.object); agents.push(agent); updateCount();
        }catch(err){ var el=document.getElementById('error'); el.textContent=err.message||String(err); el.style.display='block'; }
      }
    })();
  }

  function openPicker(){
    var input=document.createElement('input'); input.type='file'; input.accept='image/*'; input.multiple=true;
    input.style.position='fixed'; input.style.left='-10000px'; input.style.top='-10000px';
    document.body.appendChild(input);
    input.addEventListener('change', e=>{ try{ handleFiles(e.target.files); } finally{ document.body.removeChild(input); } }, {once:true});
    input.click();
  }

  addBtn.addEventListener('click', e=>{ e.preventDefault(); openPicker(); }, {passive:false});
  addBtn.addEventListener('touchstart', e=>{ e.preventDefault(); }, {passive:false});
  addBtn.addEventListener('touchend', e=>{ e.preventDefault(); openPicker(); }, {passive:false});

  /* ====== Boucle ====== */
  var clock=new THREE.Clock();
  function loop(){
    var dt=clock.getDelta(); controls.update(dt);
    for(var i=0;i<agents.length;i++) agents[i].update(dt,agents,globalSpeedFactor);
    var now=performance.now();
    if(now>nextMeteor){ var m=0; for(i=0;i<transients.length;i++) if(!transients[i].done) m++; if(m<3) spawnMeteor(); nextMeteor=now+9000+Math.random()*14000; }
    if(now>nextStar){ var s=0; for(i=0;i<transients.length;i++) if(!transients[i].done) s++; if(s<6) spawnShootingStar(); nextStar=now+5000+Math.random()*12000; }
    for(i=0;i<transients.length;i++){ var T=transients[i]; if(!T.done) T.update(dt); }
    transients=transients.filter(t=>!t.done);
    renderer.render(scene,camera);
    requestAnimationFrame(loop);
  }
  loop();

  window.addEventListener('resize', function(){
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); controls.apply();
  });
})();