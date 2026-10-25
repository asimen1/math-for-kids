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

## Notes

- Speech recognition uses Google's online service, so it needs internet.
- Android plays a short beep each time listening restarts. The browser doesn't let the app turn this off.
- The microphone is turned off while the app speaks, so it doesn't hear itself.
- Leaving the app (home button or screen off) pauses the game. Say **המשך** or tap the button to resume.
