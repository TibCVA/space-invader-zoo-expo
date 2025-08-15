/* global THREE */

// -------- Overlay d'erreur (diag si quelque chose plante) ----------
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
    invaderScale: 0.02,
    invaderDepth: 0.035,
    spacingRatio: 0.08,
    maxVoxelsPerInvader: 900,   // ~30x30
    invaderMaxWorldSize: 0.10,  // 10% du diamètre planète
    repelRadius: 0.35,
    hoverMargin: 0.03
  };

  /* =========================
     RENDERER / SCÈNE / CAMÉRA
     ========================= */
  var canvas = document.getElementById('scene');
  var renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: false,            // iOS : éviter les pertes de contexte
    alpha: false,
    powerPreference: 'default'
  });
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

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 150);

  /* =========================
     CONTRÔLES MAISON (drag + pinch)
     ========================= */
  function createSimpleOrbitControls(dom, cam, target) {
    var minDist = WORLD.planetRadius*1.05;
    var maxDist = WORLD.planetRadius*4.5;
    var radius = WORLD.planetRadius*2.0;
    var theta = Math.PI/6;   // azimut
    var phi   = Math.PI/2.2; // inclinaison

    function apply() {
      var sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
      var sinTh  = Math.sin(theta), cosTh = Math.cos(theta);
      cam.position.set(
        radius * sinPhi * sinTh,
        radius * cosPhi,
        radius * sinPhi * cosTh
      );
      cam.lookAt(target);
    }
    apply();

    var st = { rotating:false, sx:0, sy:0, th0:0, ph0:0, pinching:false, d0:0, r0:radius };

    // Desktop
    dom.addEventListener('mousedown', function(e){
      e.preventDefault(); st.rotating=true; st.sx=e.clientX; st.sy=e.clientY; st.th0=theta; st.ph0=phi;
    }, {passive:false});
    window.addEventListener('mousemove', function(e){
      if(!st.rotating) return;
      e.preventDefault();
      var dx=(e.clientX-st.sx)/dom.clientWidth;
      var dy=(e.clientY-st.sy)/dom.clientHeight;
      theta = st.th0 - dx*Math.PI*2;
      phi   = Math.max(0.05, Math.min(Math.PI-0.05, st.ph0 + dy*Math.PI));
      apply();
    }, {passive:false});
    window.addEventListener('mouseup', function(){ st.rotating=false; });

    dom.addEventListener('wheel', function(e){
      e.preventDefault();
      var s = Math.exp(e.deltaY*0.001);
      radius = Math.max(minDist, Math.min(maxDist, radius*s));
      apply();
    }, {passive:false});

    // Mobile (iOS)
    dom.addEventListener('touchstart', function(e){
      if(e.touches.length===1){
        st.rotating=true; st.sx=e.touches[0].clientX; st.sy=e.touches[0].clientY; st.th0=theta; st.ph0=phi;
      } else if(e.touches.length===2){
        st.pinching=true;
        var dx=e.touches[0].clientX - e.touches[1].clientX;
        var dy=e.touches[0].clientY - e.touches[1].clientY;
        st.d0=Math.hypot(dx,dy); st.r0=radius;
      }
    }, {passive:false});
    dom.addEventListener('touchmove', function(e){
      if(st.pinching && e.touches.length===2){
        e.preventDefault();
        var dx=e.touches[0].clientX - e.touches[1].clientX;
        var dy=e.touches[0].clientY - e.touches[1].clientY;
        var d=Math.hypot(dx,dy);
        var scale = st.d0 / d;
        radius = Math.max(minDist, Math.min(maxDist, st.r0*scale));
        apply();
      } else if(st.rotating && e.touches.length===1){
        e.preventDefault();
        var dx=(e.touches[0].clientX - st.sx)/dom.clientWidth;
        var dy=(e.touches[0].clientY - st.sy)/dom.clientHeight;
        theta = st.th0 - dx*Math.PI*2;
        phi   = Math.max(0.05, Math.min(Math.PI-0.05, st.ph0 + dy*Math.PI));
        apply();
      }
    }, {passive:false});
    dom.addEventListener('touchend', function(){ st.rotating=false; st.pinching=false; }, {passive:false});

    return { apply:apply, minDistance:minDist, maxDistance:maxDist };
  }
  var controls = createSimpleOrbitControls(renderer.domElement, camera, new THREE.Vector3(0,0,0));

  /* =========================
     LUMIÈRES
     ========================= */
  var sun = new THREE.DirectionalLight(0xffffff, 0.95);
  sun.position.set(-4, 6, 8);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfdfff, 0x2a1e1a, 0.7));

  /* =========================
     PLANÈTE PASTEL + ATMOSPHÈRE
     ========================= */
  function generatePlanetTexture(w, h) {
    w = w || 512; h = h || 256;
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var ctx = c.getContext('2d');

    var g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0, '#2b5b6a'); g.addColorStop(0.55, '#3a7083'); g.addColorStop(1, '#2c5563');
    ctx.fillStyle = g; ctx.fillRect(0,0,w,h);

    var seed = 1337;
    function rand(n){ return (Math.sin(n*16807 + seed)*43758.5453) % 1; }
    function noise1d(x){ var i=Math.floor(x), f=x-i; var a=rand(i), b=rand(i+1); return a*(1-f)+b*f; }

    ctx.globalAlpha = 0.25;
    for (var y=0; y<h; y++) {
      var v = y/h;
      var band = 0.5 + 0.5*Math.sin((v*3.5 + 0.15)*Math.PI*2);
      var n = 0.5 + 0.5*noise1d(v*24.0);
      var t = Math.min(1, Math.max(0, band*0.6 + n*0.4));
      ctx.fillStyle = 'rgba(255,255,255,'+(0.12*t)+')';
      ctx.fillRect(0,y,w,1);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (var i=0;i<40;i++){
      var cx = Math.random()*w, cy=Math.random()*h;
      var r = 10 + Math.random()*30;
      var grd = ctx.createRadialGradient(cx,cy,0,cx,cy,r);
      grd.addColorStop(0, 'rgba(255,255,255,0.12)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
    }

    var tex = new THREE.CanvasTexture(c);
    if (tex.colorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
    return tex;
  }

  var planetGeo = new THREE.SphereGeometry(WORLD.planetRadius, 96, 64);
  var planetMat = new THREE.MeshStandardMaterial({
    map: generatePlanetTexture(512,256),
    color: new THREE.Color('#274b59').convertSRGBToLinear(),
    roughness: 0.9,
    metalness: 0.03
  });
  var planet = new THREE.Mesh(planetGeo, planetMat);
  scene.add(planet);

  // Relief doux
  (function(){
    var pos = planetGeo.attributes.position, v=new THREE.Vector3();
    for(var i=0;i<pos.count;i++){
      v.fromBufferAttribute(pos,i).normalize();
      var p=0.05*(Math.sin(7*v.x)+Math.sin(9*v.y)+Math.sin(11*v.z));
      v.multiplyScalar(WORLD.planetRadius + p);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    planetGeo.computeVertexNormals();
  })();

  // Halo atmosphérique
  (function(){
    var g = new THREE.SphereGeometry(WORLD.planetRadius*1.02, 48, 36);
    var m = new THREE.ShaderMaterial({
      vertexShader:
        'varying float vDot;'+
        'void main(){ vec3 n=normalize(normalMatrix*normal); vec3 v=normalize((modelViewMatrix*vec4(position,1.0)).xyz);'+
        'vDot=1.0-max(dot(n,-v),0.0); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader:
        'varying float vDot; void main(){ float a=pow(vDot,4.0); gl_FragColor=vec4(0.3,0.6,1.0,a*0.25); }',
      blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true, depthWrite: false
    });
    scene.add(new THREE.Mesh(g, m));
  })();

  /* =========================
     ÉTOILES
     ========================= */
  (function(){
    var N=2400, a=new Float32Array(3*N);
    for(var i=0;i<N;i++){
      var r=70+Math.random()*70, t=Math.acos(Math.random()*2-1), p=Math.random()*Math.PI*2;
      a[3*i]=r*Math.sin(t)*Math.cos(p); a[3*i+1]=r*Math.cos(t); a[3*i+2]=r*Math.sin(t)*Math.sin(p);
    }
    var g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a,3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, color: 0xffffff })));
  })();

  /* =========================
     OUTILS IMAGE & SEGMENTATION (robustes)
     ========================= */
  function lin(c){ c/=255; return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4); }
  function dist2(a,b){ var dr=lin(a[0])-lin(b[0]); var dg=lin(a[1])-lin(b[1]); var db=lin(a[2])-lin(b[2]); return dr*dr+dg*dg+db*db; }
  function loadImage(file){ return new Promise(function(res,rej){ var url=URL.createObjectURL(file); var im=new Image(); im.onload=function(){ res(im); }; im.onerror=rej; im.src=url; }); }
  function getEdgeBg(data,W,H){
    var m=Math.floor(Math.min(W,H)*.04), skip=Math.floor(H*.18);
    var regs=[{x:0,y:0,w:W,h:m},{x:0,y:m,w:m,h:H-m-skip},{x:W-m,y:m,w:m,h:H-m-skip},{x:0,y:H-m-skip,w:W,h:m}];
    var r=0,g=0,b=0,n=0, t, y, x, i;
    for(var ri=0;ri<regs.length;ri++){ t=regs[ri];
      for(y=t.y;y<t.y+t.h;y++){ for(x=t.x;x<t.x+t.w;x++){ i=(y*W+x)*4; r+=data[i]; g+=data[i+1]; b+=data[i+2]; n++; } }
    }
    return [r/n,g/n,b/n];
  }
  function kmeans(colors, K, it){
    K = K||3; it = it||8;
    var cents=[], assign=new Array(colors.length), i, k;
    for(k=0;k<K;k++){ var c=colors[Math.floor(colors.length*(k+0.5)/(K+0.5))]; cents.push([c[0],c[1],c[2]]); }
    for(var t=0;t<it;t++){
      for(i=0;i<colors.length;i++){ var best=0,bd=1e9; for(k=0;k<K;k++){ var d=dist2(colors[i],cents[k]); if(d<bd){bd=d; best=k;} } assign[i]=best; }
      var acc=[]; for(k=0;k<K;k++) acc.push([0,0,0,0]);
      for(i=0;i<colors.length;i++){ k=assign[i]; var cc=colors[i]; acc[k][0]+=cc[0]; acc[k][1]+=cc[1]; acc[k][2]+=cc[2]; acc[k][3]++; }
      for(k=0;k<K;k++){ if(acc[k][3]>0){ cents[k][0]=acc[k][0]/acc[k][3]; cents[k][1]=acc[k][1]/acc[k][3]; cents[k][2]=acc[k][2]/acc[k][3]; } }
    }
    return { centers:cents, assign:assign };
  }
  function estimateGrid(imgData, W, H, rect, range){
    range = range || [14,64];
    var x=rect.x,y=rect.y,w=rect.w,h=rect.h;
    function get(ix,iy){ var i=((y+iy)*W+(x+ix))*4; return [imgData[i],imgData[i+1],imgData[i+2]]; }
    function changes(len, sample){
      var arr=[], i, j, prev, c;
      for(i=0;i<len;i++){ prev=sample(i,0); c=0; for(j=1;j<len;j++){ var v=sample(i,j); if(dist2(v,prev)>0.01){c++; prev=v;} } arr.push(c); }
      arr.sort(function(a,b){return a-b;}); return arr[Math.floor(arr.length/2)];
    }
    var cols=changes(w, function(i,j){ return get(i, Math.floor(j*h/(w||1))%h); });
    var rows=changes(h, function(i,j){ return get(Math.floor(j*w/(h||1))%w, i); });
    function clamp(n,len){ var g=Math.max(range[0], Math.min(range[1], n||Math.round(len/14))); if(g%2!==0) g++; return g; }
    return { cols:clamp(cols,w), rows:clamp(rows,h) };
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
  function filterLargestComponents(bin){
    var r=bin.length, c=bin[0].length;
    var vis=Array.from({length:r},function(){return Array(c).fill(false);});
    var comp=[], dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    var y,x;
    for(y=0;y<r;y++) for(x=0;x<c;x++){
      if(!bin[y][x] || vis[y][x]) continue;
      var q=[[y,x]]; vis[y][x]=true; var area=0, minY=y, maxY=y, minX=x, maxX=x;
      while(q.length){
        var cur=q.pop(); var cy=cur[0], cx=cur[1]; area++;
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
  function quantizeColors(pixels, tol){
    tol = tol || 0.004;
    var rows=pixels.length, cols=pixels[0].length, palette=[];
    function match(c){ for(var i=0;i<palette.length;i++){ var p=palette[i]; var d=(p.r-c.r)*(p.r-c.r)+(p.g-c.g)*(p.g-c.g)+(p.b-c.b)*(p.b-c.b); if(d<tol) return p; } return null; }
    for(var y=0;y<rows;y++) for(var x=0;x<cols;x++){
      var c=pixels[y][x]; if(!c) continue; var m=match(c); if(m) pixels[y][x]=m; else palette.push(c);
    }
    return pixels;
  }
  function downsamplePixels(pixels, factor){
    if(factor<=1) return pixels;
    var rows=pixels.length, cols=pixels[0].length;
    var R=Math.ceil(rows/factor), C=Math.ceil(cols/factor);
    var out=Array.from({length:R}, function(){ return Array(C).fill(null); });
    for(var gy=0;gy<R;gy++){
      for(var gx=0;gx<C;gx++){
        var Rsum=0,Gsum=0,Bsum=0,N=0;
        for(var y=gy*factor; y<Math.min(rows,(gy+1)*factor); y++){
          for(var x=gx*factor; x<Math.min(cols,(gx+1)*factor); x++){
            var c=pixels[y][x]; if(!c) continue;
            Rsum+=c.r; Gsum+=c.g; Bsum+=c.b; N++;
          }
        }
        if(N>0) out[gy][gx]={r:Rsum/N,g:Gsum/N,b:Bsum/N};
      }
    }
    return out;
  }
  async function imageToPixelMatrix(file){
    var img=await loadImage(file);
    var maxSide=1000, scl=Math.min(1, maxSide/Math.max(img.naturalWidth,img.naturalHeight));
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
    var km=kmeans(cols,3,8);
    var bgk=0,bd=1e9; for(var k=0;k<3;k++){ var d=dist2(km.centers[k], bgEdge); if(d<bd){bd=d; bgk=k;} }

    var grid = estimateGrid(data, W, H, rect, [14,72]);
    var cellW=rect.w/grid.cols, cellH=rect.h/grid.rows;

    var bin=Array.from({length:grid.rows}, function(){return Array(grid.cols).fill(false);});
    var colsRGB=Array.from({length:grid.rows}, function(){return Array(grid.cols).fill(null);});
    var keepTH=0.008;
    for(var gy=0;gy<grid.rows;gy++){
      for(var gx=0;gx<grid.cols;gx++){
        var x0=Math.floor(rect.x+gx*cellW), y0=Math.floor(rect.y+gy*cellH);
        var x1=Math.min(W, Math.floor(rect.x+(gx+1)*cellW));
        var y1=Math.min(H, Math.floor(rect.y+(gy+1)*cellH));
        var r=0,g=0,b=0,n=0;
        for(y=y0;y<y1;y++) for(x=x0;x<x1;x++){ var idx=(y*W+x)*4; r+=data[idx]; g+=data[idx+1]; b+=data[idx+2]; n++; }
        var c=[r/n,g/n,b/n];
        if(dist2(c, km.centers[bgk])>keepTH){ bin[gy][gx]=true; colsRGB[gy][gx]={r:c[0]/255,g:c[1]/255,b:c[2]/255}; }
      }
    }

    var cleaned = erode(dilate(openBinary(bin)));
    cleaned = filterLargestComponents(cleaned);

    var minY=cleaned.length, minX2=cleaned[0].length, maxY2=0, maxX2=0, any=false;
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
    quantizeColors(pixels, 0.004);

    var vox=0; for(y=0;y<pixels.length;y++) for(x=0;x<pixels[0].length;x++) if(pixels[y][x]) vox++;
    if(vox > WORLD.maxVoxelsPerInvader){
      var factor = Math.ceil(Math.sqrt(vox / WORLD.maxVoxelsPerInvader));
      return downsamplePixels(pixels, factor);
    }
    return pixels;
  }

  /* =========================
     INVADER 3D (Instanced)
     ========================= */
  function buildInvaderMesh(pixelGrid){
    var rows=pixelGrid.length, cols=pixelGrid[0].length;
    var size=WORLD.invaderScale, gap=size*WORLD.spacingRatio, depth=WORLD.invaderDepth;

    var geom=new THREE.BoxGeometry(size-gap, size-gap, depth);
    var colAttr=new Float32Array(geom.attributes.position.count*3);
    for(var i=0;i<geom.attributes.position.count;i++){
      var z=geom.attributes.position.getZ(i); var shade=z<0?0.76:1.0;
      colAttr[3*i]=shade; colAttr[3*i+1]=shade; colAttr[3*i+2]=shade;
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colAttr,3));
    var mat=new THREE.MeshStandardMaterial({ roughness:0.5, metalness:0.04, vertexColors:true, color:0xffffff });

    var mesh=new THREE.InstancedMesh(geom, mat, rows*cols);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    var dummy=new THREE.Object3D();
    var w=cols*size,h=rows*size;
    var x0=-w/2+size/2, y0=-h/2+size/2;
    var idx=0;
    for(var y=0;y<rows;y++) for(var x=0;x<cols;x++){
      var c=pixelGrid[y][x]; if(!c) continue;
      dummy.position.set(x0 + x*size, y0 + (rows-1-y)*size, 0);
      dummy.rotation.set(0,0,0); dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
      mesh.setColorAt(idx, new THREE.Color(c.r,c.g,c.b)); idx++;
    }
    mesh.count=idx; if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true;

    return { mesh:mesh, width:w, height:h, depth:depth };
  }

  /* =========================
     AGENT (déplacement tangent)
     ========================= */
  function alignZAxisTo(obj, normal){
    var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), normal.clone().normalize());
    obj.quaternion.copy(q);
  }
  function createWanderer(invader){
    var g=new THREE.Group(); g.add(invader.mesh);

    var targetWorldSize = WORLD.invaderMaxWorldSize * (WORLD.planetRadius*2);
    var maxDim = Math.max(invader.width, invader.height);
    var scale = targetWorldSize / maxDim;
    g.scale.setScalar(scale);

    var normal=new THREE.Vector3().randomDirection();
    var hover = (invader.depth*scale)/2 + WORLD.hoverMargin;
    var radiusOffset = WORLD.planetRadius + hover;
    g.position.copy(normal).multiplyScalar(radiusOffset);
    alignZAxisTo(g, normal);
    g.rotateOnAxis(new THREE.Vector3(0,0,1), Math.random()*Math.PI*2);

    var axis=new THREE.Vector3().randomDirection();
    var baseSpeed = 0.08 + Math.random()*0.06; // ~3x plus lent
    var rot=new THREE.Quaternion();

    return {
      object: g, normal: normal, axis: axis, radiusOffset: radiusOffset, baseSpeed: baseSpeed,
      update: function(dt, peers, speedFactor){
        var push=new THREE.Vector3();
        for(var i=0;i<peers.length;i++){ var p=peers[i]; if(p===this) continue;
          var d=this.object.position.clone().sub(p.object.position);
          var L=d.length();
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
     UI & IMPORT (iOS-safe)
     ========================= */
  var addBtn=document.getElementById('addBtn');
  var countLbl=document.getElementById('count');
  var speedSlider=document.getElementById('speed');

  var agents=[];
  var globalSpeedFactor = Number(speedSlider.value)/100; // 0.33 par défaut
  function updateCount(){ var n=agents.length; countLbl.textContent = n + (n>1?' invaders':' invader'); }
  speedSlider.addEventListener('input', function(){ globalSpeedFactor = Number(speedSlider.value)/100; });

  function handleFiles(files){
    var arr = Array.prototype.slice.call(files);
    (async function(){
      for (var i=0;i<arr.length;i++){
        try {
          var px=await imageToPixelMatrix(arr[i]);
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
    for (var i=0;i<agents.length;i++) agents[i].update(dt, agents, globalSpeedFactor);
    // plus de controls.update(); (tout est géré par nos handlers)
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