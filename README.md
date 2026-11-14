# Duolingo for Money

Learn money skills with questions about **your own** bank account.
Built for S-Bank (S-Pankki) at Junction 2026.

**Live demo:** https://rahatreeni-spankki.vercel.app

## What it does

1. **You tell us your level.** Name, age, what you want to learn, and how good you think you are at each topic.
2. **You can add a project** (optional). Example: "Trip to Japan this summer, €6,000". The app tells you whether it's realistic, shows a simulator, and suggests what to change.
3. **You get a personal path.** S-Bank AI builds a path of short lessons that fits your level.
4. **You answer questions about your real numbers.** For example: "How much did you spend on restaurants last month?" or "How long until you reach your goal?"
5. **The app adapts.** Questions get harder as you improve and skip what you already know. Progress is saved.

## How it works

- **Numbers come from code, not AI.** Every answer is calculated from the transaction data, so the AI can't make up figures.
- **The AI only explains.** It builds the path, writes short explanations and plans. It uses Gemini, with Verda (DeepSeek) as an option.
- **The data** is the anonymised S-Pankki dataset from [hackjunction/Junction-2026-S-pankki](https://github.com/hackjunction/Junction-2026-S-pankki). When you "connect your account", the app picks a matching customer from it.

## Run it

```bash
cd web
cp .env.example .env.local   # add your GEMINI_API_KEY
npm install
npm run dev                  # http://localhost:3000
```

## Deploy

```bash
cd web
vercel deploy --prod
```

Add `GEMINI_API_KEY` in the Vercel project settings. Connect a Vercel Blob store if you want progress saved.

## Rebuild the data (optional)

The ready-to-use data is already in `web/src/data/`. To rebuild it:

1. Clone the dataset into `data-repo/`.
2. Download `tx_junction_transactions.csv` (Git LFS) and save it as `tx_full.csv` at the repo root.
3. Run `python3 scripts/build_profiles.py` (needs pandas and numpy).

## Code map

| Folder | What's inside |
|---|---|
| `web/src/components` | Screens: onboarding, path, lessons, goal simulator |
| `web/src/lib/questions.ts` | Question generators and adaptive levels |
| `web/src/lib/simulate.ts` | Goal maths: is it realistic, how to get there |
| `web/src/lib/project.ts` | Lessons about your own project |
| `web/src/app/api` | Server routes: AI path, coach, goal parsing, saving progress |
| `scripts/` | Turns the raw dataset into small JSON files |

## Tech

Next.js 16, React 19, Tailwind 4, Vercel Blob, Gemini, Verda.
