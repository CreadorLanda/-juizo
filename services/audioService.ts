
class AudioService {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  playBeep(freq: number = 440, type: OscillatorType = 'sine', duration: number = 0.1) {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playSuccess() {
    this.playBeep(523.25, 'sine', 0.1); // C5
    setTimeout(() => this.playBeep(659.25, 'sine', 0.1), 100); // E5
    setTimeout(() => this.playBeep(783.99, 'sine', 0.2), 200); // G5
  }

  playAction() {
    this.playBeep(440, 'triangle', 0.05);
  }

  playReveal() {
    this.playBeep(220, 'square', 0.3);
  }
}

export const audioService = new AudioService();
