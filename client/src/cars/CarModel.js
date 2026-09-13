import * as THREE from 'three';
import { getCar } from '../../../shared/cars.js';
import { contactShadow } from '../scene/SurfaceTextures.js';
const UP=new THREE.Vector3(0,1,0);
function rod(a,b,r,material,parent){const delta=new THREE.Vector3(...b).sub(new THREE.Vector3(...a));const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),8),material);mesh.position.copy(new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(UP,delta.normalize());parent.add(mesh);return mesh;}
function shell(sections,bottom,material,parent){
  const vertices=[],indices=[];
  for(const {z,w,h}of sections)for(const [x,y]of [[-w*.83,bottom],[-w,bottom+.16],[-w,h-.17],[-w*.83,h],[w*.83,h],[w,h-.17],[w,bottom+.16],[w*.83,bottom]])vertices.push(x,y,z);
  for(let i=0;i<sections.length-1;i++)for(let j=0;j<8;j++){const a=i*8+j,b=i*8+(j+1)%8,c=b+8,d=a+8;indices.push(a,c,b,a,d,c);}
  for(let j=1;j<7;j++){indices.push(0,j+1,j);const n=(sections.length-1)*8;indices.push(n,n+j,n+j+1);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
export function makeCar(id,colorOverride){
  const car=getCar(id),root=new THREE.Group(),wheels=[],flames=[];
  const paint=new THREE.MeshPhysicalMaterial({color:colorOverride||car.color,metalness:.45,roughness:.32,clearcoat:1,clearcoatRoughness:.2,envMapIntensity:.8,side:THREE.DoubleSide});
  const dark=new THREE.MeshStandardMaterial({color:0x10151c,metalness:.55,roughness:.34});
  const glass=new THREE.MeshPhysicalMaterial({color:0x152a39,metalness:.4,roughness:.25,clearcoat:1,envMapIntensity:.7,side:THREE.DoubleSide});
  const chrome=new THREE.MeshStandardMaterial({color:0xb7c4d2,metalness:.9,roughness:.2});
  const rubber=new THREE.MeshStandardMaterial({color:0x111317,roughness:.83});
  const headlight=new THREE.MeshBasicMaterial({color:0xd6f8ff});
  const tail=new THREE.MeshStandardMaterial({color:0xf9293a,emissive:0xff1024,emissiveIntensity:2});
  function box(w,h,d,x,y,z,mat=paint){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;}
  const hyper=id==='bugatti',bmw=id==='bmw',width=hyper?1.08:1;
  const sections=hyper?[{z:-2.3,w:.9,h:.9},{z:-1.6,w:1.1,h:1.02},{z:-.3,w:1.04,h:.92},{z:1.5,w:1.1,h:.82},{z:2.3,w:.91,h:.66}]:bmw?[{z:-2.3,w:.92,h:.97},{z:-1.5,w:1.02,h:1.06},{z:.4,w:.94,h:1.02},{z:1.5,w:1.02,h:.98},{z:2.3,w:.88,h:.82}]:[{z:-2.3,w:.88,h:1.03},{z:-1.5,w:1.03,h:1.13},{z:-.2,w:.96,h:1.02},{z:1.5,w:1,h:.89},{z:2.3,w:.82,h:.74}];
  shell(sections,.39,paint,root);
  box(width*1.9,.12,4.2,0,.35,0,dark);
  box(width*2,.07,.3,0,.31,2.21,dark);
  box(width*1.9,.12,.3,0,.43,-2.19,dark);
  const roofY=hyper?1.48:bmw?1.7:1.61;
  const back=hyper?-1.2:-1.3,roofBack=hyper?-.7:-.65,roofFront=bmw?.56:.35,front=bmw?1.2:1.07;
  shell([{z:back,w:.81,h:1.05},{z:roofBack,w:.74,h:roofY},{z:roofFront,w:.7,h:roofY-.03},{z:front,w:.83,h:1.01}],.99,glass,root);
  box(1.28,.055,roofFront-roofBack,0,roofY-.017,(roofFront+roofBack)/2,bmw?dark:paint);
  for(const side of [-1,1]){
    rod([side*.81,1.06,back],[side*.73,roofY-.08,roofBack],.038,paint,root);
    rod([side*.7,roofY-.09,roofFront],[side*.83,1.04,front],.036,paint,root);
    if(bmw)rod([side*.86,1.04,-.2],[side*.74,roofY-.1,-.2],.03,dark,root);
    box(.27,.12,.35,side*1.01,1.16,.65,paint);
    box(.055,.04,.19,side*.98,.96,-.35,chrome);
    box(.095,.095,3.15,side*width,.36,0,dark);
    for(const z of [-1.48,1.42]){
      const pivot=new THREE.Group();pivot.position.set(side*width,.45,z);root.add(pivot);
      // Steering turns the upright around Y; only its child wheel rolls around local X.
      const rolling=new THREE.Group();pivot.add(rolling);
      const tire=new THREE.Mesh(new THREE.CylinderGeometry(.43,.43,.3,32),rubber);tire.rotation.z=Math.PI/2;pivot.add(tire);tire.castShadow=true;
      const rim=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.315,24),dark);rim.rotation.z=Math.PI/2;pivot.add(rim);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.32,.021,8,32),chrome);ring.rotation.y=Math.PI/2;ring.position.x=side*.163;pivot.add(ring);
      const disc=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,.02,24),chrome);disc.rotation.z=Math.PI/2;disc.position.x=side*.12;pivot.add(disc);
      const caliper=new THREE.Mesh(new THREE.BoxGeometry(.05,.18,.09),new THREE.MeshStandardMaterial({color:hyper?0x3687ff:0xfe5932}));caliper.position.set(side*.145,.05,.22);pivot.add(caliper);
      for(let k=0;k<(hyper?8:5);k++){
        const spoke=new THREE.Mesh(new THREE.BoxGeometry(.045,.59,.034),chrome);spoke.position.x=side*.18;spoke.rotation.x=k*Math.PI/(hyper?8:5);pivot.add(spoke);
      }
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.04,16),dark);hub.rotation.z=Math.PI/2;hub.position.x=side*.2;pivot.add(hub);
      for(const part of [...pivot.children])if(part!==rolling&&part!==caliper)rolling.add(part);
      wheels.push({pivot,rolling,front:z>0,side});
      const arch=new THREE.Mesh(new THREE.TorusGeometry(.46,.037,6,24,Math.PI),paint);arch.rotation.y=Math.PI/2;arch.rotation.z=0;arch.position.set(side*(width+.012),.45,z);root.add(arch);
    }
  }
  if(id==='supra'){
    for(const side of [-1,1]){
      box(.085,.43,.14,side*.72,1.23,-1.99,dark);
      for(let k=0;k<2;k++){const light=new THREE.Mesh(new THREE.CylinderGeometry(.115,.115,.025,24),tail);light.rotation.x=Math.PI/2;light.position.set(side*(.45+k*.26),.82,-2.309);root.add(light);}
      const light=box(.54,.1,.13,side*.49,.745,2.22,headlight);light.rotation.y=-side*.15;
      box(.35,.17,.05,side*.57,.49,2.315,dark);
    }
    box(1.93,.09,.4,0,1.46,-2.02,paint);box(.62,.19,.08,0,.49,2.32,dark);
  }else if(bmw){
    for(const side of [-1,1]){
      box(.36,.43,.075,side*.215,.66,2.305,dark);
      for(let k=0;k<4;k++)box(.022,.36,.02,side*.215+(k-1.5)*.073,.67,2.35,chrome);
      box(.49,.075,.06,side*.65,.83,2.29,headlight);
      box(.38,.075,.04,side*.61,.93,-2.313,tail);box(.05,.16,.04,side*.79,.88,-2.313,tail);
      box(.35,.18,.04,side*.68,.5,2.3,dark);
    }
    box(1.8,.075,.15,0,1.06,-2.23,dark);
  }else{
    for(const side of [-1,1]){
      for(let k=0;k<4;k++)box(.1,.073,.06,side*(.4+k*.13),.71,2.26,headlight);
      box(.5,.2,.04,side*.65,.48,2.3,dark);
      const path=new THREE.CatmullRomCurve3([[side*1.085,.48,-.75],[side*1.1,.54,-1.25],[side*1.07,1.01,-1.32],[side*.82,1.4,-.65],[side*.84,1.35,-.35]].map(p=>new THREE.Vector3(...p)));
      const trim=new THREE.Mesh(new THREE.TubeGeometry(path,20,.035,6,false),chrome);root.add(trim);
      box(.045,.33,.55,side*1.052,.71,-.75,dark);
    }
    box(1.76,.05,.04,0,.84,-2.31,tail);
    const curve=new THREE.CatmullRomCurve3([[-.2,.42,2.33],[-.25,.66,2.33],[-.18,.8,2.33],[.18,.8,2.33],[.25,.66,2.33],[.2,.42,2.33]].map(p=>new THREE.Vector3(...p)));
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve,24,.027,6,false),chrome));box(.4,.29,.02,0,.57,2.32,dark);
    for(let i=0;i<7;i++)box(1.16,.025,.045,0,1.07,-1.25-i*.1,dark);
  }
  for(const side of [-1,1]){
    const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.095,.095,.22,16),chrome);pipe.rotation.x=Math.PI/2;pipe.position.set(side*.61,.44,-2.35);root.add(pipe);
    const flame=new THREE.Mesh(new THREE.ConeGeometry(.11,.95,9),new THREE.MeshBasicMaterial({color:0x60e9ff,transparent:true,opacity:.85,depthWrite:false}));flame.rotation.x=-Math.PI/2;flame.position.set(side*.61,.44,-2.88);flame.visible=false;root.add(flame);flames.push(flame);
  }
  const plateCanvas=document.createElement('canvas');plateCanvas.width=256;plateCanvas.height=64;const ctx=plateCanvas.getContext('2d');ctx.fillStyle='#e3e8dd';ctx.fillRect(0,0,256,64);ctx.fillStyle='#17202c';ctx.font='bold 33px sans-serif';ctx.textAlign='center';ctx.fillText('TURBORUSH',128,45);
  const tex=new THREE.CanvasTexture(plateCanvas);tex.colorSpace=THREE.SRGBColorSpace;const plate=box(.51,.13,.014,0,.66,-2.335,new THREE.MeshBasicMaterial({map:tex}));plate.rotation.y=Math.PI;
  root.add(contactShadow());
  root.userData={wheels,flames,tail,paint,id};
  return root;
}
export function updateCarModel(model,r,time,dt=0){
  model.position.set(r.x,.025+Math.sin(time*20)*Math.min(Math.abs(r.speed)/5000,.014),r.z);model.rotation.y=r.yaw;
  const wheelStep=r.finishTime!==null?0:r.speed*Math.max(0,Math.min(dt,.05))/.43;
  for(const {pivot,rolling,front}of model.userData.wheels){
    pivot.rotation.y=front?(r.wheelSteer??r.steer*.33):0;
    rolling.rotation.x=(rolling.rotation.x+wheelStep)%(Math.PI*2);
  }
  for(const flame of model.userData.flames){flame.visible=r.boosting;flame.scale.y=.8+Math.sin(time*47)*.25;}
  model.userData.tail.emissiveIntensity=r.speed<3?1:2;
}
