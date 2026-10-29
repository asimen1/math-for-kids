# חשבון במקלחת (Shower Math)

A Hebrew math-practice web app (PWA) for Android. It reads random problems aloud and accepts answers by voice or by typing. It also plays sound feedback, has an optional countdown, and keeps the screen awake.

## Run locally

```sh
npm start          # serves on http://localhost:8080
npm test           # unit tests (generator + Hebrew number parsing)
npm run icons      # regenerate icons/ (only if you change the design)
```

Voice input and the screen wake lock need HTTPS, or `localhost`, to work.

## Deploy (GitHub Pages)

1. Push this repo to GitHub.
2. Go to **Settings → Pages → Deploy from branch → `main` / root**.
3. The app will be served at `https://<user>.github.io/<repo>/`.

There's no build step: the repo root is the site.

## Install on the phone

1. Open the Pages URL in **Chrome** on Android.
2. Open the ⋮ menu and tap **Install app** (or **Add to Home screen**).
3. Open the app and tap **התחל**. Allow the microphone once.

**Hebrew voice:** if the app warns there is no Hebrew voice, install one:

1. Open Android **Settings → System → Languages & input → Text-to-speech output**.
2. Tap **Google** ⚙ → **Install voice data**.
3. Choose **עברית**.

**Bluetooth:** connect the speaker before starting. All speech and sounds play through it.

## Voice commands

| Say | Action |
|---|---|
| a number (e.g. "עשרים ושלוש" or "23"), alone or inside a sentence | answer |
| חזור / עוד פעם | repeat the question |
| דלג | skip (reveals the answer) |
| עצור | pause |
| המשך | resume |

## Speech recognition

Two engines, chosen in the settings:

- **On-device (default):** the app records the microphone itself and decodes it in a Web Worker with [ivrit.ai's Hebrew streaming Zipformer2 model](https://huggingface.co/ivrit-ai/zipformer2-66m-streaming-he) (CC BY 4.0), running on [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) WebAssembly (`vendor/`).
  - It has no speech gate, so it hears quiet voices too. There's no beep and no restart gap.
  - The model (~73 MB) downloads once from Hugging Face and is kept in the browser's Cache Storage. After that it works offline.
  - **העדפת מספרים** (number bias, on by default): decodes with beam search and boosts Hebrew number words, so unclear speech comes out as a number ("שבע") rather than a similar word ("שמע"). In offline tests with noisy, child-pitched speech it found 3–6 more answers out of 30 at moderate noise, with a few more wrong guesses in heavy noise.
  - Code: `js/localSpeech.js` (mic + worker), `js/asrWorker.js` (recognizer, phrase splitting), `js/micWorklet.js` (audio capture), `js/modelStore.js` (download/cache).
- **Google:** Chrome's built-in Web Speech recognition. It needs internet.

## Notes

- With the Google engine, Android plays a short beep each time listening restarts, and the browser doesn't let the app turn it off. The on-device engine has no beep.
- The microphone is turned off while the app speaks, so it doesn't hear itself.
- Leaving the app (home button or screen off) pauses the game. Say **המשך** or tap the button to resume.
