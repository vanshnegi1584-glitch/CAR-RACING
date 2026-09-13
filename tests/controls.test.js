import test from 'node:test';
import assert from 'node:assert/strict';
import { Controls } from '../client/src/controls/Controls.js';
test('keyboard and multitouch can accelerate, steer, and boost together; blur releases everything',()=>{
  const previousWindow=globalThis.window,previousDocument=globalThis.document;
  const windowStub=new EventTarget(),documentStub=new EventTarget();
  const buttons=['throttle','left','nitro','brake'].map(control=>{const b=new EventTarget();b.dataset={control};b.setPointerCapture=()=>{};b.classList={add(){},remove(){}};return b;});
  documentStub.querySelectorAll=selector=>selector==='[data-control]'?buttons:[];documentStub.hidden=false;
  globalThis.window=windowStub;globalThis.document=documentStub;
  try {
    const actions=[],controls=new Controls(action=>actions.push(action));controls.enabled=true;
    const key=(type,code)=>{const e=new Event(type,{cancelable:true});Object.defineProperties(e,{code:{value:code},target:{value:{closest:()=>null}},repeat:{value:false}});windowStub.dispatchEvent(e);};
    key('keydown','KeyW');key('keydown','KeyA');key('keydown','Space');assert.equal(controls.input.throttle,true);assert.equal(controls.input.left,true);assert.equal(controls.input.nitro,true);
    key('keyup','KeyA');assert.equal(controls.input.left,false);key('keydown','KeyR');key('keydown','KeyC');assert.deepEqual(actions,['reset','camera']);controls.clear();
    const pointer=(b,type,id)=>{const e=new Event(type,{cancelable:true});Object.defineProperty(e,'pointerId',{value:id});b.dispatchEvent(e);};
    pointer(buttons[0],'pointerdown',1);pointer(buttons[1],'pointerdown',2);pointer(buttons[2],'pointerdown',3);
    assert.equal(controls.input.throttle,true);assert.equal(controls.input.left,true);assert.equal(controls.input.nitro,true);
    pointer(buttons[1],'pointercancel',2);assert.equal(controls.input.left,false);assert.equal(controls.input.throttle,true);
    windowStub.dispatchEvent(new Event('blur'));assert.ok(Object.values(controls.input).every(v=>!v));
    controls.enabled=false;pointer(buttons[0],'pointerdown',4);assert.equal(controls.input.throttle,false);
  }finally{globalThis.window=previousWindow;globalThis.document=previousDocument;}
});
