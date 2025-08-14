// sound.js — petites sonorités 8‑bit (WebAudio)
export class AudioUI {
  constructor(root, toastEl){
    this.ctx = null;
    this.root = root;
    this.toast = toastEl;
    this.enabled = false;
    this._bind();
  }
  _bind(){
    const enable = () => {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
      }
      this.ctx.resume();
      this.enabled = true;
      this.toast.classList.add('hidden');
      window.removeEventListener('pointerdown', enable);
      window.removeEventListener('keydown', enable);
    };
    window.addEventListener('pointerdown', enable, { once:true });
    window.addEventListener('keydown', enable, { once:true });
    // show toast
    this.toast.classList.remove('hidden');
    setTimeout(()=> this.toast.classList.add('hidden'), 4000);
  }
  note(kind){
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (kind==='spawn') this._beep(t, 880, 0.06).then(()=>this._beep(this.ctx.currentTime, 1320, 0.05));
    else if (kind==='near') this._beep(t, 720, 0.02);
    else if (kind==='focus') this._beep(t, 600, 0.03);
    else if (kind==='start') this._arpeggio(t);
    else if (kind==='stop') this._beep(t, 320, 0.05);
  }
  async _beep(t, freq, dur){
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t+0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t+dur);
    return new Promise(res=> setTimeout(res, dur*1000));
  }
  _arpeggio(t){
    const base=480;
    this._beep(t, base, 0.06);
    this._beep(t+0.06, base*5/4, 0.05);
    this._beep(t+0.12, base*3/2, 0.05);
  }
}
