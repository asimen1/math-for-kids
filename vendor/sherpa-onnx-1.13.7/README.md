# sherpa-onnx 1.13.7 (WebAssembly, streaming ASR)

From the `sherpa-onnx-wasm-simd-v1.13.7-en-asr-zipformer` release asset of
https://github.com/k2-fsa/sherpa-onnx (Apache-2.0). Only the runtime is kept; the bundled
English model (`.data`) is not, since the app loads ivrit.ai's Hebrew model at runtime
(see `js/modelStore.js`).

One local patch in `sherpa-onnx-wasm-main-asr.js`: the bundled-data loader returns early
when `Module.skipDataPackage` is set:

    if(isPthread||isWasmWorker||Module["skipDataPackage"])return;
