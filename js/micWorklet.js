// AudioWorklet: collects microphone samples into ~100 ms chunks and posts them, with their
// level (RMS), to the page. No output: it only listens.
//
// With `normalize`, quiet audio (a child far from the phone) is raised so the loudest chunk of
// the last few seconds reaches TARGET. The gain changes slowly, so it doesn't pump with each
// word, and it only boosts: loud audio is left as is.
/* global sampleRate, registerProcessor, AudioWorkletProcessor */

const TARGET = 0.1; // -20 dBFS
const MAX_GAIN = 30; // +30 dB
const WINDOW = 30; // chunks (3 s)
const SMOOTHING = 0.3; // fraction of the way to the wanted gain per chunk

class MicCapture extends AudioWorkletProcessor {
  constructor({ processorOptions = {} }) {
    super();
    this.chunk = new Float32Array(Math.round(sampleRate / 10));
    this.filled = 0;
    this.normalize = !!processorOptions.normalize;
    this.recent = [];
    this.gain = 1;
  }

  // Scales the chunk in place.
  applyGain(samples, level) {
    this.recent.push(level);
    if (this.recent.length > WINDOW) this.recent.shift();
    const loudest = Math.max(...this.recent, 1e-6);
    const want = Math.min(MAX_GAIN, Math.max(1, TARGET / loudest));
    this.gain += (want - this.gain) * SMOOTHING;
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.max(-1, Math.min(1, samples[i] * this.gain));
    }
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    let i = 0;
    while (i < channel.length) {
      const n = Math.min(channel.length - i, this.chunk.length - this.filled);
      this.chunk.set(channel.subarray(i, i + n), this.filled);
      this.filled += n;
      i += n;
      if (this.filled === this.chunk.length) {
        const samples = this.chunk;
        const size = samples.length; // read before the transfer below empties it
        let sum = 0;
        for (const v of samples) sum += v * v;
        const level = Math.sqrt(sum / size); // before the gain, so the mic ring shows what the mic hears
        if (this.normalize) this.applyGain(samples, level);
        this.port.postMessage({ samples, level }, [samples.buffer]);
        this.chunk = new Float32Array(size);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('mic-capture', MicCapture);
