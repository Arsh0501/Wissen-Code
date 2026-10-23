class TranscriptProcessor extends AudioWorkletProcessor {
  constructor() {
    super(); this.samples = []; this.sum = 0; this.count = 0; this.phase = 0;
    this.port.onmessage = ({ data }) => {
      if (data === 'flush') { this.flush(); this.port.postMessage({ flushed: true }); }
    };
  }
  flush() {
    if (!this.samples.length) return;
    const buffer = new ArrayBuffer(this.samples.length * 2);
    const view = new DataView(buffer);
    this.samples.forEach((v, i) => view.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, v)) * 32767), true));
    this.port.postMessage({ audio: buffer, duration: this.samples.length / 16000 }, [buffer]);
    this.samples = [];
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] / channels.length;
      this.sum += value; this.count++; this.phase += 16000;
      if (this.phase >= sampleRate) {
        this.samples.push(this.sum / this.count);
        this.sum = 0; this.count = 0; this.phase -= sampleRate;
      }
      if (this.samples.length >= 48000) this.flush();
    }
    return true;
  }
}
registerProcessor('transcript-processor', TranscriptProcessor);
