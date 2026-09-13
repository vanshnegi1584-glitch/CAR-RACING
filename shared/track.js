// Shared map catalogue. The active map is rebuilt in-place so every existing
// physics, scenery, minimap, and renderer consumer keeps the same API.
const catmull=(a,b,c,d,t)=>.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
const mapDefinition=(id,name,tag,controls,theme)=>({id,name,tag,controls,theme});
export const TRACKS=[
  mapDefinition('pinecrest','Pinecrest Circuit','FOREST RUN',[[0,0],[0,145],[-65,215],[-170,195],[-210,110],[-145,35],[-200,-60],[-120,-145],[10,-155],[110,-105],[100,-50],[40,-30]],{sky:'#bdd3df',asphalt:0xc4c7cb,grass:0xb6c6a7,barrier:0x899698}),
  mapDefinition('coastline','Coastline Sprint','OCEAN DRIVE',[[0,0],[0,150],[-82,218],[-190,195],[-228,105],[-170,12],[-215,-88],[-120,-170],[20,-182],[145,-128],[150,-36],[62,-28]],{sky:'#b7d8df',asphalt:0xb9c6c4,grass:0x9fc6b1,barrier:0x78969b}),
  mapDefinition('neon-loop','Neon Loop','CITY LIGHTS',[[0,0],[0,142],[-72,226],[-184,214],[-224,120],[-178,20],[-224,-84],[-122,-176],[20,-188],[148,-130],[154,-38],[58,-26]],{sky:'#9bb3cc',asphalt:0x989fae,grass:0x7c9b8e,barrier:0x657287}),
];
export const MAPS=TRACKS.map(({id,name,tag,theme})=>({id,name,tag,theme}));
export const RANDOM_MAP_ID='random';
export const TRACK_WIDTH=19,LAPS=3,GATES=12;
export const TRACK=[];
export let TRACK_LENGTH=0;
export let ACTIVE_MAP=MAPS[0];
export let trackVersion=0;
export const BARRIERS=[];

const rebuild=(definition)=>{
  const raw=[];
  for(let i=0;i<definition.controls.length;i++)for(let j=0;j<64;j++){
    const a=definition.controls[(i-1+definition.controls.length)%definition.controls.length],b=definition.controls[i],c=definition.controls[(i+1)%definition.controls.length],d=definition.controls[(i+2)%definition.controls.length],t=j/64;
    raw.push({x:catmull(a[0],b[0],c[0],d[0],t),z:catmull(a[1],b[1],c[1],d[1],t)});
  }
  TRACK.length=0;TRACK.push(...raw.slice(32),...raw.slice(0,32));
  let distance=0;
  for(let i=0;i<TRACK.length;i++){
    const p=TRACK[i],q=TRACK[(i+1)%TRACK.length],dx=q.x-p.x,dz=q.z-p.z;
    p.s=distance;p.segment=Math.hypot(dx,dz);p.dx=dx/p.segment;p.dz=dz/p.segment;p.yaw=Math.atan2(p.dx,p.dz);distance+=p.segment;
  }
  TRACK_LENGTH=distance;
  for(let i=0;i<TRACK.length;i++){
    const p=TRACK[i],prev=TRACK[(i-1+TRACK.length)%TRACK.length],x=prev.dz+p.dz,z=-prev.dx-p.dx,divisor=x*p.dz-z*p.dx;
    p.nx=x/divisor;p.nz=z/divisor;
  }
  BARRIERS.length=0;BARRIERS.push(...[-1,1].flatMap(side=>edgeSegments(side*(TRACK_WIDTH/2+.05),.2)));
  trackVersion++;
};
export function setActiveTrack(id){const definition=TRACKS.find(track=>track.id===id)||TRACKS[0];ACTIVE_MAP=MAPS.find(map=>map.id===definition.id)||MAPS[0];rebuild(definition);return ACTIVE_MAP;}
export const getActiveMap=()=>ACTIVE_MAP;
export const edgePoint=(p,offset)=>({x:p.x+p.nx*offset,z:p.z+p.nz*offset});
export function edgeSegments(offset,width){return TRACK.map((p,i)=>{const a=edgePoint(p,offset),b=edgePoint(TRACK[(i+1)%TRACK.length],offset),dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);return {a,b,x:(a.x+b.x)/2,z:(a.z+b.z)/2,yaw:Math.atan2(dx,dz),halfWidth:width/2,halfLength:length/2+.01,side:{x:dz/length,z:-dx/length},forward:{x:dx/length,z:dz/length},s:p.s};});}
export const wrap=s=>((s%TRACK_LENGTH)+TRACK_LENGTH)%TRACK_LENGTH;
export const angleDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function pointAt(s){
  s=wrap(s);let lo=0,hi=TRACK.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(TRACK[mid].s<=s)lo=mid;else hi=mid-1;}
  const p=TRACK[lo],d=s-p.s;return {x:p.x+p.dx*d,z:p.z+p.dz*d,dx:p.dx,dz:p.dz,yaw:p.yaw,s};
}
export function nearestPoint(x,z){
  let best=null,min=Infinity;for(const p of TRACK){const along=Math.max(0,Math.min(p.segment,(x-p.x)*p.dx+(z-p.z)*p.dz)),px=p.x+p.dx*along,pz=p.z+p.dz*along,d2=(x-px)**2+(z-pz)**2;if(d2<min){min=d2;best={x:px,z:pz,dx:p.dx,dz:p.dz,yaw:p.yaw,s:wrap(p.s+along),offset:(x-px)*p.dz-(z-pz)*p.dx,distance:Math.sqrt(d2)};}}return best;
}
setActiveTrack('pinecrest');
