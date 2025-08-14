// invaderExpo.js — reconnaissance + réparation symétrique + rendu céramique instancié
import { RoundedBoxGeometry } from 'https://unpkg.com/three@0.158.0/examples/jsm/geometries/RoundedBoxGeometry.js';

export async function buildInvaderFromImageEXPO(img, params, THREE){
  const { extraThreshold=10, bevel=0.12, gap=0.10, depth=1.6, auto=true } = params ?? {};

  // 1) Prétraitement
  const maxDim=512;
  const src = drawToCanvas(img, maxDim);
  const W=src.width, H=src.height;
  const ctx=src.getContext('2d', { willReadFrequently:true });
  const data=ctx.getImageData(0,0,W,H).data;

  const bg = averageBorder(data,W,H);

  // distance + Otsu
  const dist=new Float32Array(W*H); let minD=1e9,maxD=-1e9;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++){
    const i=(y*W+x)*4; const d=colorDistYUV(data[i],data[i+1],data[i+2], bg.r,bg.g,bg.b);
    dist[y*W+x]=d; if(d<minD)minD=d; if(d>maxD)maxD=d;
  }
  const thrAuto = otsuHistogram(dist,64);
  const thr = thrAuto + extraThreshold;

  let mask = new Uint8Array(W*H);
  for (let i=0;i<dist.length;i++) mask[i] = dist[i]>thr ? 1 : 0;
  mask = erode(mask,W,H); mask = dilate(mask,W,H); mask = dilate(mask,W,H);

  // Largest component
  const labels=new Int32Array(W*H).fill(-1);
  let best=null, id=0;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++){
    const idx=y*W+x; if(mask[idx] && labels[idx]===-1){ const info=flood(mask,labels,W,H,x,y,id++); if(!best||info.area>best.area) best=info; }
  }
  if (!best) return fallback(THREE);

  const core=new Uint8Array(W*H); for (let i=0;i<labels.length;i++) if (labels[i]===best.id) core[i]=1;

  // Orientation (PCA) & rectification projective
  const outline = marchingSquares(core, W,H);
  const corners = quadCorners(outline);
  const rect = perspectiveRectify(src, corners);

  // Re-sample & mask
  const W2=rect.width, H2=rect.height;
  const ctx2=rect.getContext('2d', { willReadFrequently:true });
  const d2=ctx2.getImageData(0,0,W2,H2).data;
  const bg2=averageBorder(d2,W2,H2);
  const dist2=new Float32Array(W2*H2);
  for (let y=0;y<H2;y++) for (let x=0;x<W2;x++){
    const i=(y*W2+x)*4; dist2[y*W2+x]=colorDistYUV(d2[i],d2[i+1],d2[i+2], bg2.r,bg2.g,bg2.b);
  }
  let mask2 = new Uint8Array(W2*H2);
  const thr2 = otsuHistogram(dist2,64)+extraThreshold;
  for (let i=0;i<dist2.length;i++) mask2[i] = dist2[i]>thr2 ? 1 : 0;
  mask2=erode(mask2,W2,H2); mask2=dilate(mask2,W2,H2);

  // Grille par autocorr
  const projX=new Float32Array(W2), projY=new Float32Array(H2);
  for (let y=0;y<H2;y++) for (let x=0;x<W2;x++){ const v=mask2[y*W2+x]; projX[x]+=v; projY[y]+=v; }
  let px=dominantPeriod(projX,2,Math.min(100,Math.floor(W2/3)));
  let py=dominantPeriod(projY,2,Math.min(100,Math.floor(H2/3)));
  let nx=Math.max(8,Math.min(64,Math.round(W2/Math.max(1,px||16))));
  let ny=Math.max(8,Math.min(64,Math.round(H2/Math.max(1,py||16))));
  if (!auto) nx=ny=36;

  // Grille & réparation symétrique
  const grid = sampleGrid(rect, nx, ny, mask2);
  const repaired = repairBySymmetry(grid, nx, ny);

  // Palette compressée (k-means)
  const clusters = kmeansColors(repaired.cells.map(c=>[c.r,c.g,c.b]), 8);
  const labelsC = repaired.cells.map(c => nearest(c, clusters));

  // Construction par couleur (InstancedMesh)
  const group = new THREE.Group();
  const plateW=nx, plateH=ny, halfW=plateW/2, halfH=plateH/2;
  const spacing = clamp(params.gap??0.1, 0, 0.45);
  const bevelR = clamp(params.bevel??0.12, 0, 0.35);
  const baseDepth = Math.max(0.2, params.depth??1.6);

  const perColor = new Map();
  for (let j=0;j<ny;j++){
    for (let i=0;i<nx;i++){
      const idx=j*nx+i; const cell=repaired.cells[idx];
      if (!cell || !repaired.mask[idx]) continue;
      const colorId = labelsC[idx];
      if (!perColor.has(colorId)) perColor.set(colorId, []);
      const tw=1-spacing, th=1-spacing;
      const dx=(i+0.5)-halfW, dy=(ny-j-0.5)-halfH;
      const bright=0.2126*cell.r/255 + 0.7152*cell.g/255 + 0.0722*cell.b/255;
      const dz = baseDepth * (0.75 + 0.4*bright);
      perColor.get(colorId).push({dx,dy,tw,th,dz});
    }
  }
  for (const [id, items] of perColor){
    const col=clusters[id]; const hex=((col[0]&255)<<16)|((col[1]&255)<<8)|(col[2]&255);
    const geom=new RoundedBoxGeometry(1,1,1, 6, bevelR);
    const mat=new THREE.MeshPhysicalMaterial({ color:hex, roughness:0.35, metalness:0.0, clearcoat:1.0, clearcoatRoughness:0.12, envMapIntensity:0.65 });
    const inst=new THREE.InstancedMesh(geom, mat, items.length);
    let m=new THREE.Matrix4();
    for (let k=0;k<items.length;k++){ const it=items[k]; const s=new THREE.Vector3(it.tw,it.th,it.dz); m.compose(new THREE.Vector3(it.dx,it.dy,it.dz*0.5+0.01), new THREE.Quaternion(), s); inst.setMatrixAt(k,m); }
    inst.castShadow = true;
    group.add(inst);
  }
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(plateW*1.04, plateH*1.04),
    new THREE.MeshPhysicalMaterial({ color:0x0b0f1d, roughness:0.9, metalness:0.0, clearcoat:0.5, clearcoatRoughness:0.3 })
  );
  plate.position.z = -0.02; group.add(plate);

  group.traverse(obj=>{ if(obj.isMesh && obj.material && 'emissive' in obj.material){ obj.material.emissive = obj.material.color.clone(); obj.material.emissiveIntensity = 0.15; }});

  return group;
}

// --- Vision helpers (idem ULTRA mais enrichi + réparation symétrique) ---
function drawToCanvas(img,maxDim){ const s=Math.min(maxDim/img.width, maxDim/img.height,1.0); const w=Math.round(img.width*s), h=Math.round(img.height*s); const cnv=document.createElement('canvas'); cnv.width=w; cnv.height=h; cnv.getContext('2d').drawImage(img,0,0,w,h); return cnv; }
function averageBorder(data,W,H){ let r=0,g=0,b=0,n=0; for(let x=0;x<W;x++){ let i=(0*W+x)*4; r+=data[i]; g+=data[i+1]; b+=data[i+2]; n++; i=((H-1)*W+x)*4; r+=data[i]; g+=data[i+1]; b+=data[i+2]; n++; } for(let y=0;y<H;y++){ let i=(y*W+0)*4; r+=data[i]; g+=data[i+1]; b+=data[i+2]; n++; i=(y*W+(W-1))*4; r+=data[i]; g+=data[i+1]; b+=data[i+2]; n++; } return { r:r/n,g:g/n,b:b/n }; }
function colorDistYUV(r1,g1,b1,r2,g2,b2){ const y1=0.299*r1+0.587*g1+0.114*b1, y2=0.299*r2+0.587*g2+0.114*b2; const u1=-0.14713*r1-0.28886*g1+0.436*b1, u2=-0.14713*r2-0.28886*g2+0.436*b2; const v1=0.615*r1-0.51499*g1-0.10001*b1, v2=0.615*r2-0.51499*g2-0.10001*b2; const dy=y1-y2, du=u1-u2, dv=v1-v2; return Math.sqrt(0.7*dy*dy + 0.2*du*du + 0.2*dv*dv); }
function otsu(hist){ const n=hist.reduce((a,b)=>a+b,0); let sum=0; for(let i=0;i<hist.length;i++) sum+=i*hist[i]; let sumB=0,wB=0,bestT=0,maxVar=-1; for(let i=0;i<hist.length;i++){ wB+=hist[i]; if(!wB) continue; const wF=n-wB; if(!wF) break; sumB+=i*hist[i]; const mB=sumB/wB, mF=(sum-sumB)/wF; const between=wB*wF*(mB-mF)*(mB-mF); if(between>maxVar){ maxVar=between; bestT=i/hist.length; } } return bestT; }
function otsuHistogram(values,binsN){ let min=Infinity,max=-Infinity; for(const v of values){ if(v<min)min=v; if(v>max)max=v; } const bins=new Array(binsN).fill(0); for(const v of values){ const b=Math.max(0,Math.min(binsN-1,Math.floor((v-min)/(max-min+1e-6)*(binsN-1)))); bins[b]++; } const t=otsu(bins); return t*(max-min)+min; }
function erode(mask,W,H){ const out=new Uint8Array(W*H); for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){ let keep=1; for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++){ if(!mask[(y+j)*W+(x+i)]){ keep=0; j=2; break; } } out[y*W+x]=keep; } return out; }
function dilate(mask,W,H){ const out=new Uint8Array(W*H); for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){ let val=0; for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++){ if(mask[(y+j)*W+(x+i)]){ val=1; j=2; break; } } out[y*W+x]=val; } return out; }
function flood(mask,labels,W,H,sx,sy,id){ const stack=[[sx,sy]]; let area=0; let minx=sx,miny=sy,maxx=sx,maxy=sy; while(stack.length){ const [x,y]=stack.pop(); if(x<0||y<0||x>=W||y>=H) continue; const idx=y*W+x; if(!mask[idx]||labels[idx]!==-1) continue; labels[idx]=id; area++; if(x<minx)minx=x; if(y<miny)miny=y; if(x>maxx)maxx=x; if(y>maxy)maxy=y; stack.push([x+1,y]);stack.push([x-1,y]);stack.push([x,y+1]);stack.push([x,y-1]); } return {id,area,bbox:[minx,miny,maxx,maxy]}; }
function marchingSquares(mask,W,H){ let sx=-1,sy=-1; for(let y=0;y<H;y++){ let f=false; for(let x=0;x<W;x++){ if(mask[y*W+x]){ sx=x; sy=y; f=true; break; } } if(f) break; } if(sx<0) return []; const pts=[]; let x=sx,y=sy,dir=0,loop=0; const inside=(x,y)=>(x>=0&&y>=0&&x<W&&y<H && mask[y*W+x]); do{ pts.push([x,y]); const right = dir===0?[x,y-1]:dir===1?[x+1,y]:dir===2?[x,y+1]:[x-1,y]; const front = dir===0?[x+1,y]:dir===1?[x,y+1]:dir===2?[x-1,y]:[x,y-1]; if(!inside(...right) && inside(...front)){ x=front[0]; y=front[1]; } else if(inside(...right)){ dir=(dir+3)%4; } else { dir=(dir+1)%4; } loop++; if(loop>W*H*4) break; } while(!(x===sx && y===sy)); return simplifyRDP(pts,1.5); }
function simplifyRDP(points,eps){ if(points.length<3) return points; const stack=[[0,points.length-1]]; const res=new Array(points.length).fill(false); res[0]=res[points.length-1]=true; function sqDist(p,a,b){ const t=((p[0]-a[0])*(b[0]-a[0]) + (p[1]-a[1])*(b[1]-a[1])) / (((b[0]-a[0])**2+(b[1]-a[1])**2)+1e-9); const tx=a[0]+t*(b[0]-a[0]), ty=a[1]+t*(b[1]-a[1]); return (p[0]-tx)**2+(p[1]-ty)**2; } while(stack.length){ const [s,e]=stack.pop(); let idx=-1,maxD=0; for(let i=s+1;i<e;i++){ const d=sqDist(points[i],points[s],points[e]); if(d>maxD){ maxD=d; idx=i; } } if(Math.sqrt(maxD)>eps){ res[idx]=true; stack.push([s,idx]); stack.push([idx,e]); } } return points.filter((_,i)=>res[i]); }
function quadCorners(pts){ if(pts.length<4) return [[0,0],[W,0],[W,H],[0,H]]; let min1=Infinity,min2=Infinity,max1=-Infinity,max2=-Infinity; let c1=null,c2=null,c3=null,c4=null; for(const p of pts){ const s=p[0]+p[1]; const d=p[0]-p[1]; if(s<min1){ min1=s; c1=p; } if(s>max1){ max1=s; c3=p; } if(d<min2){ min2=d; c2=p; } if(d>max2){ max2=d; c4=p; } } return [c1,c2,c3,c4]; }
function perspectiveRectify(cnv,corners){ const [p0,p1,p2,p3]=corners; const w=Math.max(dist(p0,p1), dist(p2,p3)); const h=Math.max(dist(p1,p2), dist(p3,p0)); const out=document.createElement('canvas'); out.width=Math.max(64,Math.floor(w)); out.height=Math.max(64,Math.floor(h)); const ctx=out.getContext('2d'); const H=computeHomography([p0,p1,p2,p3], [[0,0],[out.width,0],[out.width,out.height],[0,out.height]]); const inv=invert3x3(H); const src=cnv.getContext('2d').getImageData(0,0,cnv.width,cnv.height); const dst=ctx.createImageData(out.width,out.height); for(let y=0;y<out.height;y++){ for(let x=0;x<out.width;x++){ const den=inv[6]*x + inv[7]*y + inv[8]; const sx=(inv[0]*x + inv[1]*y + inv[2])/den; const sy=(inv[3]*x + inv[4]*y + inv[5])/den; const ix=Math.max(0,Math.min(cnv.width-1, Math.round(sx))); const iy=Math.max(0,Math.min(cnv.height-1, Math.round(sy))); const si=(iy*cnv.width+ix)*4; const di=(y*out.width+x)*4; dst.data[di]=src.data[si]; dst.data[di+1]=src.data[si+1]; dst.data[di+2]=src.data[si+2]; dst.data[di+3]=255; } } ctx.putImageData(dst,0,0); return out; }
function dist(a,b){ const dx=a[0]-b[0], dy=a[1]-b[1]; return Math.sqrt(dx*dx+dy*dy); }
function computeHomography(srcPts,dstPts){ const A=[]; for(let i=0;i<4;i++){ const [x,y]=srcPts[i], [u,v]=dstPts[i]; A.push([-x,-y,-1, 0,0,0, x*u, y*u, u]); A.push([0,0,0, -x,-y,-1, x*v, y*v, v]); } const M=new Array(8).fill(0).map(()=>new Array(8).fill(0)); const b=new Array(8).fill(0); for(let i=0;i<8;i++){ for(let j=0;j<8;j++) M[i][j]=A[i][j]; b[i]=-A[i][8]; } const h=gaussianSolve(M,b); return [h[0],h[1],h[2], h[3],h[4],h[5], h[6],h[7], 1]; }
function invert3x3(m){ const [a,b,c,d,e,f,g,h,i]=m; const A=e*i-f*h, B=-(d*i-f*g), C=d*h-e*g, D=-(b*i-c*h), E=a*i-c*g, F=-(a*h-b*g), G=b*f-c*e, H=-(a*f-b*d), I=a*e-b*d; const det=a*A + b*B + c*C; return [A/det, D/det, G/det, B/det, E/det, H/det, C/det, F/det, I/det]; }
function gaussianSolve(M,b){ const n=M.length; for(let i=0;i<n;i++){ let max=i; for(let k=i+1;k<n;k++) if(Math.abs(M[k][i])>Math.abs(M[max][i])) max=k; [M[i],M[max]]=[M[max],M[i]]; [b[i],b[max]]=[b[max],b[i]]; const div=M[i][i]||1e-9; for(let j=i;j<n;j++) M[i][j]/=div; b[i]/=div; for(let k=0;k<n;k++) if(k!==i){ const f=M[k][i]; for(let j=i;j<n;j++) M[k][j]-=f*M[i][j]; b[k]-=f*b[i]; } } return b; }
function dominantPeriod(signal,minLag,maxLag){ let best=minLag,bestScore=-1e9; for(let lag=minLag; lag<=maxLag; lag++){ let s=0; for(let i=0;i<signal.length-lag;i++) s += signal[i]*signal[i+lag]; if(s>bestScore){ bestScore=s; best=lag; } } return best; }
function sampleGrid(cnv,nx,ny,mask){ const w=cnv.width, h=cnv.height; const ctx=cnv.getContext('2d',{ willReadFrequently:true }); const data=ctx.getImageData(0,0,w,h).data; const out=new Array(nx*ny); const cw=w/nx, ch=h/ny; for(let j=0;j<ny;j++){ for(let i=0;i<nx;i++){ const x0=Math.floor(i*cw), x1=Math.floor((i+1)*cw); const y0=Math.floor(j*ch), y1=Math.floor((j+1)*ch); let r=0,g=0,b=0,n=0, fg=0, tot=0; for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const idx=(y*w+x)*4; r+=data[idx]; g+=data[idx+1]; b+=data[idx+2]; n++; if (mask) { fg += mask[y*w+x] ? 1 : 0; tot++; } } r/=Math.max(1,n); g/=Math.max(1,n); b/=Math.max(1,n); out[j*nx+i]={ r,g,b, fgRatio:(fg/Math.max(1,tot)) }; } } return out; }

function repairBySymmetry(cells, nx, ny){
  // Détecte l’axe vertical le plus probable et remplit les trous en miroir
  const mask = new Array(nx*ny).fill(0);
  const cols = new Array(nx).fill(0);
  for (let j=0;j<ny;j++) for (let i=0;i<nx;i++){ const c=cells[j*nx+i]; const fg=(c.fgRatio>0.33); if (fg){ mask[j*nx+i]=1; cols[i]++; } }
  // score d'axe au demi-pixel près
  let bestAxis=nx/2, bestScore=-1e9;
  for (let ax=0; ax<nx; ax++){
    let s=0;
    for (let i=0;i<nx;i++){
      const mir = Math.round(2*ax - i);
      if (mir>=0 && mir<nx){
        for (let j=0;j<ny;j++){
          const a=mask[j*nx+i], b=mask[j*nx+mir];
          if (a||b) s += (a===b) ? 1 : -0.5;
        }
      }
    }
    if (s>bestScore){ bestScore=s; bestAxis=ax; }
  }
  // Réparation: si un côté a du signal et pas l'autre → copie couleur
  const repaired = cells.map(c=>({...c}));
  const repairedMask = new Array(nx*ny).fill(0);
  for (let j=0;j<ny;j++){
    for (let i=0;i<nx;i++){
      const mir = Math.round(2*bestAxis - i);
      if (mir<0||mir>=nx) continue;
      const A = cells[j*nx+i], B = cells[j*nx+mir];
      const Af = A.fgRatio>0.33, Bf = B.fgRatio>0.33;
      if (Af && !Bf){ repaired[j*nx+mir] = { ...A, fgRatio: A.fgRatio }; repairedMask[j*nx+mir]=1; }
      if (Bf && !Af){ repaired[j*nx+i] = { ...B, fgRatio: B.fgRatio }; repairedMask[j*nx+i]=1; }
      if (Af && Bf){ repairedMask[j*nx+i]=1; repairedMask[j*nx+mir]=1; }
    }
  }
  return { cells: repaired, mask: repairedMask };
}

function kmeansColors(points,k){
  if(points.length===0) return [[255,255,255]];
  const centers=[]; let idx=Math.floor(Math.random()*points.length); centers.push(points[idx]);
  for(let c=1;c<k;c++){ let bestIdx=0, bestDist=-1; for(let i=0;i<points.length;i++){ let dmin=1e9; for(const cen of centers){ const d=(points[i][0]-cen[0])**2+(points[i][1]-cen[1])**2+(points[i][2]-cen[2])**2; if(d<dmin) dmin=d; } if(dmin>bestDist){ bestDist=dmin; bestIdx=i; } } centers.push(points[bestIdx]); }
  for(let iter=0;iter<8;iter++){ const sum=centers.map(()=>[0,0,0,0]); for(const p of points){ let best=0,bestD=1e9; for(let c=0;c<centers.length;c++){ const d=(p[0]-centers[c][0])**2+(p[1]-centers[c][1])**2+(p[2]-centers[c][2])**2; if(d<bestD){ bestD=d; best=c; } } sum[best][0]+=p[0]; sum[best][1]+=p[1]; sum[best][2]+=p[2]; sum[best][3]++; } for(let c=0;c<centers.length;c++){ if(sum[c][3]>0){ centers[c]=[sum[c][0]/sum[c][3], sum[c][1]/sum[c][3], sum[c][2]/sum[c][3]]; } } } return centers.map(c=>[Math.round(c[0]),Math.round(c[1]),Math.round(c[2])]); }
function nearest(c, centers){ let best=0,bestD=1e9; for(let i=0;i<centers.length;i++){ const cn=centers[i]; const d=(c.r-cn[0])**2+(c.g-cn[1])**2+(c.b-cn[2])**2; if(d<bestD){ bestD=d; best=i; } } return best; }
function clamp(x,a,b){ return Math.max(a, Math.min(b,x)); }
function fallback(THREE){ const g=new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(1.2,1,0.6), new THREE.MeshStandardMaterial({ color:0x66ccff, roughness:0.5 }))); return g; }
