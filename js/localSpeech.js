// On-device speech recognition: the app records the microphone itself and decodes it with
// ivrit.ai's Hebrew streaming model in a worker (see asrWorker.js). Unlike Chrome's
// recognizer there's no speech gate to miss quiet voices, no beep, and no restart gaps.
// Same interface as Listener in speech.js, so the game doesn't care which one it uses.

import { loadModel } from './modelStore.js';

// The model emits words about this long after they're spoken, so a phrase's first text
// means it started at least this much earlier.
const FIRST_WORD_LAG_MS = 1300;

export class LocalListener {
  static supported = typeof AudioWorkletNode !== 'undefined' && typeof WebAssembly !== 'undefined' &&
    typeof Worker !== 'undefined' && 'caches' in window && !!navigator.mediaDevices?.getUserMedia;

  constructor({ onResult, onError = () => {}, onListening = () => {}, onLevel = () => {} }) {
    this.onResult = onResult;
    this.onError = onError;
    this.onListening = onListening;
    this.onLevel = onLevel;
    this.worker = null;
    this.ready = null; // promise: model downloaded and recognizer created
    this.ctx = null;
    this.media = null;
    this.node = null;
    this.active = false;
    this.session = 0;
    this.startedAt = 0;
    this.phraseOpen = false;
  }

  // Downloads (or reads from cache) the model and starts the recognizer. Safe to call often.
  loadModel(onProgress = () => {}) {
    this.ready ??= (async () => {
      const files = await loadModel(onProgress);
      const worker = new Worker(new URL('./asrWorker.js', import.meta.url));
      await new Promise((resolve, reject) => {
        worker.onmessage = ({ data }) => {
          if (data.type === 'ready') resolve();
          else if (data.type === 'error') reject(new Error(data.message));
        };
        worker.onerror = (e) => reject(new Error(e.message));
        worker.postMessage({ type: 'init', files }, Object.values(files));
      });
      worker.onmessage = ({ data }) => this.onWorkerMessage(data);
      this.worker = worker;
    })();
    this.ready.catch(() => { this.ready = null; }); // allow a retry
    return this.ready;
  }

  // Opens the microphone. Call from a tap: the audio context needs a user gesture.
  async open({ echoCancellation = true, noiseSuppression = true, autoGainControl = true } = {}) {
    if (this.media) return;
    this.ctx = new AudioContext();
    const media = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation, noiseSuppression, autoGainControl, channelCount: 1 },
    });
    await this.ctx.audioWorklet.addModule(new URL('./micWorklet.js', import.meta.url));
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    const source = this.ctx.createMediaStreamSource(media);
    this.node = new AudioWorkletNode(this.ctx, 'mic-capture', { numberOfOutputs: 0 });
    this.node.port.onmessage = ({ data }) => this.onAudio(data);
    source.connect(this.node);
    this.media = media;
  }

  close() {
    this.stop();
    this.media?.getTracks().forEach((t) => t.stop());
    this.media = null;
    this.node?.port.close();
    this.node = null;
    this.ctx?.close();
    this.ctx = null;
  }

  onAudio({ samples, level }) {
    this.onLevel(level);
    if (this.active && this.worker) {
      this.worker.postMessage({ type: 'audio', samples, sampleRate: this.ctx.sampleRate }, [samples.buffer]);
    }
  }

  onWorkerMessage(data) {
    if (data.type === 'error') return this.onError(data.message);
    if (!this.active) return;
    if (!this.phraseOpen) {
      this.phraseOpen = true;
      this.session++;
      this.startedAt = performance.now() - FIRST_WORD_LAG_MS;
    }
    const final = data.type === 'final';
    this.onResult({ alternatives: [data.text], final, session: this.session, startedAt: this.startedAt });
    if (final) this.phraseOpen = false;
  }

  // Report results (true) or ignore them (false). Starting again drops audio heard meanwhile.
  start() {
    if (this.active) return;
    this.active = true;
    this.phraseOpen = false;
    this.worker?.postMessage({ type: 'reset' });
    this.onListening(!!this.media);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.onListening(false);
  }
}
