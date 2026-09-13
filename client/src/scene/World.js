import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TRACK,TRACK_LENGTH,TRACK_WIDTH,pointAt,edgePoint,edgeSegments,BARRIERS,getActiveMap } from '../../../shared/track.js';
import { makeCar,updateCarModel } from '../cars/CarModel.js';
import { seeded,generateTrees,keepCameraClear } from '../../../shared/scenery.js';
import { surfaceTexture } from './SurfaceTextures.js';
export class World {
  constructor(canvas,root=document.getElementById('game-root'),hooks={}){
    this.canvas=canvas;this.root=root;this.hooks=hooks;this.resizeObserver=null;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
    this.camera=new THREE.PerspectiveCamera(38,1,.1,1700);
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#141b22');this.skyUniforms={topColor:{value:new THREE.Color('#4b7896')},horizonColor:{value:new THREE.Color('#dce7e6')},bottomColor:{value:new THREE.Color('#789269')}};this.skyDome=this.createSkyDome();this.scene.add(this.skyDome);
    const pmrem=new THREE.PMREMGenerator(this.renderer),env=new RoomEnvironment();this.envTarget=pmrem.fromScene(env,.04);this.scene.environment=this.envTarget.texture;env.dispose();pmrem.dispose();
    this.fillLight=new THREE.HemisphereLight(0xbbd9ef,0x25232a,2);this.scene.add(this.fillLight);
    this.sun=new THREE.DirectionalLight(0xffecd9,4);this.sun.position.set(6,12,8);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.camera.left=-12;this.sun.shadow.camera.right=12;this.sun.shadow.camera.top=12;this.sun.shadow.camera.bottom=-12;this.sun.shadow.normalBias=.025;this.scene.add(this.sun);this.scene.add(this.sun.target);
    this.rim=new THREE.DirectionalLight(0x74bbff,2.6);this.rim.position.set(-8,5,-6);this.scene.add(this.rim);
    this.garage=new THREE.Group();this.scene.add(this.garage);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x080d12,metalness:.1,roughness:.85,envMapIntensity:.12}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;this.garage.add(floor);
    const stage=new THREE.Mesh(new THREE.CylinderGeometry(4.4,4.5,.055,128),new THREE.MeshStandardMaterial({color:0x111a22,metalness:.25,roughness:.7,envMapIntensity:.2}));stage.position.y=-.002;stage.receiveShadow=true;this.garage.add(stage);
    for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(4.45+i*.13,.008,4,128),new THREE.MeshBasicMaterial({color:i===0?0xc6f478:0x475663,transparent:true,opacity:i===0?.6:.3}));ring.rotation.x=Math.PI/2;ring.position.y=.03;this.garage.add(ring);}
    const grid=new THREE.GridHelper(100,50,0x56616a,0x35404b);grid.material.transparent=true;grid.material.opacity=.1;grid.position.y=.005;this.garage.add(grid);
    this.car=makeCar('supra');this.garage.add(this.car);this.car.rotation.y=-.45;
    this.mode='garage';this.orbit=0;this.models=new Map();this.cameraMode=0;this.lastCameraMode=0;this.raceGroup=null;this.adaptiveQuality=true;this.quality='medium';this.qualityCooldown=0;this.lowFpsSamples=0;this.highFpsSamples=0;
    this.tmpForward=new THREE.Vector3();this.tmpTarget=new THREE.Vector3();this.tmpDesired=new THREE.Vector3();this.tmpLook=new THREE.Vector3();
    this.onWindowResize=()=>this.resize();window.addEventListener('resize',this.onWindowResize,{passive:true});
    if(typeof ResizeObserver!=='undefined'){this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(root||canvas);}
    this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.hooks.onContextLost?.();},{passive:false});
    this.canvas.addEventListener('webglcontextrestored',()=>{this.renderer.resetState();this.hooks.onContextRestored?.();});
    this.resize();
  }
  createSkyDome(){
    const material=new THREE.ShaderMaterial({uniforms:this.skyUniforms,vertexShader:'varying vec3 vWorldPosition;void main(){vec4 worldPosition=modelMatrix*vec4(position,1.0);vWorldPosition=worldPosition.xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform vec3 topColor;uniform vec3 horizonColor;uniform vec3 bottomColor;varying vec3 vWorldPosition;void main(){float h=normalize(vWorldPosition).y;float top=smoothstep(-.05,.82,h);float horizon=smoothstep(-.2,.18,h);vec3 color=mix(bottomColor,topColor,top);color=mix(horizonColor,color,horizon);gl_FragColor=vec4(color,1.0);}',side:THREE.BackSide,depthWrite:false,fog:false});
    const dome=new THREE.Mesh(new THREE.SphereGeometry(1200,32,16),material);dome.frustumCulled=false;dome.renderOrder=-10;return dome;
  }
  setSkyTheme(theme){const names={topColor:'skyTop',horizonColor:'skyHorizon',bottomColor:'skyBottom'};for(const key of Object.keys(names))if(theme[names[key]])this.skyUniforms[key].value.set(theme[names[key]]);}
  resize(){
    const element=this.root||this.canvas.parentElement;const width=Math.max(1,Math.round(element?.clientWidth||innerWidth));const height=Math.max(1,Math.round(element?.clientHeight||innerHeight));
    this.renderer.setPixelRatio(this.pixelRatio||Math.min(window.devicePixelRatio||1,1.5));this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.size={width,height};
  }
  setQuality(value){
    this.quality=value;const dpr=Math.min(window.devicePixelRatio||1,1.5);this.pixelRatio=value==='low'?Math.min(dpr,1):dpr;
    this.renderer.shadowMap.enabled=value!=='low';const shadowSize=value==='low'?512:value==='medium'?1024:1536;this.sun.shadow.mapSize.set(shadowSize,shadowSize);this.renderer.setPixelRatio(this.pixelRatio);this.resize();
  }
  updateAdaptiveQuality(fps){
    if(!this.adaptiveQuality||!Number.isFinite(fps)||this.qualityCooldown>0){this.qualityCooldown=Math.max(0,this.qualityCooldown-.5);return;}
    if(fps<34){this.lowFpsSamples++;this.highFpsSamples=0;}else if(fps>56){this.highFpsSamples++;this.lowFpsSamples=0;}else{this.lowFpsSamples=0;this.highFpsSamples=0;}
    const levels=['low','medium','high'],index=levels.indexOf(this.quality);
    if(this.lowFpsSamples>=4&&index>0){this.setQuality(levels[index-1]);this.qualityCooldown=5;this.lowFpsSamples=0;}
    else if(this.highFpsSamples>=10&&index<2){this.setQuality(levels[index+1]);this.qualityCooldown=8;this.highFpsSamples=0;}
  }
  getStats(){const info=this.renderer.info;return {drawCalls:info.render.calls,triangles:info.render.triangles,textures:info.memory.textures,geometries:info.memory.geometries,pixelRatio:this.renderer.getPixelRatio(),size:this.size,quality:this.quality||'medium'};}
  dispose(){this.resizeObserver?.disconnect();window.removeEventListener('resize',this.onWindowResize);this.models.clear();this.renderer.dispose();this.renderer.forceContextLoss?.();}
  resetTrack(){if(!this.raceGroup)return;this.scene.remove(this.raceGroup);this.disposeObject(this.raceGroup);this.raceGroup=null;this.pickups=[];}
  setCar(id){if(this.car.userData.id===id)return;this.garage.remove(this.car);this.disposeObject(this.car);this.car=makeCar(id);this.garage.add(this.car);}
  setPaint(color){this.car.userData.paint.color.set(color);}
  disposeObject(root){const geometries=new Set(),materials=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});for(const g of geometries)g.dispose();for(const m of materials){m.map?.dispose();m.dispose();}}
  buildTrack(){
    if(this.raceGroup)return;const group=this.raceGroup=new THREE.Group();this.scene.add(group);
    const asphaltMap=surfaceTexture('asphalt');asphaltMap.repeat.set(5,1);asphaltMap.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());
    const theme=getActiveMap().theme;
    const asphalt=new THREE.MeshStandardMaterial({map:asphaltMap,color:theme.asphalt,roughness:.9,metalness:.08,envMapIntensity:.22});
    const strip=(inner,outer,material,height=.025)=>{
      const v=[],uv=[],indices=[];
      for(let i=0;i<=TRACK.length;i++){const p=TRACK[i%TRACK.length],s=i===TRACK.length?TRACK_LENGTH:p.s,a=edgePoint(p,inner),b=edgePoint(p,outer);v.push(a.x,height,a.z,b.x,height,b.z);uv.push(0,s/4,1,s/4);if(i<TRACK.length){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,material);mesh.receiveShadow=true;group.add(mesh);
    };
    strip(-TRACK_WIDTH/2,TRACK_WIDTH/2,asphalt);
    const grassMap=surfaceTexture('grass');grassMap.repeat.set(300,300);
    const grass=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),new THREE.MeshStandardMaterial({map:grassMap,color:theme.grass,roughness:1,envMapIntensity:.08}));grass.rotation.x=-Math.PI/2;grass.position.y=-.07;grass.receiveShadow=true;group.add(grass);
    if(theme.environment==='coast'){
      const water=new THREE.Mesh(new THREE.RingGeometry(285,1120,128),new THREE.MeshStandardMaterial({color:theme.water,roughness:.2,metalness:.08,transparent:true,opacity:.94,envMapIntensity:.35}));water.rotation.x=-Math.PI/2;water.position.y=-.035;water.receiveShadow=true;group.add(water);
      const foam=new THREE.Mesh(new THREE.RingGeometry(290,305,128),new THREE.MeshBasicMaterial({color:theme.foam,transparent:true,opacity:.45,side:THREE.DoubleSide}));foam.rotation.x=-Math.PI/2;foam.position.y=-.025;group.add(foam);
    }
    const gravel=new THREE.MeshStandardMaterial({map:surfaceTexture('gravel'),roughness:1,envMapIntensity:.1,side:THREE.DoubleSide});
    for(const side of[-1,1])strip(side*9.5,side*12,gravel,.008);
    for(const side of [-1,1])strip(side*9.1,side*9.25,new THREE.MeshBasicMaterial({color:0xe6e3bd,side:THREE.DoubleSide}),.04);
    if(theme.environment==='city')for(const side of [-1,1])strip(side*9.18,side*9.08,new THREE.MeshBasicMaterial({color:theme.neon}),.055);
    const boxGeo=new THREE.BoxGeometry(1,1,1),white=new THREE.MeshStandardMaterial({color:0xe6e8df}),red=new THREE.MeshStandardMaterial({color:0xc14d36}),barrierMat=new THREE.MeshStandardMaterial({color:theme.barrier,metalness:.45,roughness:.48});
    const instances=(count,geometry,mat)=>{const m=new THREE.InstancedMesh(geometry,mat,count);m.receiveShadow=true;group.add(m);return m;};
    const matrix=new THREE.Object3D();
    const curbSegments=[-1,1].flatMap(side=>edgeSegments(side*9.65,.9));
    const curbs=instances(curbSegments.length,boxGeo,white);const colors=[new THREE.Color(0xe3e4d6),new THREE.Color(0xd34e32)];
    const barriers=instances(BARRIERS.length,boxGeo,barrierMat);
    const placeSegment=(mesh,segment,i,y,height)=>{matrix.position.set(segment.x,y,segment.z);matrix.rotation.set(0,segment.yaw,0);matrix.scale.set(segment.halfWidth*2,height,segment.halfLength*2);matrix.updateMatrix();mesh.setMatrixAt(i,matrix.matrix);};
    curbSegments.forEach((segment,i)=>{placeSegment(curbs,segment,i,.045,.13);curbs.setColorAt(i,colors[Math.floor(segment.s/6)%2]);});
    BARRIERS.forEach((segment,i)=>placeSegment(barriers,segment,i,.55,.75));
    const dashes=instances(Math.ceil(TRACK_LENGTH/10),boxGeo,white);let di=0;
    for(let s=0;s<TRACK_LENGTH;s+=10){const p=pointAt(s);matrix.position.set(p.x,.055,p.z);matrix.rotation.set(0,p.yaw,0);matrix.scale.set(.16,.015,3.5);matrix.updateMatrix();dashes.setMatrixAt(di++,matrix.matrix);}
    const start=pointAt(0);for(let x=0;x<20;x++)for(let z=0;z<3;z++){const tile=new THREE.Mesh(new THREE.PlaneGeometry(.95,.95),new THREE.MeshBasicMaterial({color:(x+z)%2?0x20272b:0xf5f4e6}));tile.rotation.x=-Math.PI/2;tile.rotation.z=-start.yaw;const offset=(x-9.5)*.95;tile.position.set(start.x+start.dz*offset+start.dx*z*.95,.06,start.z-start.dx*offset+start.dz*z*.95);group.add(tile);}
    const makeSign=(text,s,color='#c5f479')=>{
      const p=pointAt(s),gate=new THREE.Group();gate.position.set(p.x,0,p.z);gate.rotation.y=p.yaw;group.add(gate);
      for(const side of[-1,1]){const post=new THREE.Mesh(new THREE.BoxGeometry(.4,10,.4),barrierMat);post.position.set(side*10.6,5,0);gate.add(post);}
      const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#172327';ctx.fillRect(0,0,1024,128);ctx.fillStyle=color;ctx.fillRect(0,120,1024,8);ctx.font='bold 60px sans-serif';ctx.textAlign='center';ctx.fillText(text,512,86);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      const banner=new THREE.Mesh(new THREE.BoxGeometry(21.7,1.4,.25),new THREE.MeshStandardMaterial({map:texture,roughness:.85}));banner.position.y=10;gate.add(banner);
    };
    makeSign(`TURBORUSH  /  ${getActiveMap().name.toUpperCase()}`,0);for(let i=1;i<12;i++)makeSign(i%3===0?'HIT THE APEX':'CHECKPOINT  '+String(i).padStart(2,'0'),i*TRACK_LENGTH/12,i%3===0?'#f99c6b':'#d0e6e4');
    const random=seeded(theme.environment==='city'?41:93);
    if(theme.environment==='forest'){
      const allTrees=generateTrees(),trees=this.quality==='low'?allTrees.filter((_,i)=>i%2===0):allTrees;
      const leaves=instances(trees.length*3,new THREE.ConeGeometry(1,2,9),new THREE.MeshStandardMaterial({color:0x597c58,roughness:1,envMapIntensity:.1}));const trunks=instances(trees.length,new THREE.CylinderGeometry(.15,.22,1,6),new THREE.MeshStandardMaterial({color:0x594633,roughness:1}));
      trees.forEach((t,i)=>{matrix.rotation.set(0,t.yaw,0);matrix.position.set(t.x,t.scale*.4,t.z);matrix.scale.set(1,t.scale,1);matrix.updateMatrix();trunks.setMatrixAt(i,matrix.matrix);for(let j=0;j<3;j++){matrix.position.y=t.scale*(.7+j*.32);matrix.scale.set(t.scale*(.6-j*.14),t.scale*.5,t.scale*(.6-j*.14));matrix.updateMatrix();leaves.setMatrixAt(i*3+j,matrix.matrix);leaves.setColorAt(i*3+j,new THREE.Color().setHSL(.27+t.tint*.09,.23,.55+j*.045));}});
      for(let i=0;i<20;i++){const angle=i/20*Math.PI*2;const mountain=new THREE.Mesh(new THREE.ConeGeometry(160+random()*100,150+random()*120,5),new THREE.MeshStandardMaterial({color:i%2?0x667a7b:0x798a87,flatShading:true}));mountain.position.set(Math.cos(angle)*900,15,Math.sin(angle)*900);group.add(mountain);}
    }else if(theme.environment==='coast'){
      const palmCount=this.quality==='low'?18:30;
      const palmTrunks=instances(palmCount,new THREE.CylinderGeometry(.16,.28,1,7),new THREE.MeshStandardMaterial({color:0x76533b,roughness:1}));const palmLeaves=instances(palmCount,new THREE.ConeGeometry(1.4,3.8,8),new THREE.MeshStandardMaterial({color:0x2f806d,roughness:.9}));
      for(let i=0;i<palmCount;i++){const angle=i/palmCount*Math.PI*2+.25,radius=300+random()*330,h=3.5+random()*2;matrix.position.set(Math.cos(angle)*radius,h/2,Math.sin(angle)*radius);matrix.rotation.set(0,angle,0);matrix.scale.set(1,h,1);matrix.updateMatrix();palmTrunks.setMatrixAt(i,matrix.matrix);matrix.position.y=h+.9;matrix.scale.set(1.15,1.15,1.15);matrix.updateMatrix();palmLeaves.setMatrixAt(i,matrix.matrix);}
      const rockCount=36,rocks=instances(rockCount,new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:0x8d8b79,roughness:1}));for(let i=0;i<rockCount;i++){const angle=random()*Math.PI*2,radius=280+random()*300;matrix.position.set(Math.cos(angle)*radius,-.02,Math.sin(angle)*radius);matrix.rotation.set(random(),random(),random());const size=1+random()*4;matrix.scale.set(size,size*.45,size*.8);matrix.updateMatrix();rocks.setMatrixAt(i,matrix.matrix);}
    }else{
      const buildingCount=this.quality==='low'?30:46;
      const buildingMat=new THREE.MeshStandardMaterial({color:theme.building,roughness:.72,metalness:.35,emissive:0x090d25,emissiveIntensity:.8});const buildings=instances(buildingCount,boxGeo,buildingMat);
      for(let i=0;i<buildingCount;i++){const angle=i/buildingCount*Math.PI*2,radius=300+random()*260,h=25+random()*125;matrix.position.set(Math.cos(angle)*radius,h/2,Math.sin(angle)*radius);matrix.rotation.set(0,angle+.5,0);matrix.scale.set(14+random()*22,h,14+random()*22);matrix.updateMatrix();buildings.setMatrixAt(i,matrix.matrix);}
      const neonMat=new THREE.MeshBasicMaterial({color:theme.neon});const neonAlt=new THREE.MeshBasicMaterial({color:theme.neonAlt});const signs=instances(42,new THREE.BoxGeometry(.22,.12,4.8),neonMat);const signsAlt=instances(42,new THREE.BoxGeometry(.16,.1,3.5),neonAlt);
      for(let i=0;i<42;i++){const angle=i/42*Math.PI*2,radius=285+random()*285,h=5+random()*45;matrix.position.set(Math.cos(angle)*radius,h,Math.sin(angle)*radius);matrix.rotation.set(0,angle,0);matrix.scale.set(1,1,1);matrix.updateMatrix();(i%2?signsAlt:signs).setMatrixAt(i,matrix.matrix);}
      const skyline=instances(24,new THREE.BoxGeometry(.5,1,.5),new THREE.MeshBasicMaterial({color:theme.neonAlt}));for(let i=0;i<24;i++){const angle=i/24*Math.PI*2,radius=240+random()*50;matrix.position.set(Math.cos(angle)*radius,3,Math.sin(angle)*radius);matrix.scale.set(1,5+random()*5,1);matrix.updateMatrix();skyline.setMatrixAt(i,matrix.matrix);}
    }
    this.pickups=[];const glow=new THREE.MeshBasicMaterial({color:0x9fffef});
    for(let i=0;i<16;i++){const p=pointAt(40+i*TRACK_LENGTH/16);const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(.5),glow);mesh.position.set(p.x,1.5,p.z);group.add(mesh);this.pickups.push({mesh,s:p.s});}
  }
  showGarage(){this.mode='garage';this.garage.visible=true;this.skyDome.visible=false;if(this.raceGroup)this.raceGroup.visible=false;for(const model of this.models.values())model.visible=false;this.scene.background.set('#141b22');this.scene.fog=new THREE.Fog(0x141b22,24,70);this.camera.fov=38;this.camera.updateProjectionMatrix();this.sun.position.set(6,12,8);this.sun.target.position.set(0,0,0);this.sun.intensity=4;this.fillLight.intensity=2;this.rim.intensity=2.6;this.renderer.toneMappingExposure=1.25;}
  showRace(racers){this.buildTrack();this.mode='race';this.garage.visible=false;this.skyDome.visible=true;this.raceGroup.visible=true;const theme=getActiveMap().theme;this.setSkyTheme(theme);this.scene.background.set(theme.sky);this.scene.fog=new THREE.Fog(theme.fog||theme.sky,theme.fogNear||150,theme.fogFar||850);const city=theme.environment==='city',coast=theme.environment==='coast';this.sun.intensity=city?.8:coast?3.1:2.6;this.fillLight.intensity=city?.7:coast?1.5:1.25;this.rim.intensity=city?2.2:coast?.9:.65;this.renderer.toneMappingExposure=city?1.18:1.05;for(const m of this.models.values()){this.scene.remove(m);this.disposeObject(m);}this.models.clear();for(const r of racers){const mesh=makeCar(r.carId);this.models.set(r.id,mesh);this.scene.add(mesh);updateCarModel(mesh,r,0);}this.camera.position.set(racers[0].x,6,racers[0].z-10);}
  thumbnails(){
    const result={};const oldId=this.car.userData.id;
    this.renderer.setSize(440,220,false);this.camera.aspect=2;this.camera.fov=35;this.camera.updateProjectionMatrix();this.camera.position.set(6,2.8,7.8);this.camera.lookAt(0,.7,0);
    for(const id of ['supra','bmw','bugatti']){this.setCar(id);this.car.rotation.y=-.35;this.renderer.render(this.scene,this.camera);result[id]=this.renderer.domElement.toDataURL('image/webp');}
    this.setCar(oldId);this.resize();return result;
  }
  render(dt,time,racers=[],localId){
    if(this.mode==='garage'){
      this.car.rotation.y=-.12+Math.sin(time*.2)*.11+this.orbit;
      const mobile=(this.size?.width||innerWidth)<760&&(this.size?.height||innerHeight)>(this.size?.width||innerWidth);this.camera.position.set(mobile?11:7.7,mobile?5.8:3.15,mobile?14.4:9.5);
      this.camera.lookAt(mobile?0:-1.15,mobile?1.9:.7,mobile?0:.05);
      this.camera.fov=mobile?42:36;this.camera.updateProjectionMatrix();
    }else{
      for(const r of racers){let mesh=this.models.get(r.id);if(!mesh){mesh=makeCar(r.carId);this.scene.add(mesh);this.models.set(r.id,mesh);}mesh.visible=true;updateCarModel(mesh,r,time,dt);}
      for(const [id,mesh]of this.models)if(!racers.some(r=>r.id===id))mesh.visible=false;
      const player=racers.find(r=>r.id===localId)||racers[0];
      if(player){
        const f=this.tmpForward.set(Math.sin(player.yaw),0,Math.cos(player.yaw));const target=this.tmpTarget.set(player.x,0,player.z);
        const distance=this.cameraMode===1?13:this.cameraMode===2?-1.8:8.2;
        const desired=this.tmpDesired.copy(target).addScaledVector(f,-distance);desired.y=this.cameraMode===2?1.35:this.cameraMode===1?6.4:4.1;
        keepCameraClear(desired);
        // Do not fly the camera through the cabin when entering or leaving hood view.
        if(this.lastCameraMode!==this.cameraMode&&(this.cameraMode===2||this.lastCameraMode===2))this.camera.position.copy(desired);
        else this.camera.position.lerp(desired,1-Math.exp(-dt*6));
        this.lastCameraMode=this.cameraMode;
        // The target is already kept inside the road. Re-clamping the smoothed
        // camera each frame caused a visible snap at fast corners.
        const look=this.tmpLook.copy(target).addScaledVector(f,8);look.y=1;this.camera.lookAt(look);
        this.camera.fov+=( (player.boosting?76:65)-this.camera.fov)*dt*3;this.camera.updateProjectionMatrix();
        this.sun.position.set(player.x+20,35,player.z+15);this.sun.target.position.set(player.x,0,player.z);
      }
      for(const p of this.pickups){p.mesh.rotation.y=time;p.mesh.position.y=1.3+Math.sin(time*2+p.s)*.25;}
    }
    this.renderer.render(this.scene,this.camera);
  }
}
