// AudioWorklet: collects microphone samples into ~100 ms chunks and posts them, with their
// level (RMS), to the page. No output: it only listens.
/* global sampleRate, registerProcessor, AudioWorkletProcessor */

class MicCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = new Float32Array(Math.round(sampleRate / 10));
    this.filled = 0;
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
        this.port.postMessage({ samples, level: Math.sqrt(sum / size) }, [samples.buffer]);
        this.chunk = new Float32Array(size);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('mic-capture', MicCapture);
