# Narrate — SRT & ElevenLabs

Lightweight PWA to add timed captions and generate ElevenLabs voiceovers for local videos. The video never leaves your browser.

## Features

- Local video upload (object URL only — no server upload)
- Add captions at the current playback time
- Generate narration audio per caption via ElevenLabs
- Download `.srt` and a ZIP of timestamped MP3 files
- Settings (API key, voice, model) stored in `localStorage`
- English / Arabic UI with RTL
- Installable as a PWA

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deploy (Vercel)

Connected to: [rsmouk/eleven-labs-srt-video](https://github.com/rsmouk/eleven-labs-srt-video)

Framework preset: Vite · Build: `npm run build` · Output: `dist`
