import { EMPTY_INPUT } from '../../../shared/physics.js';

const keyMap={KeyW:'throttle',ArrowUp:'throttle',KeyS:'brake',ArrowDown:'brake',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',Space:'nitro',ShiftLeft:'drift',ShiftRight:'drift'};
const CONTROL_NAMES=['left','right','drift','brake','throttle','nitro'];
const DEFAULT_LAYOUT={left:{x:12,y:78,scale:1},right:{x:25,y:78,scale:1},drift:{x:53,y:87,scale:.82},brake:{x:67,y:79,scale:.9},throttle:{x:82,y:73,scale:1.12},nitro:{x:94,y:56,scale:1.1}};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function readLayout(){
  try{
    const saved=JSON.parse(localStorage.getItem('turborush-controls')||'null');
    if(!saved||typeof saved!=='object')return Object.fromEntries(CONTROL_NAMES.map(name=>[name,{...DEFAULT_LAYOUT[name]}]));
    return Object.fromEntries(CONTROL_NAMES.map(name=>{const item=saved[name]||DEFAULT_LAYOUT[name];return [name,{x:clamp(Number(item.x)||DEFAULT_LAYOUT[name].x,5,95),y:clamp(Number(item.y)||DEFAULT_LAYOUT[name].y,8,92),scale:clamp(Number(item.scale)||DEFAULT_LAYOUT[name].scale,.65,1.45)}];}));
  }catch{return Object.fromEntries(CONTROL_NAMES.map(name=>[name,{...DEFAULT_LAYOUT[name]}]));}
}
function cloneLayout(layout){return Object.fromEntries(CONTROL_NAMES.map(name=>[name,{...layout[name]}]));}

export class Controls {
  constructor(onAction){
    this.onAction=onAction;this.keys=new Set();this.pointers=new Map();this.enabled=false;this.layout=readLayout();this.editorCleanup=null;
    window.addEventListener('keydown',e=>{
      if(!this.enabled||e.target.closest?.('input,select,textarea'))return;
      if(keyMap[e.code]){e.preventDefault();this.keys.add(e.code);}
      if(!e.repeat){if(e.code==='KeyR')onAction('reset');if(e.code==='Escape')onAction('pause');if(e.code==='KeyC')onAction('camera');}
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.code));window.addEventListener('blur',()=>this.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clear();});
    this.buttons=[...document.querySelectorAll('[data-control]')];
    for(const button of this.buttons){
      button.addEventListener('pointerdown',e=>{if(!this.enabled)return;e.preventDefault();button.setPointerCapture?.(e.pointerId);this.pointers.set(e.pointerId,button.dataset.control);button.classList.add('held');});
      const release=e=>{this.pointers.delete(e.pointerId);button.classList.remove('held');};button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);button.addEventListener('contextmenu',e=>e.preventDefault());
    }
    this.applyLayout();
  }
  get input(){const input={...EMPTY_INPUT};if(!this.enabled)return input;for(const key of this.keys)if(keyMap[key])input[keyMap[key]]=true;for(const control of this.pointers.values())input[control]=true;return input;}
  clear(){this.keys.clear();this.pointers.clear();for(const el of this.buttons)el.classList.remove('held');}
  saveLayout(){try{localStorage.setItem('turborush-controls',JSON.stringify(this.layout));}catch{}}
  applyLayout(){const root=document.getElementById?.('mobile-controls');if(!root)return;root.classList.add('custom-layout');for(const button of this.buttons){const item=this.layout[button.dataset.control];if(!item)continue;button.style?.setProperty?.('--control-x',`${item.x}%`);button.style?.setProperty?.('--control-y',`${item.y}%`);button.style?.setProperty?.('--control-scale',item.scale);}}
  setLayoutValue(control,patch,{persist=true}={}){if(!this.layout[control])return;Object.assign(this.layout[control],patch);this.applyLayout();if(persist)this.saveLayout();}
  resetLayout(){this.layout=cloneLayout(DEFAULT_LAYOUT);this.applyLayout();this.saveLayout();}
  mountEditor(container,sizeInput,selectedLabel,onChange=()=>{}){
    this.editorCleanup?.();let selected='throttle';let drag=null;
    container.innerHTML=CONTROL_NAMES.map(name=>`<button type="button" class="control-editor-pad" data-layout-control="${name}">${name==='throttle'?'GAS':name==='nitro'?'ϟ':name.toUpperCase()}</button>`).join('');const pads=[...container.querySelectorAll('[data-layout-control]')];
    const render=()=>{for(const pad of pads){const item=this.layout[pad.dataset.layoutControl];pad.style.left=`${item.x}%`;pad.style.top=`${item.y}%`;pad.style.setProperty('--editor-scale',item.scale);pad.classList.toggle('selected',pad.dataset.layoutControl===selected);}if(sizeInput)sizeInput.value=String(Math.round(this.layout[selected].scale*100));if(selectedLabel)selectedLabel.textContent=`Selected: ${selected.toUpperCase()}`;};
    const select=e=>{e.preventDefault();const pad=e.currentTarget;selected=pad.dataset.layoutControl;drag={id:e.pointerId};pad.setPointerCapture?.(e.pointerId);render();};
    const move=e=>{if(!drag||drag.id!==e.pointerId)return;const rect=container.getBoundingClientRect();this.layout[selected].x=clamp((e.clientX-rect.left)/Math.max(rect.width,1)*100,5,95);this.layout[selected].y=clamp((e.clientY-rect.top)/Math.max(rect.height,1)*100,8,92);render();onChange(this.layout);};
    const release=e=>{if(drag?.id===e.pointerId){drag=null;this.saveLayout();this.applyLayout();}};
    pads.forEach(pad=>{pad.addEventListener('pointerdown',select);pad.addEventListener('pointermove',move);pad.addEventListener('pointerup',release);pad.addEventListener('pointercancel',release);pad.addEventListener('lostpointercapture',release);});
    const sizeChange=()=>{this.layout[selected].scale=clamp(Number(sizeInput.value)/100,.65,1.45);render();onChange(this.layout);this.saveLayout();this.applyLayout();};sizeInput?.addEventListener('input',sizeChange);render();
    this.editorCleanup=()=>sizeInput?.removeEventListener('input',sizeChange);return {render};
  }
}
