# Pitch deck + Project Lighthouse build scripts

This folder holds the build scripts for two slide decks. Both decks are
local-only artifacts — the generated `.pptx`, `.mp4`, screenshots and any
business-content drafts are gitignored. Only the **scripts** that generate
them are tracked.

## What lives where

| Script | Generates | Output folder |
|---|---|---|
| `build-pitch-deck.py` | Investor pitch deck — 16-slide standalone teaser for UK pre-seed angels | `pitch-deck/vetmybuilder-pitch-deck-2026.pptx` |
| `build-lighthouse-deck.py` | Project Lighthouse — 18-slide internal AI Phase 2 plan | `project-lighthouse/project-lighthouse-plan.pptx` |
| `capture-pitch-screenshots.js` | 14 PNG screenshots of the running app, used in the pitch deck | `pitch-deck/screenshots/` |
| `record-pitch-demo.js` | 25-second product demo video, embedded on slide 1 of the pitch deck | `pitch-deck/demo.mp4` (and `.webm`) |

## Pre-requisites

- **Python 3.10+** with `python-pptx` and `cairosvg` installed:
  ```bash
  pip3 install python-pptx cairosvg
  ```
- **Node + Playwright** for the screenshot and recording scripts
  (Playwright is already installed under `e2e-tests/node_modules/`)
- **ffmpeg** for converting the WebM recording to MP4 (optional but
  recommended — without it the demo video stays as WebM, which PowerPoint
  doesn't play natively)
- **`npm run dev:manual` running** in another terminal for the screenshot
  and recording scripts. Both depend on the local web app being live on
  `http://localhost:3000` with the seeded `dev:manual` users in place
  (admin, Chris Morris homeowner, Elegant Building Services tradesman).

## Workflow

### 1. Regenerate the pitch deck from source

```bash
# Re-shoot screenshots if the UI has changed
node scripts/capture-pitch-screenshots.js

# Re-record the demo video if the homeowner journey has changed
node scripts/record-pitch-demo.js

# Rebuild the deck (always runs in seconds)
python3 scripts/build-pitch-deck.py
```

The deck embeds whatever is currently in `pitch-deck/screenshots/` and
`pitch-deck/demo.mp4`. You can rebuild the deck without re-shooting if
you've only changed the slide content or copy.

### 2. Regenerate the Project Lighthouse deck

```bash
python3 scripts/build-lighthouse-deck.py
```

No external dependencies — it's pure text + shapes. Rebuilds in under
a second.

### 3. Edit slide content

All slide copy is hard-coded in the `slide_*` functions inside the
respective build script. There's no separate Markdown source — the
script IS the source of truth. To change a number, headline or bullet:

1. Open the build script
2. Find the `slide_*` function
3. Edit the string
4. Re-run the script

This is intentional: it makes the deck reproducible and lets you
diff slide changes via `git diff` on the script itself.

## What's gitignored

```
pitch-deck/                   # all generated artifacts + draft content
project-lighthouse/           # all generated artifacts
```

The contents of these folders are local-only by design. They contain:

- Investor-facing financial figures and founder bio
- Screenshots of seeded user data
- Binary `.pptx` files that don't diff usefully in git
- A 788 KB demo video that bloats history

If you want to share the deck with someone, send them the `.pptx` file
directly — don't push it to a branch.

## Branch strategy

This work lives on the **`phase-2-ai`** branch and is **not** intended
to be merged to `master`. The decks are reference documents; the
underlying AI Phase 2 code (when it ships) will live on feature
branches off `phase-2-ai` and merge upward only when each feature is
ready for production.

## Re-creating from a fresh clone

If you clone the repo to a new machine and want the decks back:

```bash
git checkout phase-2-ai            # switch to the branch with the build scripts
pip3 install python-pptx cairosvg  # install Python deps
npm run dev:manual                 # in another terminal — needed for screenshots
node scripts/capture-pitch-screenshots.js
node scripts/record-pitch-demo.js
python3 scripts/build-pitch-deck.py
python3 scripts/build-lighthouse-deck.py
```

That regenerates the entire `pitch-deck/` and `project-lighthouse/`
folders from scratch. The build is fully deterministic given the same
seeded local data.
