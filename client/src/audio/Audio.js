export class GameAudio {
  constructor(settings){this.settings=settings;this.ctx=null;this.note=0;this.nextNote=0;}
  async start(){
    if(!this.ctx){
      this.ctx=new(window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.connect(this.ctx.destination);
      this.engine=this.ctx.createOscillator();this.engine.type='sawtooth';this.filter=this.ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=300;this.engineGain=this.ctx.createGain();this.engineGain.gain.value=0;this.engine.connect(this.filter);this.filter.connect(this.engineGain);this.engineGain.connect(this.master);this.engine.start();
      const buffer=this.ctx.createBuffer(1,this.ctx.sampleRate,this.ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.3;
      this.noise=this.ctx.createBufferSource();this.noise.buffer=buffer;this.noise.loop=true;this.nitroGain=this.ctx.createGain();this.nitroGain.gain.value=0;this.noise.connect(this.nitroGain);this.nitroGain.connect(this.master);this.noise.start();
    }
    await this.ctx.resume();
  }
  tone(frequency=440,duration=.12,volume=.1){if(!this.ctx)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain(),t=this.ctx.currentTime;o.type='sine';o.frequency.value=frequency;g.gain.setValueAtTime(volume*this.settings.sfx,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.02);o.onended=()=>{o.disconnect();g.disconnect();};}
  update(racing,player){
    if(!this.ctx)return;const t=this.ctx.currentTime,s=this.settings;
    this.master.gain.setTargetAtTime(s.mute?0:s.master,t,.05);
    const speed=Math.abs(player?.speed||0),engineLevel=racing?.035*s.sfx:0;
    this.engineGain.gain.setTargetAtTime(engineLevel,t,.07);this.engine.frequency.setTargetAtTime(35+(speed%24)*4+Math.floor(speed/24)*5,t,.04);this.filter.frequency.setTargetAtTime(170+speed*9,t,.05);this.nitroGain.gain.setTargetAtTime(racing&&player?.boosting?.14*s.sfx:0,t,.05);
    if(s.music>0&&t>this.nextNote){const notes=[110,164.81,220,164.81,130.81,196,261.63,196];const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type='triangle';o.frequency.value=notes[this.note++%notes.length];g.gain.setValueAtTime(s.music*.022,t);g.gain.exponentialRampToValueAtTime(.001,t+.25);o.connect(g);g.connect(this.master);o.start();o.stop(t+.3);o.onended=()=>{o.disconnect();g.disconnect();};this.nextNote=t+.27;}
  }
}
