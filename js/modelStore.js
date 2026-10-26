// Downloads ivrit.ai's Hebrew streaming speech model once and keeps it in Cache Storage.
// Model: ivrit-ai/zipformer2-66m-streaming-he (CC-BY-4.0), pinned to a fixed revision.

const REVISION = 'ee769a2a13b887f91572eec349458bfb0fe79e7a';
const BASE = `https://huggingface.co/ivrit-ai/zipformer2-66m-streaming-he/resolve/${REVISION}/sherpa-onnx/`;
const CACHE = 'shower-math-model-zipformer2-he-v1';

// name in the recognizer's file system → file in the model repo, with its size for progress.
const FILES = [
  { name: 'encoder.onnx', path: 'encoder.int8.onnx', size: 70478964 },
  { name: 'decoder.onnx', path: 'decoder.int8.onnx', size: 1049105 },
  { name: 'joiner.onnx', path: 'joiner.int8.onnx', size: 771805 },
  { name: 'tokens.txt', path: 'tokens.txt', size: 17086 },
];
const TOTAL = FILES.reduce((sum, f) => sum + f.size, 0);

export const MODEL_SIZE_MB = Math.round(TOTAL / 1e6);

async function readWithProgress(response, onBytes) {
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onBytes(value.length);
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out.buffer;
}

export async function isModelCached() {
  try {
    const cache = await caches.open(CACHE);
    const hits = await Promise.all(FILES.map((f) => cache.match(BASE + f.path)));
    return hits.every(Boolean);
  } catch {
    return false;
  }
}

// Resolves with { [name]: ArrayBuffer }. onProgress(fraction 0..1) during download.
export async function loadModel(onProgress = () => {}) {
  const cache = await caches.open(CACHE);
  let done = 0;
  const report = (bytes) => {
    done += bytes;
    onProgress(Math.min(1, done / TOTAL));
  };
  const files = {};
  for (const f of FILES) {
    const url = BASE + f.path;
    const cached = await cache.match(url);
    if (cached) {
      files[f.name] = await cached.arrayBuffer();
      report(f.size);
      continue;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`model download failed (${res.status}) for ${f.path}`);
    const buffer = await readWithProgress(res, report);
    await cache.put(url, new Response(buffer.slice(0)));
    files[f.name] = buffer;
  }
  onProgress(1);
  return files;
}
