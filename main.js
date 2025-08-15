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
    hoverMargin: 0.11,           // ↑ marge pour éviter tout z-fighting
    invaderMaxWorldSize: 0.10    // 10% du diamètre planète
  };

  function voxelsBudget(count){
    if (count < 20)  return 2600;  // ~51x51
    if (count < 50)  return 1681;  // ~41x41
    if (count < 120) return 961;   // ~31x31
    if (count < 300) return 529;   // ~23x23
    return 256;                    // ~16x16
  }

  /* =========================
     RENDERER / SCÈNE / CAMÉRA
     ========================= */
  var canvas = document.getElementById('scene');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: 'default' });
  var gl = renderer.getContext();
  if (!gl) { var el = document.getElementById('error'); el.textContent = 'WebGL non disponible.'; el.style.display = 'block'; }
  renderer.setPixelRatio(DPR);
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (renderer.outputColorSpace !== undefined) renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (renderer.toneMapping !== undefined) renderer.toneMapping = THREE.ACESFilmicToneMapping;
  if (renderer.toneMappingExposure !== undefined) renderer.toneMappingExposure = 1.6;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.2, 200); // near ↑ pour précision Z

  /* =========================
     CONTRÔLES ORBITAUX (inversion verticale + inertie)
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
      vTheta += -dx * ROT_SENS * Math.PI; vPhi += -dy * ROT_SENS * Math.PI; // inversion verticale
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
        vTheta += -dx * ROT_SENS * Math.PI; vPhi += -dy * ROT_SENS * Math.PI;
        st.sx=e.touches[0].clientX; st.sy=e.touches[0].clientY;
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
     LUMIÈRES / PLANÈTE / ÉTOILES
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

  // relief doux (même formule que celle utilisée pour l'altitude des invaders)
  var BUMP_SCALE = 0.03;
  function planetBump(n){ return BUMP_SCALE*(Math.sin(7*n.x)+Math.sin(9*n.y)+Math.sin(11*n.z)); }
  (function(){
    var pos=planetGeo.attributes.position, v=new THREE.Vector3();
    for(var i=0;i<pos.count;i++){
      v.fromBufferAttribute(pos,i).normalize();
      var p=planetBump(v);
      v.multiplyScalar(WORLD.planetRadius + p);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    planetGeo.computeVertexNormals();
  })();

  (function(){ // étoiles statiques
    var N=2400, a=new Float32Array(3*N);
    for(var i=0;i<N;i++){ var r=70+Math.random()*70, t=Math.acos(Math.random()*2-1), p=Math.random()*Math.PI*2;
      a[3*i]=r*Math.sin(t)*Math.cos(p); a[3*i+1]=r*Math.cos(t); a[3*i+2]=r*Math.sin(t)*Math.sin(p); }
    var g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a,3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, color: 0xffffff })));
  })();

  /* =========================
     (… LES OUTILS IMAGE & DÉTECTION d'invaders restent identiques à ta v3.9 …)
     ========================= */
  // ⚠️ Pour rester concis ici, garde exactement le bloc "OUTILS IMAGE" et "imageToPixelMatrix"
  // de ta v3.9 précédente (il n'est pas modifié par ce hotfix no‑clip).
  // Si tu veux, recolle-le tel quel en dessous.
  // ---------------
  // ⬇️ COLLE ICI ton bloc v3.9 (détection/segmentation/boost couleur)
  // ---------------

  /* ==== PLACEHOLDER pour raccourcir ce message ====
     Copie / colle ici sans changer :
     - dist2 / loadImage / isWhitish / getEdgeBg / kmeans / estimateGrid /
     - dilate / erode / openBinary / closeBinary / filterLargestComponents /
     - purgeEdgeWhitish / purgeEdgeByBg / pruneLonely / hsv2rgb / rgb2hsv / boostColor /
     - imageToPixelMatrix(file, budget)
     (Tout ce bloc est identique à la v3.9 que tu as déjà déployée.)
  ==== FIN PLACEHOLDER ================================= */

  /* =========================
     INVADER 3D (instanced) — + polygonOffset pour éviter le z-fighting
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
      roughness:0.42, metalness:0.06, vertexColors:true, flatShading:true,
      color:0xffffff, emissive:0x151515, emissiveIntensity:0.22,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 // << clé anti z-fighting
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
     AGENTS (déplacement tangent • altitude liée au relief)
     ========================= */
  function alignZAxisTo(obj, normal){
    var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), normal.clone().normalize());
    obj.quaternion.copy(q);
  }
  function planetRadiusAt(n){ return WORLD.planetRadius + planetBump(n); }

  function createWanderer(invader){
    var g=new THREE.Group(); g.add(invader.mesh);

    // Taille globale inchangée
    var targetWorldSize = WORLD.invaderMaxWorldSize * (WORLD.planetRadius*2);
    var maxDim = Math.max(invader.width, invader.height);
    var scale = targetWorldSize / maxDim; g.scale.setScalar(scale);

    // Hover = demi‑épaisseur + marge
    var hover = (invader.depth*scale)/2 + WORLD.hoverMargin;

    var normal=new THREE.Vector3().randomDirection();
    var radius = planetRadiusAt(normal) + hover;
    g.position.copy(normal).multiplyScalar(radius);
    alignZAxisTo(g, normal);
    g.rotateOnAxis(new THREE.Vector3(0,0,1), Math.random()*Math.PI*2);

    var axis=new THREE.Vector3().randomDirection();
    var baseSpeed = 0.08 + Math.random()*0.06;
    var rot=new THREE.Quaternion();

    return {
      object: g, normal: normal, axis: axis, hover: hover, baseSpeed: baseSpeed,
      update: function(dt, peers, speedFactor){
        // petite répulsion tangentielle
        var push=new THREE.Vector3();
        for(var i=0;i<peers.length;i++){ var p=peers[i]; if(p===this) continue;
          var d=this.object.position.clone().sub(p.object.position); var L=d.length();
          if(L<0.001) continue;
          if(L<WORLD.repelRadius) push.add(d.multiplyScalar((WORLD.repelRadius-L)/WORLD.repelRadius));
        }
        if(push.lengthSq()>0){ this.axis.add(push.normalize().multiplyScalar(0.02)).normalize(); }

        // rotation tangentielle (pas de bobbing radial)
        rot.setFromAxisAngle(this.axis, this.baseSpeed * speedFactor * dt);
        this.normal.applyQuaternion(rot).normalize();

        // altitude exacte = rayon planète (avec relief) + hover
        var R = planetRadiusAt(this.normal) + this.hover;
        this.object.position.copy(this.normal).multiplyScalar(R);
        alignZAxisTo(this.object, this.normal);
      }
    };
  }

  /* =========================
     MÉTÉORITES & ÉTOILES FILANTES (identiques v3.9)
     ========================= */
  // --- garde exactement ton bloc v3.9 de transients (spawnMeteor, spawnShootingStar, etc.) ---
  // (rien à changer ici, je ne le recopie pas pour raccourcir le message)

  /* =========================
     UI & IMPORT (identiques v3.9)
     ========================= */
  // ... garde ton code v3.9 existant pour addBtn / handleFiles / openPicker / speed slider ...

  /* =========================
     BOUCLE
     ========================= */
  // ... garde la boucle v3.9 ; elle continue d’appeler agent.update(dt, agents, globalSpeedFactor) ...
})();