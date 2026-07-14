# MiniRacer

A lightweight 3D racing game built with React, Three.js, and TypeScript. Designed for smooth 60fps gameplay on both desktop and mobile, with optional Celo wallet integration for MiniPay.

## Gameplay

Race down an endless highway, dodging obstacles and collecting bonuses to rack up points.

- **3-lane system** — switch lanes to avoid traffic cones, barriers, and stalled cars
- **Bonus boxes** (green) — collect for +30 points
- **Golden keys** — temporary invisibility power-up
- **Coin streaks** — ride through coin lanes for +10 each
- **Speed boost pads** — hit cyan pads for a temporary speed surge
- **Construction zones** — narrowed road sections to test precision
- **Overpasses** — scenic concrete bridges overhead
- Speed increases gradually as you survive longer

## Controls

| Input | Action |
|-------|--------|
| Arrow Left/Right or A/D | Switch lanes |
| Arrow Up/Down or W/S | Speed up / slow down |
| Mouse movement | Steer between lanes |
| Mobile tap (left/right) | Switch lanes |

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Build for Production

```bash
npm run build
npm run preview
```

Output goes to `dist/`. Deploy the contents of `dist/` to any static hosting (Vercel, Netlify, Cloudflare Pages, etc.).

## MiniPay Deployment

MiniRacer is compatible with Celo MiniPay as a MiniApp:

1. Build the project: `npm run build`
2. Deploy `dist/` to an HTTPS host
3. The app auto-detects MiniPay and connects the wallet automatically
4. Submit your hosted URL at [developer.minipay.to](https://developer.minipay.to/mini-app-listing)

Requirements:
- HTTPS hosting (required by MiniPay)
- Mobile-responsive (minimum 360x640 viewport)
- Celo network support (built-in)

## Tech Stack

- **React 19** + TypeScript
- **Three.js** — 3D rendering (< 60 meshes, 3 lights, shared materials)
- **Vite** — fast dev server and bundler
- **Wagmi v2** + **Viem** — optional wallet connection (Celo chain)
- **@tanstack/react-query** — async state for wallet

## Architecture

```
src/
├── main.tsx                    # Entry point
├── App.tsx                     # Username input → game flow
├── config/
│   └── web3Config.ts           # Wagmi config, MiniPay detection
├── providers/
│   └── Web3Provider.tsx        # Wagmi + React Query providers
└── components/
    ├── EnhancedCarRaceGame.tsx  # Core game (Three.js scene, controls, HUD)
    ├── ConnectButton.tsx        # Wallet connect/disconnect
    └── ErrorBoundary.tsx        # Error fallback UI
```

## Performance

| Metric | Value |
|--------|-------|
| Scene lights | 3 (directional + hemisphere + ambient) |
| Total meshes | < 60 |
| Shared materials | < 15 |
| Shadow map | 1024x1024 (BasicShadowMap) |
| Particle systems | 0 |
| Pixel ratio cap | 1.5x |
| Target FPS | 60 (desktop), 30+ (mobile) |

## License

MIT
