// Web Worker running on-device Hebrew speech recognition (sherpa-onnx WASM + ivrit.ai's
// streaming Zipformer2), so decoding never blocks the page.
//
// Messages in:  { type: 'init', files: { 'encoder.onnx': ArrayBuffer, ... }, phraseEndSec, numberBias,
//                 commandPhrases }
//               { type: 'configure', numberBias } – favor number words and commands or not
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

// Number bias: beam search with these words boosted, so unclear speech comes out as "שבע"
// rather than "שמע" or "שבת". The ו forms are listed too since they tokenize differently.
// In tests with noisy, child-pitched speech it found 3–6 more answers in 30 at moderate noise.
// Voice commands get a smaller boost: in the same tests they were heard about twice as often,
// with no change to numbers.
const NUMBER_WORDS = [
  'אחת', 'אחד', 'שתיים', 'שניים', 'שלוש', 'שלושה', 'ארבע', 'ארבעה', 'חמש', 'חמישה', 'שש', 'שישה',
  'שבע', 'שבעה', 'שמונה', 'תשע', 'תשעה', 'עשר', 'עשרה', 'עשרים', 'שלושים', 'ארבעים', 'חמישים',
  'שישים', 'שבעים', 'שמונים', 'תשעים', 'מאה', 'מאתיים', 'מאות', 'אלף', 'אלפים',
];
const NUMBER_HOTWORDS = ['אפס', ...NUMBER_WORDS, ...NUMBER_WORDS.map((w) => `ו${w}`)];
const HOTWORDS_SCORE = 2;
const COMMAND_SCORE = 1.5;

let recognizer = null;
let stream = null;
let numberBias = true;
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
  numberBias = data.numberBias ?? numberBias;
  const { files, commandPhrases = [] } = data;
  // One phrase per line; ":score" overrides HOTWORDS_SCORE for that line.
  const hotwords = [...NUMBER_HOTWORDS, ...commandPhrases.map((p) => `${p} :${COMMAND_SCORE}`)];
  self.Module = {
    skipDataPackage: true, // the vendored build would otherwise download its bundled model
    locateFile: (path) => VENDOR + path,
    preRun: [() => {
      for (const [name, buffer] of Object.entries(files)) {
        self.Module.FS_createDataFile('/', name, new Uint8Array(buffer), true, false, false);
      }
      const text = (str) => new TextEncoder().encode(str);
      self.Module.FS_createDataFile('/', 'bpe.vocab', text(bpeVocab(files['bpe.model'])), true, false, false);
      self.Module.FS_createDataFile('/', 'hotwords.txt', text(`${hotwords.join('\n')}\n`), true, false, false);
    }],
    onRuntimeInitialized: () => {
      try {
        createRecognizer();
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

// sherpa-onnx reads the tokenizer as "piece<TAB>score" lines; the model repo ships it as a
// SentencePiece protobuf: ModelProto.pieces (field 1) = { piece (1): string, score (2): float }.
function bpeVocab(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  let pos = 0;
  const varint = () => {
    let v = 0;
    for (let shift = 0; ; shift += 7) {
      const b = bytes[pos++];
      v += (b & 0x7f) * 2 ** shift;
      if (b < 0x80) return v;
    }
  };
  // Calls onField(field, wireType, end) for each field up to `end`; unhandled fields are skipped.
  const fields = (end, onField) => {
    while (pos < end) {
      const key = varint();
      const field = Math.floor(key / 8);
      const wire = key % 8;
      if (wire === 0) {
        varint();
        continue;
      }
      const len = wire === 2 ? varint() : { 1: 8, 5: 4 }[wire];
      const next = pos + len;
      onField(field, wire, next);
      pos = next;
    }
  };
  const lines = [];
  fields(bytes.length, (field, wire, end) => {
    if (field !== 1 || wire !== 2) return;
    let piece = '';
    let score = 0;
    fields(end, (f, w, e) => {
      if (f === 1 && w === 2) piece = decoder.decode(bytes.subarray(pos, e));
      else if (f === 2 && w === 5) score = view.getFloat32(pos, true);
    });
    lines.push(`${piece}\t${score}`);
  });
  return `${lines.join('\n')}\n`;
}

function createRecognizer() {
  stream?.free();
  stream = null;
  recognizer?.free();
  recognizer = createOnlineRecognizer(self.Module, recognizerConfig());
  newStream();
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
      modelingUnit: 'bpe', // how hotwords are split into tokens
      bpeVocab: './bpe.vocab',
    },
    decodingMethod: numberBias ? 'modified_beam_search' : 'greedy_search',
    maxActivePaths: 4,
    enableEndpoint: 0,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 1.2,
    rule3MinUtteranceLength: 20,
    hotwordsFile: numberBias ? './hotwords.txt' : '',
    hotwordsScore: HOTWORDS_SCORE,
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
    else if (data.type === 'configure' && recognizer && data.numberBias !== numberBias) {
      numberBias = data.numberBias;
      createRecognizer();
    }
  } catch (e) {
    self.postMessage({ type: 'error', message: `${e}\n${e.stack ?? ''}` });
  }
};
