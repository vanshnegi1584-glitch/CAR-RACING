import './styles/style.css';
import { World } from './scene/World.js';
import { Controls } from './controls/Controls.js';
import { GameAudio } from './audio/Audio.js';
import { NetworkManager } from './multiplayer/NetworkManager.js';
import { CARS,getCar } from '../../shared/cars.js';
import { TRACK,TRACK_LENGTH,LAPS,angleDiff,MAPS,RANDOM_MAP_ID,getActiveMap,setActiveTrack } from '../../shared/track.js';
import { createRacer,stepRacer,stepRace,ranking,botInput,resetRacer,EMPTY_INPUT } from '../../shared/physics.js';
import { resolveCarCollisions } from '../../shared/collisions.js';
const $=id=>document.getElementById(id);
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatTime=(seconds,precise=false)=>seconds==null?'—':`${String(Math.floor(seconds/60)).padStart(2,'0')}:${(seconds%60).toFixed(precise?3:1).padStart(precise?6:4,'0')}`;
function readStorage(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
const settings={master:.6,music:.25,sfx:.7,mute:false,quality:matchMedia('(pointer:coarse)').matches?'low':'medium',...readStorage('turborush-settings',{})};
let selected=localStorage.getItem('turborush-car')||'supra';if(!CARS.some(c=>c.id===selected))selected='supra';
let selectedMapId=localStorage.getItem('turborush-map')||'pinecrest';if(!MAPS.some(map=>map.id===selectedMapId))selectedMapId='pinecrest';
let onlineMapId=localStorage.getItem('turborush-online-map')||RANDOM_MAP_ID;if(onlineMapId!==RANDOM_MAP_ID&&!MAPS.some(map=>map.id===onlineMapId))onlineMapId=RANDOM_MAP_ID;
let resultsSignature='';
let world,mode='garage',room=null,modal=null,previousFocus=null,racers=[],localId='you',elapsed=0,countdown=3,paused=false,localResults=false,onlineStarted=null,onlineState=null,snapshotAt=0,inputTimer=0,lastCheckpoint=0,toastTimer,checkpointTimer,lastCount='',lastLeaderboard='',fixedAccumulator=0;
let pageHidden=false,frameRunning=false,rafId=0,initializing=false,debugFrames=0,debugTime=0,debugFps=0,debugAverage=0;
const debugEnabled=new URLSearchParams(location.search).get('debug')==='1';
if(debugEnabled)$('perf-panel').classList.remove('hidden');
const audio=new GameAudio(settings);
function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),4200);}
function openModal(type,content){
  if(!modal)previousFocus=document.activeElement;
  modal=type;$('modal-content').innerHTML=content;$('modal-backdrop').classList.remove('hidden');controls.clear();controls.enabled=false;
  requestAnimationFrame(()=>$('modal-content').querySelector('input,button,select')?.focus());
}
function closeModal(){
  if(modal==='lobby'){return toast('Use Leave Room to exit the lobby.');}
  $('modal-backdrop').classList.add('hidden');modal=null;paused=false;controls.enabled=mode!=='garage';previousFocus?.focus?.();
}
function showGarage(){mode='garage';localResults=false;onlineStarted=null;racers=[];controls.clear();controls.enabled=false;$('garage-screen').classList.remove('hidden');$('race-screen').classList.add('hidden');world.showGarage();$('modal-backdrop').classList.add('hidden');modal=null;document.body.classList.remove('race-active');}
function updateCar(id){
  selected=id;localStorage.setItem('turborush-car',id);world.setCar(id);const car=getCar(id);
  $('ghost-name').textContent=car.name.toUpperCase();$('car-category').textContent=`${car.category} / ${car.number}`;$('brand-name').textContent=car.brand;
  $('car-name').innerHTML=`${car.name}<span>${id==='supra'?'MK IV':id==='bmw'?'COMP.':'W16'}</span>`;$('car-description').textContent=car.description;
  $('spec-power').innerHTML=`${car.power}<small>HP</small>`;$('spec-speed').innerHTML=`${Math.round(car.speed*3.6)}<small>KM/H</small>`;$('spec-drive').textContent=car.drive;
  document.querySelectorAll('.car-card').forEach(el=>{const active=el.dataset.car===id;el.classList.toggle('selected',active);el.setAttribute('aria-pressed',active);el.querySelector('.card-tag').textContent=active?'SELECTED':getCar(el.dataset.car).category;});
  const colors=[car.color,'#e3e7e7','#272c34','#bc2d3e'];$('car-paints').innerHTML=colors.map((c,i)=>`<button class="paint ${i===0?'selected':''}" style="background:${c}" data-paint="${c}" aria-label="Preview ${['signature','silver','black','red'][i]} paint" title="Showroom paint preview"></button>`).join('');
  $('car-paints').querySelectorAll('button').forEach(b=>b.onclick=()=>{world.setPaint(b.dataset.paint);$('car-paints').querySelectorAll('button').forEach(p=>p.classList.toggle('selected',p===b));});
}
function mapOptions(selected=selectedMapId,includeRandom=false){return `${includeRandom?`<option value="${RANDOM_MAP_ID}" ${selected===RANDOM_MAP_ID?'selected':''}>Random map each race</option>`:''}${MAPS.map(map=>`<option value="${map.id}" ${selected===map.id?'selected':''}>${map.name} · ${map.tag}</option>`).join('')}`;}
function mapName(id){return id===RANDOM_MAP_ID?'Random map':MAPS.find(map=>map.id===id)?.name||'Pinecrest Circuit';}
function showOnline(){
  if(room)return renderLobby();
  openModal('online',`<div class="eyebrow">BETTER WITH A RIVAL</div><h2 id="modal-title">The grid is waiting.</h2><p class="subtitle">Create a room, share the code, and settle it on the track.<br>2–8 drivers. Desktop and mobile, racing together.</p><label class="field">YOUR DRIVER NAME<input id="driver-name" maxlength="18" placeholder="Enter your name" autocomplete="nickname" value="${escapeHTML(localStorage.getItem('turborush-name')||'')}"></label><label class="field">RACE MAP<select id="online-map">${mapOptions(onlineMapId,true)}</select></label><button class="primary" id="create-room">CREATE A ROOM <span>↗</span></button><div class="divider"><span>HAVE A CODE?</span></div><div class="join-row"><label class="field"><input id="join-code" placeholder="ROOM CODE" maxlength="5" autocapitalize="characters" aria-label="Room code"></label><button class="secondary" id="join-room">JOIN RACE →</button></div><p class="form-note">Hosts can change the map in the lobby. Choose Random map each race for a different circuit whenever the race starts.</p>`);
  $('online-map').onchange=e=>{onlineMapId=e.target.value;localStorage.setItem('turborush-online-map',onlineMapId);};
  const data=()=>{const name=$('driver-name').value.trim();localStorage.setItem('turborush-name',name);return {name,carId:selected,mapId:onlineMapId};};
  $('create-room').onclick=()=>run(()=>network.action('create',data()));
  $('join-room').onclick=()=>run(()=>network.action('join',{...data(),code:$('join-code').value}));
  $('join-code').onkeydown=e=>{if(e.key==='Enter')$('join-room').click();};
}
async function run(fn){try{await fn();}catch(e){toast(e.message);}}
function renderLobby(){
  if(!room||room.state!=='lobby')return;const me=room.players.find(p=>p.id===network.id),host=room.host===network.id,allReady=room.players.length>=2&&room.players.every(p=>p.ready&&p.connected);
  openModal('lobby',`<div class="eyebrow">${escapeHTML(mapName(room.mapId)).toUpperCase()} / 3 LAPS</div><h2 id="modal-title">Meet your competition.</h2><div class="room-code"><div><span>ROOM CODE · ${room.players.length}/8 DRIVERS</span><strong>${room.code}</strong></div><button id="copy-code">COPY CODE</button></div><label class="field lobby-map-field">RACE MAP${host?`<select id="room-map">${mapOptions(room.mapId,true)}</select>`:`<strong class="lobby-map-name">${escapeHTML(mapName(room.mapId))}</strong>`}</label><div>${room.players.map((p,i)=>`<div class="lobby-row"><div class="driver-avatar">${String(i+1).padStart(2,'0')}</div><div class="driver-meta"><strong>${escapeHTML(p.name)}${p.id===room.host?'<b class="host-tag">HOST</b>':''}</strong><small>${getCar(p.carId).brand} ${getCar(p.carId).name}${p.id===network.id?' · YOU':''}</small></div><span class="ready-tag ${p.ready?'yes':''}">${!p.connected?'RECONNECTING':p.ready?'✓ READY':'NOT READY'}</span></div>`).join('')}</div><div class="lobby-car-select">${CARS.map(c=>`<button data-lobby-car="${c.id}" class="${me?.carId===c.id?'chosen':''}">${c.brand} ${c.name}</button>`).join('')}</div><div class="modal-actions"><button class="secondary" id="leave-room">LEAVE ROOM</button><button class="primary" id="ready-room">${me?.ready?'CANCEL READY':'I’M READY ✓'}</button></div>${host?`<button class="primary" id="start-room" style="margin-top:10px" ${allReady?'':'disabled'}>START RACE →</button>`:'<p class="form-note">The host chooses the map. Everyone must be ready before the race can start.</p>'}`);
  $('copy-code').onclick=()=>run(async()=>{if(navigator.clipboard){await navigator.clipboard.writeText(room.code);toast('Room code copied: '+room.code);}else toast('Room code: '+room.code);});
  $('leave-room').onclick=leaveOnline;
  $('ready-room').onclick=()=>run(()=>network.action('ready',{ready:!me.ready}));
  if(host)$('room-map').onchange=()=>{onlineMapId=$('room-map').value;localStorage.setItem('turborush-online-map',onlineMapId);return run(()=>network.action('map',{mapId:onlineMapId}));};
  if(host)$('start-room').onclick=()=>run(()=>network.action('start'));
  document.querySelectorAll('[data-lobby-car]').forEach(b=>b.onclick=()=>run(async()=>{await network.action('select',{carId:b.dataset.lobbyCar});updateCar(b.dataset.lobbyCar);}));
}
async function leaveOnline(){await run(async()=>{await network.action('leave');room=null;showGarage();});}
function beginRace(type,states,id){
  mode=type;racers=states;localId=id;paused=false;localResults=false;lastCheckpoint=0;lastLeaderboard='';lastCount='';elapsed=0;countdown=3;fixedAccumulator=0;
  $('garage-screen').classList.add('hidden');$('race-screen').classList.remove('hidden');$('modal-backdrop').classList.add('hidden');modal=null;$('checkpoint-note').textContent='';
  $('race-mode').textContent=type==='practice'?'QUICK RACE / VS AI':`ONLINE / ROOM ${room?.code||''}`;controls.clear();controls.enabled=true;document.body.classList.add('race-active');world.showRace(states);
  audio.start().catch(()=>{});
}
function quickRace(){
  if(room){toast('Leave your online room before starting Quick Race.');return renderLobby();}
  const name=localStorage.getItem('turborush-name')||'You';
  beginRace('practice',[createRacer('you',name,selected,0),...['Apex','Ghost','Rook'].map((name,i)=>({...createRacer('bot'+i,name,CARS[(i+1)%3].id,i+1),bot:true}))],'you');
}
function showHelp(){openModal('help',`<div class="eyebrow">A LITTLE KNOW-HOW. A LOT OF THROTTLE.</div><h2 id="modal-title">Find your racing line.</h2><p class="subtitle">Follow the circuit through every checkpoint in order.<br>Three laps. First over the line wins.</p><div class="help-list"><div><kbd>W / ↑</kbd>Accelerate</div><div><kbd>S / ↓</kbd>Brake, then reverse</div><div><kbd>A D / ← →</kbd>Steer</div><div><kbd>SPACE</kbd>Nitro boost</div><div><kbd>SHIFT</kbd>Hold to drift</div><div><kbd>R</kbd>Recover to the track</div><div><kbd>C</kbd>Change camera</div><div><kbd>ESC</kbd>Pause / race menu</div></div><p class="help-note">On mobile, use the touch pedals and steering buttons. You can steer, accelerate, and boost at the same time. Open Settings → Adjust Touch Controls to move or resize them.<br><br>Lift off before tight corners. Nitro refills while driving, and refills faster while drifting. The glowing crystals add a bonus.</p><button class="primary" id="help-done">GOT IT →</button>`);$('help-done').onclick=closeModal;}
function showSettings(){
  openModal('settings',`<div class="eyebrow">MAKE IT YOURS</div><h2 id="modal-title">In the driver's seat.</h2><label class="field">GRAPHICS QUALITY<select id="quality">${['low','medium','high'].map(v=>`<option value="${v}" ${settings.quality===v?'selected':''}>${v[0].toUpperCase()+v.slice(1)}</option>`).join('')}</select></label>${[['master','Master volume'],['music','Music volume'],['sfx','Engine & effects']].map(([key,label])=>`<label class="settings-row">${label}<input type="range" min="0" max="1" step=".05" value="${settings[key]}" data-setting="${key}"></label>`).join('')}<label class="settings-row">Mute all audio<input type="checkbox" id="mute" ${settings.mute?'checked':''}></label><button class="secondary" id="control-settings">ADJUST TOUCH CONTROLS</button><p class="form-note">Lower graphics quality reduces resolution and disables dynamic shadows. Touch-control positions and size are saved on this device.</p><button class="primary" id="save-settings">BACK TO GARAGE →</button>`);
  $('quality').onchange=e=>{settings.quality=e.target.value;world.setQuality(settings.quality);saveSettings();};
  document.querySelectorAll('[data-setting]').forEach(el=>el.oninput=()=>{settings[el.dataset.setting]=Number(el.value);audio.start().catch(()=>{});saveSettings();});
  $('mute').onchange=e=>{settings.mute=e.target.checked;saveSettings();};$('control-settings').onclick=showControlSettings;$('save-settings').onclick=closeModal;
}
function showControlSettings(){
  openModal('control-layout',`<div class="eyebrow">MOBILE CONTROLS</div><h2 id="modal-title">Set your layout.</h2><p class="subtitle">Drag a control to move it. Tap a control, then use the slider to change its size. Your layout is saved for the next race.</p><div id="control-layout-preview" aria-label="Touch control layout editor"></div><div class="control-editor-meta"><strong id="control-editor-selected">Selected: THROTTLE</strong><label>SIZE <input id="control-editor-size" type="range" min="65" max="145" step="1" value="112"></label></div><div class="modal-actions"><button class="secondary" id="reset-controls">RESET POSITIONS</button><button class="primary" id="control-layout-done">DONE →</button></div>`);
  controls.mountEditor($('control-layout-preview'),$('control-editor-size'),$('control-editor-selected'));
  $('reset-controls').onclick=()=>{controls.resetLayout();controls.mountEditor($('control-layout-preview'),$('control-editor-size'),$('control-editor-selected'));};
  $('control-layout-done').onclick=()=>{controls.saveLayout();closeModal();};
}
function saveSettings(){localStorage.setItem('turborush-settings',JSON.stringify(settings));$('sound-button').textContent=settings.mute?'♩':'♪';$('sound-button').setAttribute('aria-label',settings.mute?'Unmute sound':'Mute sound');}
function pauseMenu(){
  if(mode==='garage')return;if(modal==='pause')return closeModal();if(modal)return;
  paused=mode==='practice';
  openModal('pause',`<div class="eyebrow">${mode==='practice'?'TAKE A BREATHER':'THE RACE IS STILL LIVE'}</div><h2 id="modal-title">${mode==='practice'?'Race paused.':'Race menu.'}</h2><p class="subtitle">${mode==='practice'?'Your rivals can wait a moment.':'Online races keep running while this menu is open.'}</p><button class="primary" id="resume">BACK TO THE RACE →</button><div class="modal-actions"><button class="secondary" id="reset-car">RESET CAR</button><button class="secondary" id="exit-race">LEAVE RACE</button></div>`);
  $('resume').onclick=closeModal;$('reset-car').onclick=()=>{reset();closeModal();};$('exit-race').onclick=()=>mode==='online'?leaveOnline():showGarage();
}
function reset(){if(mode==='practice'){const r=racers.find(r=>r.id===localId);if(r)resetRacer(r);}else if(mode==='online')run(()=>network.action('reset'));}
function showResults(){
  if(localResults)return;localResults=true;resultsSignature='';
  const order=ranking(racers),me=racers.find(r=>r.id===localId),place=order.findIndex(r=>r.id===localId)+1;
  openModal('results',`<div class="eyebrow">PINECREST CIRCUIT / RESULTS</div><h2 id="modal-title">${place===1&&me?.finishTime!==null?'That’s how it’s done.':'What a rush.'}</h2><p class="subtitle">${me?.finishTime!==null?`Finished P${place} · Best lap ${formatTime(me.bestLap)} · Nitro used ${Math.round(me.nitroUsed)}`:'Race complete. Get ready for the next round.'}</p><div id="results-rows"></div><div id="results-actions"></div>`);
  refreshResults();
}
function refreshResults(){
  if(modal!=='results')return;
  const signature=[mode,onlineState,room?.host,...racers.map(r=>`${r.id}:${r.finishTime}:${r.bestLap}`)].join('|');
  if(signature===resultsSignature)return;resultsSignature=signature;
  $('results-rows').innerHTML=`<table class="results-table"><thead><tr><th>POS</th><th>DRIVER / CAR</th><th>TOTAL</th><th>BEST LAP</th></tr></thead><tbody>${ranking(racers).map((r,i)=>`<tr class="${r.id===localId?'me':''}"><td>${String(i+1).padStart(2,'0')}</td><td>${escapeHTML(r.name)}${r.bot?' · AI':''}<small>${getCar(r.carId).brand} ${getCar(r.carId).name}</small></td><td>${r.finishTime===null?(onlineState==='results'?'DNF':'Racing…'):formatTime(r.finishTime)}</td><td>${formatTime(r.bestLap)}</td></tr>`).join('')}</tbody></table>`;
  if(mode==='practice'){$('results-actions').innerHTML='<div class="modal-actions"><button class="secondary" id="back-garage">GARAGE</button><button class="primary" id="play-again">RACE AGAIN ↗</button></div>';$('back-garage').onclick=showGarage;$('play-again').onclick=quickRace;}
  else {
    $('results-actions').innerHTML=`<div class="modal-actions"><button class="secondary" id="results-leave">LEAVE ROOM</button>${room?.host===network.id?`<button class="primary" id="return-lobby" ${onlineState==='results'?'':'disabled'}>RETURN TO LOBBY →</button>`:''}</div><p class="form-note">${onlineState==='results'?'The host can return everyone to the lobby for another race.':'Waiting for the other drivers to finish (up to 90 seconds after the first finish). The host can then start another race.'}</p>`;
    $('results-leave').onclick=leaveOnline;if($('return-lobby'))$('return-lobby').onclick=()=>run(()=>network.action('lobby'));
  }
}
const controls=new Controls(action=>{if(action==='reset')reset();if(action==='pause')pauseMenu();if(action==='camera'){world.cameraMode=(world.cameraMode+1)%3;toast(['Chase camera','Far chase camera','Hood camera'][world.cameraMode]);}});
const network=new NetworkManager({
  connection:connected=>{$('connection').querySelector('span').textContent=connected?'SERVER ONLINE':'SOLO AVAILABLE';$('connection').querySelector('i').style.background=connected?'#cef882':'#f4ad73';if(!connected&&mode==='online'){controls.clear();toast('Connection lost. Reconnecting to your room…');}},
  room:next=>{room=next;if(next.mapId&&next.mapId!==RANDOM_MAP_ID&&next.mapId!==selectedMapId)selectMap(next.mapId);if(next.state==='lobby'){if(mode==='online')showGarage();renderLobby();}},
  snapshot:snapshot=>{
    snapshotAt=performance.now();onlineState=snapshot.state;
    if(snapshot.mapId&&snapshot.mapId!==selectedMapId)selectMap(snapshot.mapId);
    if(onlineStarted!==snapshot.startsAt||mode!=='online'){
      onlineStarted=snapshot.startsAt;beginRace('online',snapshot.players.map(p=>({...p})),network.id);
    }
    elapsed=snapshot.elapsed;countdown=Math.max(0,(snapshot.startsAt-snapshot.serverNow)/1000);
    const old=new Map(racers.map(r=>[r.id,r]));
    racers=snapshot.players.map(state=>{
      const previous=old.get(state.id);
      if(!previous)return {...state};
      const error=Math.hypot(previous.x-state.x,previous.z-state.z);
      if(error>6)return {...state};
      if(state.id===localId){
        // Keep local prediction continuous between 20 Hz server snapshots. The
        // server still corrects the position, fuel and race progress, but its
        // velocity is not injected every snapshot, which used to shake the
        // chase camera while accelerating.
        const blend=Math.min(.22,.06+error*.04),corrected={...state,x:previous.x+(state.x-previous.x)*blend,z:previous.z+(state.z-previous.z)*blend,yaw:previous.yaw+angleDiff(state.yaw,previous.yaw)*blend};
        for(const key of ['vx','vz','speed','steer','wheelSteer','yawRate','driftAmount','drifting','boosting'])if(previous[key]!==undefined)corrected[key]=previous[key];
        return corrected;
      }
      const blend=.45;
      return {...state,x:previous.x+(state.x-previous.x)*blend,z:previous.z+(state.z-previous.z)*blend,yaw:previous.yaw+angleDiff(state.yaw,previous.yaw)*blend};
    });
    if(snapshot.state==='results')showResults();refreshResults();
  },
});
function drawTrackPreview(){const p=TRACK.filter((_,i)=>i%8===0).map(p=>`${(p.x+225)/350*135+8},${(p.z+165)/390*72+6}`).join(' ');$('track-preview').innerHTML=`<polyline points="${p}" fill="none" stroke="#b9d39f" stroke-width="3" stroke-linejoin="round"/><circle cx="95" cy="37" r="3" fill="#c9f879"/>`;}
function updateMapUI(){const map=getActiveMap();if($('track-name'))$('track-name').textContent=map.name;if($('track-description'))$('track-description').innerHTML=`${map.tag} <span>•</span> 3 LAPS`;if($('track-tag'))$('track-tag').textContent=`MAP ${MAPS.findIndex(item=>item.id===map.id)+1}`;if($('track-select'))$('track-select').value=map.id;drawTrackPreview();}
let minimapPath=[];
function rebuildMinimapPath(){minimapPath=TRACK.map(p=>({x:(p.x+225)/350*160+25,y:(p.z+165)/390*155+15}));}
function selectMap(id){const map=setActiveTrack(id);selectedMapId=map.id;localStorage.setItem('turborush-map',map.id);world?.resetTrack?.();rebuildMinimapPath();updateMapUI();return map;}
const mapContext=$('minimap').getContext('2d');
function drawMinimap(){
  const ctx=mapContext;ctx.clearRect(0,0,220,190);if(!minimapPath.length)rebuildMinimapPath();
  ctx.beginPath();minimapPath.forEach((m,i)=>{if(!i)ctx.moveTo(m.x,m.y);else ctx.lineTo(m.x,m.y);});ctx.closePath();ctx.strokeStyle='#182f3690';ctx.lineWidth=10;ctx.stroke();ctx.strokeStyle='#e4f2e3c0';ctx.lineWidth=3;ctx.stroke();
  for(const r of racers){const x=(r.x+225)/350*160+25,y=(r.z+165)/390*155+15;ctx.beginPath();ctx.arc(x,y,r.id===localId?5:3.5,0,Math.PI*2);ctx.fillStyle=r.id===localId?'#ceff81':getCar(r.carId).color;ctx.fill();ctx.strokeStyle='#182f36';ctx.lineWidth=1.5;ctx.stroke();}
}
function updateHUD(){
  const me=racers.find(r=>r.id===localId);if(!me)return;
  const order=ranking(racers),position=order.findIndex(r=>r.id===localId)+1;
  $('lap').innerHTML=`${Math.min(LAPS,Math.max(1,me.lap))}<small>/ ${LAPS}</small>`;$('race-time').textContent=formatTime(me.finishTime??elapsed,true);$('position').innerHTML=`${position}<small>/ ${racers.length}</small>`;
  $('speed').textContent=String(Math.round(Math.abs(me.speed)*3.6)).padStart(3,'0');const nitro=Math.round(me.nitro/getCar(me.carId).nitro*100);$('nitro-percent').textContent=nitro+'%';$('nitro-fill').style.width=nitro+'%';$('speed-lines').classList.toggle('on',me.boosting);
  const count=countdown>0?String(Math.ceil(countdown)):elapsed<.8?'GO!':'';$('countdown').textContent=count;
  if(count!==lastCount&&count){audio.tone(count==='GO!'?880:440,.2,.16);lastCount=count;}
  if(me.passed>lastCheckpoint){lastCheckpoint=me.passed;if(me.passed>1){$('checkpoint-note').textContent=me.nextGate===1?`LAP ${Math.min(me.lap,3)} / 3`:'CHECKPOINT';audio.tone(680,.09,.08);clearTimeout(checkpointTimer);checkpointTimer=setTimeout(()=>$('checkpoint-note').textContent='',1400);}}
  const leaderboard=order.map(r=>r.id+':'+r.lap).join('|');if(leaderboard!==lastLeaderboard){lastLeaderboard=leaderboard;$('leaderboard-rows').innerHTML=order.map((r,i)=>`<div class="leader-row ${r.id===localId?'me':''}"><b>${i+1}</b><span>${escapeHTML(r.name)}</span><small>${r.id===localId?'YOU':r.bot?'AI':'LIVE'}</small></div>`).join('');}
  drawMinimap();if(me.finishTime!==null)showResults();
}
let lastTime=performance.now(),hudTick=0,resultTick=0;
function updatePerformance(dt){
  debugFrames++;debugTime+=dt;if(debugTime<.5)return;debugFps=debugFrames/debugTime;debugAverage=debugAverage?debugAverage*.8+debugFps*.2:debugFps;debugFrames=0;debugTime=0;world?.updateAdaptiveQuality?.(debugFps);
  if(!debugEnabled)return;const stats=world?.getStats?.()||{};$('perf-panel').textContent=`FPS ${debugFps.toFixed(0)} (avg ${debugAverage.toFixed(0)})\nFRAME ${(1000/Math.max(debugFps,1)).toFixed(1)} ms\nDRAWS ${stats.drawCalls??'—'}  TRI ${stats.triangles??'—'}\nTEX ${stats.textures??'—'}  GEO ${stats.geometries??'—'}\nQUALITY ${stats.quality??'—'}  DPR ${Number(stats.pixelRatio||0).toFixed(2)}`;
}
function frame(now){
  rafId=0;if(document.hidden){frameRunning=false;return;}const dt=Math.min(Math.max((now-lastTime)/1000,0),.05);lastTime=now;const input=controls.input;
  if(mode==='practice'&&!paused){
    if(countdown>0)countdown=Math.max(0,countdown-dt);
    else {
      fixedAccumulator=Math.min(fixedAccumulator+dt,.25);let steps=0;
      while(fixedAccumulator>=1/60&&steps++<6){elapsed+=1/60;stepRace(racers,r=>r.bot?botInput(r,Number(r.id.slice(-1))):input,1/60,elapsed,{substeps:60,collisionIterations:16});fixedAccumulator-=1/60;}
    }
  }else if(mode==='online'){
    // Match the server's 60 Hz physics tick so a steering change is not held
    // for an extra 20–33 ms before the authoritative simulation sees it.
    inputTimer+=dt;if(inputTimer>=1/60){network.input(input);inputTimer=0;}
    const connected=network.socket.connected&&now-snapshotAt<1000;
    if(connected){if(countdown>0)countdown=Math.max(0,countdown-dt);else if(onlineState==='racing'){
      elapsed+=dt;
      const steps=Math.max(1,Math.ceil(dt*60)),subDt=dt/steps;
      for(let i=0;i<steps;i++){
        for(const r of racers)if(r.id===localId)stepRacer(r,input,subDt,elapsed,false);else if(r.finishTime===null){r.x+=r.vx*subDt;r.z+=r.vz*subDt;}
        resolveCarCollisions(racers,{iterations:16});
      }
    }}
  }
  if(mode!=='garage'&&(hudTick+=dt)>.05){hudTick=0;updateHUD();}
  if(modal==='results'&&(resultTick+=dt)>.5){resultTick=0;refreshResults();}
  world.render(dt,now/1000,racers,localId);audio.update(mode!=='garage'&&!paused,racers.find(r=>r.id===localId));updatePerformance(dt);rafId=requestAnimationFrame(frame);
}
function startFrameLoop(){if(frameRunning||document.hidden)return;frameRunning=true;lastTime=performance.now();rafId=requestAnimationFrame(frame);}
function webglAvailable(canvas){try{const antialias=!matchMedia?.('(pointer:coarse)').matches,options={failIfMajorPerformanceCaveat:false,antialias};return !!(canvas.getContext('webgl2',options)||canvas.getContext('webgl',options)||canvas.getContext('experimental-webgl',options));}catch{return false;}}
function showWebGLError(error){
  $('loading').classList.remove('hidden');$('loading').innerHTML='<div class="wordmark">TURBO<span>RUSH</span><sup>ONLINE</sup></div><h2>WebGL could not start.</h2><p>Enable hardware acceleration, then try again.</p><button class="primary" id="reload">TRY AGAIN</button>';
  $('reload').onclick=()=>{world?.dispose?.();world=null;initializing=false;init();};console.error(error);
}
function updateFullscreenUI(){
  const active=!!(document.fullscreenElement||document.webkitFullscreenElement);$('game-root').classList.toggle('fullscreen-active',active);$('game-root').classList.toggle('immersive-fallback',immersiveFallback||(!active&&!fullscreenSupported));for(const button of document.querySelectorAll('.fullscreen-control,#fullscreen')){button.innerHTML=active?'⛶ <span>EXIT FULLSCREEN</span>':'⛶ <span>ENTER FULLSCREEN</span>';button.setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');}
}
const fullscreenSupported=!!(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen);let immersiveFallback=false;
async function enterFullscreen(){
  const root=$('game-root');immersiveFallback=true;root.classList.add('immersive-fallback');
  try{if(root.requestFullscreen)await root.requestFullscreen({navigationUI:'hide'});else if(root.webkitRequestFullscreen)await root.webkitRequestFullscreen();else return toast('Fullscreen is unavailable; using immersive layout.');
    try{await screen.orientation?.lock?.('landscape');}catch{}
    immersiveFallback=false;
  }catch(error){toast('Fullscreen was blocked. Using the immersive layout instead.');console.warn(error);}
  updateFullscreenUI();
}
async function exitFullscreen(){immersiveFallback=false;try{if(document.exitFullscreen)await document.exitFullscreen();else if(document.webkitExitFullscreen)await document.webkitExitFullscreen();}catch{toast('The browser did not allow fullscreen exit.');}try{screen.orientation?.unlock?.();}catch{}updateFullscreenUI();}
function toggleFullscreen(){return (document.fullscreenElement||document.webkitFullscreenElement)?exitFullscreen():enterFullscreen();}
function bindFullscreen(){
  document.querySelectorAll('.fullscreen-control,#fullscreen').forEach(button=>button.addEventListener('click',()=>run(toggleFullscreen)));
  document.addEventListener('fullscreenchange',updateFullscreenUI);document.addEventListener('webkitfullscreenchange',updateFullscreenUI);document.addEventListener('fullscreenerror',()=>toast('Fullscreen is unavailable on this browser.'));document.addEventListener('webkitfullscreenerror',()=>toast('Fullscreen is unavailable on this browser.'));updateFullscreenUI();
}
async function init(){
  if(initializing)return;initializing=true;
  try{
    if(!webglAvailable($('world')))throw Error('WebGL is unavailable');
    setActiveTrack(selectedMapId);rebuildMinimapPath();
    world=new World($('world'),$('game-root'),{onContextLost:()=>{pageHidden=true;controls.clear();toast('Graphics paused. Restore the browser tab or retry WebGL.');},onContextRestored:()=>{pageHidden=false;lastTime=performance.now();toast('Graphics restored.');startFrameLoop();}});world.setQuality(settings.quality);world.showGarage();
    const thumbnails=world.thumbnails();
    $('car-cards').innerHTML=CARS.map(car=>`<button class="car-card" data-car="${car.id}" aria-label="Select ${car.brand} ${car.name}" aria-pressed="false"><span class="card-no">${car.number}</span><span class="card-tag">${car.category}</span><img src="${thumbnails[car.id]}" alt="${car.brand} ${car.name}-inspired 3D car"><div class="card-info"><div><h3>${car.id==='supra'?'Toyota Supra':car.id==='bmw'?'BMW M4':'Bugatti Chiron'}</h3><p>${car.id==='supra'?'THE STREET LEGEND':car.id==='bmw'?'PRECISION IN MOTION':'BEYOND THE LIMIT'}</p></div><span class="card-check">✓</span></div></button>`).join('');
    document.querySelectorAll('.car-card').forEach(el=>el.onclick=()=>updateCar(el.dataset.car));updateCar(selected);
    $('track-select').innerHTML=MAPS.map(map=>`<option value="${map.id}">${map.name} · ${map.tag}</option>`).join('');$('track-select').onchange=e=>selectMap(e.target.value);updateMapUI();saveSettings();
    $('loading').classList.add('hidden');startFrameLoop();
  }catch(error){showWebGLError(error);}finally{initializing=false;}
}
$('quick-race').onclick=quickRace;$('race-friends').onclick=showOnline;$('nav-online').onclick=showOnline;$('nav-help').onclick=showHelp;$('nav-garage').onclick=()=>{if(room)renderLobby();else if(modal)closeModal();};$('home-link').onclick=e=>{e.preventDefault();$('nav-garage').click();};$('settings-button').onclick=showSettings;$('sound-button').onclick=()=>{settings.mute=!settings.mute;audio.start().catch(()=>{});saveSettings();toast(settings.mute?'Sound muted':'Sound enabled');};
$('pause-button').onclick=pauseMenu;$('close-modal').onclick=()=>{if(modal==='results')toast('Choose Race Again, Garage, or Leave Room to continue.');else closeModal();};
document.addEventListener('keydown',e=>{
  if(!modal)return;if(e.key==='Escape'&&modal!=='lobby'&&modal!=='results'){e.preventDefault();closeModal();}
  if(e.key==='Tab'){const els=[...$('modal-backdrop').querySelectorAll('button:not(:disabled),input,select')];if(e.shiftKey&&document.activeElement===els[0]){e.preventDefault();els.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===els.at(-1)){e.preventDefault();els[0].focus();}}
});
let drag=null;$('world').addEventListener('pointerdown',e=>{if(mode!=='garage'||modal)return;drag={x:e.clientX,orbit:world.orbit};$('world').setPointerCapture(e.pointerId);});$('world').addEventListener('pointermove',e=>{if(drag)world.orbit=drag.orbit+(e.clientX-drag.x)*.006;});$('world').addEventListener('pointerup',()=>drag=null);$('world').addEventListener('pointercancel',()=>drag=null);
bindFullscreen();
document.addEventListener('visibilitychange',()=>{pageHidden=document.hidden;if(pageHidden){controls.clear();if(mode==='practice'&&!modal)paused=true;frameRunning=false;lastTime=performance.now();}else{lastTime=performance.now();startFrameLoop();}});
window.addEventListener('pagehide',()=>{pageHidden=true;controls.clear();frameRunning=false;});window.addEventListener('pageshow',()=>{pageHidden=false;lastTime=performance.now();startFrameLoop();});
init();
