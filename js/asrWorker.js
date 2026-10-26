// Web Worker running on-device Hebrew speech recognition (sherpa-onnx WASM + ivrit.ai's
// streaming Zipformer2), so decoding never blocks the page.
//
// Messages in:  { type: 'init', files: { 'encoder.onnx': ArrayBuffer, ... }, phraseEndSec }
//               { type: 'audio', samples: Float32Array, sampleRate }
//               { type: 'reset' } – drop everything heard so far
// Messages out: { type: 'ready' } | { type: 'error', message }
//               { type: 'partial', text } – the current phrase so far, whenever it changes
//               { type: 'final', text }   – the phrase ended (no new words for phraseEndSec)
//
// Phrases are cut here rather than with sherpa's endpointing: recognizer.reset() stops this
// model from decoding later speech, and a fresh stream loses audio it hadn't decoded yet.
// So one stream keeps running; the new text since the last phrase is the current phrase.
// The stream is only replaced after a long silence, and gets the last bit of audio replayed.
/* global importScripts, createOnlineRecognizer */

const VENDOR = new URL('../vendor/sherpa-onnx-1.13.7/', self.location).href;
const RECYCLE_AFTER_SEC = 3; // replace the stream after this much time without new words
const REPLAY_SEC = 1.5; // audio replayed into a new stream (covers the undecoded tail)

let recognizer = null;
let stream = null;
// Words arrive in bursts, one per 1.28 s model chunk, so a phrase only ends after a longer gap.
let phraseEndSec = 1.6;

let fullText = ''; // everything the current stream decoded
let committed = 0; // length of fullText already sent as finals
let fed = 0; // seconds of audio fed to the current stream
let lastChange = 0; // `fed` when fullText last changed
let lastPartial = '';
const recent = []; // [{ samples, sampleRate }] – roughly the last REPLAY_SEC of audio

function init(data) {
  phraseEndSec = data.phraseEndSec ?? phraseEndSec;
  const { files } = data;
  self.Module = {
    skipDataPackage: true, // the vendored build would otherwise download its bundled model
    locateFile: (path) => VENDOR + path,
    preRun: [() => {
      for (const [name, buffer] of Object.entries(files)) {
        self.Module.FS_createDataFile('/', name, new Uint8Array(buffer), true, false, false);
      }
    }],
    onRuntimeInitialized: () => {
      try {
        recognizer = createOnlineRecognizer(self.Module, recognizerConfig());
        newStream();
        self.postMessage({ type: 'ready' });
      } catch (e) {
        self.postMessage({ type: 'error', message: String(e) });
      }
    },
    onAbort: (what) => self.postMessage({ type: 'error', message: `abort: ${what}` }),
    print: () => {},
    printErr: () => {},
  };
  importScripts(`${VENDOR}sherpa-onnx-asr.js`, `${VENDOR}sherpa-onnx-wasm-main-asr.js`);
}

function recognizerConfig() {
  return {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: { encoder: './encoder.onnx', decoder: './decoder.onnx', joiner: './joiner.onnx' },
      paraformer: { encoder: '', decoder: '' },
      zipformer2Ctc: { model: '' },
      nemoCtc: { model: '' },
      toneCtc: { model: '' },
      tokens: './tokens.txt',
      numThreads: 1,
      provider: 'cpu',
      debug: 0,
      modelType: '',
      modelingUnit: 'cjkchar', // only used for hotwords, which this app doesn't use
      bpeVocab: '',
    },
    decodingMethod: 'greedy_search',
    maxActivePaths: 4,
    enableEndpoint: 0,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 1.2,
    rule3MinUtteranceLength: 20,
    hotwordsFile: '',
    hotwordsScore: 1.5,
    ctcFstDecoderConfig: { graph: '', maxActive: 3000 },
    ruleFsts: '',
    ruleFars: '',
  };
}

function newStream({ replay = false } = {}) {
  stream?.free();
  stream = recognizer.createStream();
  fullText = '';
  committed = 0;
  fed = 0;
  lastChange = 0;
  lastPartial = '';
  if (replay) {
    for (const { samples, sampleRate } of recent) feed(samples, sampleRate);
  } else {
    recent.length = 0;
  }
}

function feed(samples, sampleRate) {
  stream.acceptWaveform(sampleRate, samples);
  fed += samples.length / sampleRate;
  while (recognizer.isReady(stream)) recognizer.decode(stream);
  const text = recognizer.getResult(stream).text;
  if (text !== fullText) {
    fullText = text;
    lastChange = fed;
  }
}

function remember(samples, sampleRate) {
  recent.push({ samples, sampleRate });
  let sec = recent.reduce((s, r) => s + r.samples.length / r.sampleRate, 0);
  while (recent.length > 1 && sec - recent[0].samples.length / recent[0].sampleRate >= REPLAY_SEC) {
    sec -= recent[0].samples.length / recent[0].sampleRate;
    recent.shift();
  }
}

function accept(samples, sampleRate) {
  if (!recognizer) return;
  feed(samples, sampleRate);
  remember(samples, sampleRate);

  // The model also emits punctuation; a phrase needs at least one letter or digit.
  const phrase = fullText.slice(committed).replace(/^[\s.,!?;:\-–]+/, '').trim();
  const hasWords = /[\p{L}\p{N}]/u.test(phrase);
  if (hasWords && phrase !== lastPartial) {
    lastPartial = phrase;
    self.postMessage({ type: 'partial', text: phrase });
  }
  const quietFor = fed - lastChange;
  if (phrase && quietFor >= phraseEndSec) {
    if (hasWords) self.postMessage({ type: 'final', text: phrase });
    committed = fullText.length;
    lastPartial = '';
  }
  if (quietFor >= RECYCLE_AFTER_SEC && fed > RECYCLE_AFTER_SEC + REPLAY_SEC) newStream({ replay: true });
}

self.onmessage = ({ data }) => {
  try {
    if (data.type === 'init') init(data);
    else if (data.type === 'audio') accept(data.samples, data.sampleRate);
    else if (data.type === 'reset' && recognizer) newStream();
  } catch (e) {
    self.postMessage({ type: 'error', message: `${e}\n${e.stack ?? ''}` });
  }
};
