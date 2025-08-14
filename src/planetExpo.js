// planetExpo.js — planète (biomes, océans, nuit, aurores) + fonctions CPU pour marcheurs
export function createPlanetEXPO(radius, THREE){
  const group = new THREE.Group();
  const baseR = radius;

  const terrainGeo = new THREE.SphereGeometry(baseR, 220, 220);
  const colorAttr = new Float32Array(terrainGeo.attributes.position.count*3);
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colorAttr, 3));
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.receiveShadow = true;
  group.add(terrain);

  const ocean = new THREE.Mesh(
    new THREE.SphereGeometry(baseR*0.998, 200, 200),
    new THREE.MeshPhysicalMaterial({
      color: 0x2a6bff, roughness: 0.2, metalness: 0.0, transmission: 0.0,
      clearcoat: 0.9, clearcoatRoughness: 0.25, envMapIntensity: 0.35, transparent: true, opacity: 0.86
    })
  );
  group.add(ocean);

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(baseR*1.02, 180, 180),
    new THREE.MeshStandardMaterial({ color:0xffffff, transparent:true, opacity:0.05, roughness:1.0 })
  );
  group.add(clouds);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(baseR*1.08, 180, 180),
    new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, side:THREE.BackSide,
      uniforms:{ color:{value:new THREE.Color(0x64b5ff)} },
      vertexShader:`varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader:`varying vec3 vN; uniform vec3 color; void main(){ float a = pow(max(vN.z,0.0),3.0); gl_FragColor = vec4(color, a*0.28); }`
    })
  );
  group.add(atmosphere);

  const cityLights = new THREE.Mesh(
    new THREE.SphereGeometry(baseR*1.0005, 180,180),
    new THREE.ShaderMaterial({
      transparent:true, depthWrite:false,
      uniforms:{ sunDir:{ value:new THREE.Vector3(1,0,0) }, intensity:{ value:0.9 } },
      vertexShader:`varying vec3 vN; varying vec3 vPos; 
        void main(){ vPos = (modelMatrix*vec4(position,1.)).xyz; vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader:`varying vec3 vN; varying vec3 vPos; uniform vec3 sunDir; uniform float intensity;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
        float noise(vec3 p){ vec3 i=floor(p), f=fract(p); 
          float a=hash(i), b=hash(i+vec3(1,0,0)), c=hash(i+vec3(0,1,0)), d=hash(i+vec3(1,1,0));
          float e=hash(i+vec3(0,0,1)), f1=hash(i+vec3(1,0,1)), g=hash(i+vec3(0,1,1)), h=hash(i+vec3(1,1,1));
          vec3 u=f*f*(3.0-2.0*f);
          float x00=mix(a,b,u.x), x10=mix(c,d,u.x), x01=mix(e,f1,u.x), x11=mix(g,h,u.x);
          float y0=mix(x00,x10,u.y), y1=mix(x01,x11,u.y);
          return mix(y0,y1,u.z);
        }
        void main(){
          float night = clamp(1.0 - max(dot(vN, normalize(sunDir)),0.0), 0.0, 1.0);
          float cities = pow(noise(vN*24.0)+noise(vN*48.0)*0.5, 3.0);
          float glow = night * cities * intensity;
          gl_FragColor = vec4(1.0,0.9,0.7, glow);
        }`
    })
  );
  group.add(cityLights);

  const aurora = new THREE.Mesh(
    new THREE.SphereGeometry(baseR*1.06, 180, 180),
    new THREE.ShaderMaterial({
      transparent:true, depthWrite:false, side:THREE.FrontSide,
      uniforms:{ sunDir:{value:new THREE.Vector3(1,0,0)} },
      vertexShader:`varying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader:`varying vec3 vN; uniform vec3 sunDir;
        float band(float x,float a,float b){ return smoothstep(a,a+0.02,x)*smoothstep(b+0.02,b,x); }
        void main(){ float lat = abs(vN.y); float nightside = 1.0 - max(dot(vN, normalize(sunDir)),0.0); float k = band(lat,0.65,0.98) * nightside; gl_FragColor = vec4(0.4,0.8,1.0, k*0.12); }`
    })
  );
  group.add(aurora);

  // Value noise & fbm on CPU for walkers + CPU colors
  function noise(x,y,z){
    const i=Math.floor(x), j=Math.floor(y), k=Math.floor(z);
    const fx=x-i, fy=y-j, fz=z-k;
    function rnd(a,b,c){ const s=Math.sin(a*127.1 + b*311.7 + c*74.7)*43758.5453; return s-Math.floor(s); }
    function fade(t){ return t*t*(3-2*t); }
    function lerp(a,b,t){ return a+(b-a)*t; }
    const u=fade(fx), v=fade(fy), w=fade(fz);
    const n000=rnd(i,j,k), n100=rnd(i+1,j,k), n010=rnd(i,j+1,k), n110=rnd(i+1,j+1,k);
    const n001=rnd(i,j,k+1), n101=rnd(i+1,j,k+1), n011=rnd(i,j+1,k+1), n111=rnd(i+1,j+1,k+1);
    const x00=lerp(n000,n100,u), x10=lerp(n010,n110,u), x01=lerp(n001,n101,u), x11=lerp(n011,n111,u);
    const y0=lerp(x00,x10,v), y1=lerp(x01,x11,v); return lerp(y0,y1,w)*2-1;
  }
  function fbm(nx,ny,nz,t){
    return noise(nx*1.3+t*0.1,ny*1.3,nz*1.3)*0.55 + noise(nx*2.6,ny*2.6+t*0.05,nz*2.6)*0.28 + noise(nx*5.2,ny*5.2,nz*5.2+t*0.025)*0.12 + Math.abs(noise(nx*3.0,ny*3.0,nz*3.0))*0.25;
  }

  let amplitude = 0.75; // 0..1
  let time = 0;

  function rebuild(dt){
    time += dt*0.0001;
    const pos = terrainGeo.attributes.position;
    const n = pos.count;
    const col = terrainGeo.attributes.color.array;
    const v = new THREE.Vector3();
    const color = new THREE.Color();
    for (let i=0;i<n;i++){
      v.fromBufferAttribute(pos, i);
      const nrm = v.clone().normalize();
      const nx=nrm.x, ny=nrm.y, nz=nrm.z;
      const h = fbm(nx,ny,nz,time);
      const sea = 0.505;
      const amp = baseR * (0.03 + 0.11*amplitude);
      const disp = amp * ((h+1)/2 - 0.5);
      const len = baseR + disp;
      v.setLength(len);
      pos.setXYZ(i, v.x, v.y, v.z);

      // colors by elevation/moisture
      if (len < baseR*sea){ color.setRGB(0.05,0.12,0.25); }
      else {
        const k = (len - baseR*sea) / (baseR*(0.06+0.11*amplitude));
        if (k < 0.08){ color.setHSL(0.58,0.55,0.25 + k*0.8); }
        else if (k < 0.45){ const moist=(noise(nx*1.2+5.1,ny*1.2,nz*1.2)+1)/2; color.setHSL(THREE.MathUtils.lerp(0.22,0.38,moist), THREE.MathUtils.lerp(0.35,0.75,moist), THREE.MathUtils.lerp(0.32,0.44,moist)); }
        else if (k < 0.8){ color.setHSL(0.1,0.45,0.35+(k-0.45)*0.25); }
        else { color.setHSL(0.0,0.0,0.95 - (1.0-k)*0.5); }
      }
      col[i*3+0]=color.r; col[i*3+1]=color.g; col[i*3+2]=color.b;
    }
    pos.needsUpdate = true;
    terrainGeo.attributes.color.needsUpdate = true;
    terrainGeo.computeVertexNormals();
  }
  rebuild(0);

  let timeOfDay = 0.42;
  function setTime(t){ timeOfDay = THREE.MathUtils.clamp(t,0,1); }
  function sunDir(){ const a=timeOfDay*Math.PI*2; return new THREE.Vector3(Math.cos(a), Math.sin(a), -Math.cos(a*0.8)).normalize(); }
  function sunElev(){ return Math.max(0, sunDir().y); }
  function setRelief(r){ amplitude = THREE.MathUtils.clamp(r,0,1); rebuild(16); }

  function update(dt){
    rebuild(dt);
    clouds.rotation.y += dt*0.00007;
    const s = sunDir();
    cityLights.material.uniforms.sunDir.value.copy(s);
    aurora.material.uniforms.sunDir.value.copy(s);
  }

  function surfaceRadius(dir){
    const nrm = dir.clone().normalize(); const nx=nrm.x, ny=nrm.y, nz=nrm.z;
    const h = fbm(nx,ny,nz,time);
    const amp = baseR * (0.03 + 0.11*amplitude);
    return baseR + amp * ((h+1)/2 - 0.5);
  }
  function normal(dir){
    const eps=0.01; const nrm=dir.clone().normalize();
    const a=nrm.clone().applyAxisAngle(new THREE.Vector3(0,1,0), eps);
    const b=nrm.clone().applyAxisAngle(new THREE.Vector3(1,0,0), eps);
    const r0=surfaceRadius(nrm), ra=surfaceRadius(a), rb=surfaceRadius(b);
    const p0=nrm.multiplyScalar(r0), pa=a.multiplyScalar(ra), pb=b.multiplyScalar(rb);
    const va=pa.sub(p0), vb=pb.sub(p0);
    return new THREE.Vector3().crossVectors(va,vb).normalize();
  }
  function gradient(dir){
    const eps=0.01; const n=dir.clone().normalize();
    const a=n.clone().applyAxisAngle(new THREE.Vector3(0,1,0), eps);
    const b=n.clone().applyAxisAngle(new THREE.Vector3(1,0,0), eps);
    const g1=surfaceRadius(a)-surfaceRadius(n); const g2=surfaceRadius(b)-surfaceRadius(n);
    const ta=a.sub(n).normalize(); const tb=b.sub(n).normalize();
    return ta.multiplyScalar(g1).add(tb.multiplyScalar(g2));
  }

  return { group, update, setTime, sunDir, sunElev, setRelief, surfaceRadius, normal, gradient };
}
