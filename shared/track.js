// One shared circuit definition keeps the visuals and server collision boundaries identical.
// The final bend needs a radius larger than the road and shoulders. A tighter
// centreline makes its inside edge fold back across the driving surface.
const controls = [[0,0],[0,145],[-65,215],[-170,195],[-210,110],[-145,35],[-200,-60],[-120,-145],[10,-155],[110,-105],[100,-50],[40,-30]];
const catmull = (a,b,c,d,t) => .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
export const TRACK_WIDTH = 19;
export const LAPS = 3;
export const GATES = 12;
export const TRACK = [];
for (let i=0;i<controls.length;i++) for (let j=0;j<64;j++) {
  const a=controls[(i-1+controls.length)%controls.length],b=controls[i],c=controls[(i+1)%controls.length],d=controls[(i+2)%controls.length],t=j/64;
  TRACK.push({ x:catmull(a[0],b[0],c[0],d[0],t), z:catmull(a[1],b[1],c[1],d[1],t) });
}
// Put the starting grid on the straight, with room to accelerate before the first turn.
TRACK.push(...TRACK.splice(0,32));
let distance=0;
for(let i=0;i<TRACK.length;i++) {
  const p=TRACK[i],q=TRACK[(i+1)%TRACK.length],dx=q.x-p.x,dz=q.z-p.z;
  p.s=distance;p.segment=Math.hypot(dx,dz);p.dx=dx/p.segment;p.dz=dz/p.segment;p.yaw=Math.atan2(p.dx,p.dz);
  distance+=p.segment;
}
export const TRACK_LENGTH=distance;
// Mitered vertex normals join adjacent offset segments at the same endpoint.
// Road surfaces, curbs and solid walls all use these shared edge coordinates.
for (let i=0;i<TRACK.length;i++) {
  const p=TRACK[i],prev=TRACK[(i-1+TRACK.length)%TRACK.length];
  const x=prev.dz+p.dz,z=-prev.dx-p.dx,divisor=x*p.dz-z*p.dx;
  p.nx=x/divisor;p.nz=z/divisor;
}
export const edgePoint = (p, offset) => ({x:p.x+p.nx*offset,z:p.z+p.nz*offset});
export function edgeSegments(offset, width) {
  return TRACK.map((p,i)=>{
    const a=edgePoint(p,offset),b=edgePoint(TRACK[(i+1)%TRACK.length],offset);
    const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    return {a,b,x:(a.x+b.x)/2,z:(a.z+b.z)/2,yaw:Math.atan2(dx,dz),
      halfWidth:width/2,halfLength:length/2+.01,
      side:{x:dz/length,z:-dx/length},forward:{x:dx/length,z:dz/length},s:p.s};
  });
}
export const BARRIERS = [-1,1].flatMap(side=>edgeSegments(side*(TRACK_WIDTH/2+.05),.2));
export const wrap = s => ((s%TRACK_LENGTH)+TRACK_LENGTH)%TRACK_LENGTH;
export const angleDiff = (a,b) => Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function pointAt(s) {
  s=wrap(s);
  let lo=0,hi=TRACK.length-1;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(TRACK[mid].s<=s)lo=mid;else hi=mid-1;}
  const p=TRACK[lo],d=s-p.s;
  return {x:p.x+p.dx*d,z:p.z+p.dz*d,dx:p.dx,dz:p.dz,yaw:p.yaw,s};
}
export function nearestPoint(x,z) {
  let best=null,min=Infinity;
  for (const p of TRACK) {
    const along=Math.max(0,Math.min(p.segment,(x-p.x)*p.dx+(z-p.z)*p.dz));
    const px=p.x+p.dx*along,pz=p.z+p.dz*along,d2=(x-px)**2+(z-pz)**2;
    if(d2<min){min=d2;best={x:px,z:pz,dx:p.dx,dz:p.dz,yaw:p.yaw,s:wrap(p.s+along),offset:(x-px)*p.dz-(z-pz)*p.dx,distance:Math.sqrt(d2)};}
  }
  return best;
}
