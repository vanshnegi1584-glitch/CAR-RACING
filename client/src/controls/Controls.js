import { EMPTY_INPUT } from '../../../shared/physics.js';
const keyMap={KeyW:'throttle',ArrowUp:'throttle',KeyS:'brake',ArrowDown:'brake',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',Space:'nitro',ShiftLeft:'drift',ShiftRight:'drift'};
export class Controls {
  constructor(onAction){
    this.keys=new Set();this.pointers=new Map();this.enabled=false;
    window.addEventListener('keydown',e=>{
      if(!this.enabled||e.target.closest('input,select,textarea'))return;
      if(keyMap[e.code]){e.preventDefault();this.keys.add(e.code);}
      if(!e.repeat){if(e.code==='KeyR')onAction('reset');if(e.code==='Escape')onAction('pause');if(e.code==='KeyC')onAction('camera');}
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.code));
    window.addEventListener('blur',()=>this.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clear();});
    document.querySelectorAll('[data-control]').forEach(button=>{
      button.addEventListener('pointerdown',e=>{if(!this.enabled)return;e.preventDefault();button.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,button.dataset.control);button.classList.add('held');});
      const release=e=>{this.pointers.delete(e.pointerId);button.classList.remove('held');};
      button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
      button.addEventListener('contextmenu',e=>e.preventDefault());
    });
  }
  get input(){const input={...EMPTY_INPUT};if(!this.enabled)return input;for(const key of this.keys)if(keyMap[key])input[keyMap[key]]=true;for(const control of this.pointers.values())input[control]=true;return input;}
  clear(){this.keys.clear();this.pointers.clear();document.querySelectorAll('.held').forEach(el=>el.classList.remove('held'));}
}
