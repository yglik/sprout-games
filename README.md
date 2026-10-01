# Sprout Games

Small, self-contained browser games for little kids — light, fun, and a bit teaching.
No build step, no dependencies: each game is a single `index.html` you can open directly
or serve as a static file.

## Games

- **[Garden Pick!](games/garden-pick/index.html)** — walk around a garden, pick ripe fruit
  and veggies into a basket, hear each one named out loud. Produce is drawn from real photos
  (credits in `games/garden-pick/img/CREDITS.md`).
- **[Count the Fruit!](games/count-fruits/index.html)** — count the fruit shown on screen
  and tap the matching number on an on-screen keypad.
- **[אותיות! / Hebrew Letters](games/hebrew-letters/index.html)** — tap a Hebrew letter to see three
  familiar pictures and hear the letter said out loud in a real recorded voice (`audio/`, one file per
  letter, listed in `audio/letters.json`). Tapping a picture says its word with the device's Hebrew
  voice; if a recording is missing, the voice reads the letter too, so the game works either way. The card
  also holds a square to write the letter in with a finger (wiped when the card closes) and a **+ תמונה**
  button, so a grown-up can photograph a real object for that letter with the camera or pick one from the
  photo library. Those photos are resized and kept in IndexedDB **on that device only** — they are never
  uploaded, so they do not sync between devices and clearing site data removes them.
- **[Poster Paint!](games/poster-paint/index.html)** — paint with a single bristle brush
  and a 9-color palette; colors mix like real pigment (blue + yellow = green, and so on).
  The 🔬 button switches the mixing engine between the two models below.

Open `index.html` at the repo root for a simple hub linking to all four.

## How the paint mixing works

Poster Paint! carries two mixing engines. Neither has a hardcoded table of colour
pairs — "blue + yellow = green" is nowhere in the code, it falls out of the maths.

**RYB (default).** Trilinear interpolation over the classic 8-corner artists' colour
cube. Fast, and it matches the colour wheel children are taught — but it is a
perceptual model with no physics in it.

**Kubelka–Munk (the 🔬 button).** The model real paint-mixing software uses. Every
paint is a reflectance curve over 36 wavelengths, built from smooth absorption
edges and bands rather than typed-in tables. Mixing sums absorption (K) and
scattering (S) separately and solves K-M for the mixture's reflectance, which is
then converted to sRGB through the CIE 1931 observer (an analytic fit, so no
lookup table). Two-constant K-M matters here: white lightens because it *scatters*
strongly, which single-constant theory cannot express.

The physical engine gets things the colour wheel cannot — tints through white,
shades through black, and mixes that go muddy on their own. It also reproduces two
real painter's facts: 50/50 red + yellow is a red-orange rather than a clean
orange, and a warm red with blue gives a dull slate-purple. A single red cannot
mix both a clean orange and a clean purple, which is why real paint sets ship a
warm red and a cool one.

## Running locally

Just open the HTML files in a browser, or serve the folder statically, e.g.:

```
python3 -m http.server 8080
```

then visit `http://localhost:8080`.

## Structure

```
index.html              landing page, links to each game
manifest.webmanifest    installable-app details (name, icons, standalone display)
sw.js                   service worker: offline play, network-first for pages
icons/                  home-screen and app icons
games/
  garden-pick/           Garden Pick! (index.html + spoken-word audio clips + img/ photos)
  count-fruits/          Count the Fruit!
  poster-paint/          Poster Paint!
  hebrew-letters/        אותיות! Hebrew letters
```

## On an iPad

The site installs as a home-screen app: open it in Safari and pick
**Share → Add to Home Screen**. It then runs full screen with no browser chrome,
so every game has a **←** button in the corner to get back to the hub. The service
worker caches the games, so they keep working with no network.

Touch controls:

- **Garden Pick!** — a joystick in the bottom-left corner walks the basket around
  (put your thumb down anywhere on the left and the stick comes to it), and the
  🧺 button in the bottom-right picks whatever ripe thing is in reach. The button
  glows when something is close enough. Produce ripens slowly on purpose — there
  should be something left to wait for.
- **Poster Paint!** — the broom asks a second time before it wipes the paper, and
  the painting survives rotations, app switches and reloads.

## How updates reach an installed app

`sw.js` caches the games so they work offline, which means updates need a moment's thought:

- **Game pages** (all the code lives inside each `index.html`) are fetched
  network-first, so a deploy shows up the next time the game is opened while online.
- **Pictures, audio and icons** are served from the cache and refreshed in the
  background, so a changed asset appears one launch later.
- **Offline**, whatever was cached last is served.
- Changing `sw.js` itself installs a new worker immediately (`skipWaiting` +
  `clients.claim`); bump `CACHE` when you want the old entries thrown away.

This only works if the server tells the browser to revalidate. nginx sends no
`Cache-Control` of its own, and browsers then guess a freshness window from
`Last-Modified` and can sit on a stale page for a long time, so the site config
sets `add_header Cache-Control "no-cache";` — with ETags a revalidation is a
cheap 304. The same config also serves `.webmanifest` as
`application/manifest+json`.

Note that an app resumed from the background is not a fresh load: the page that
is already on screen stays as it is until it navigates (tap ← and go back in) or
the app is closed from the app switcher.

## Shared chrome: nav stripe and feedback

Every page loads `shared/sprout-ui.css` + `shared/sprout-ui.js`, which add the
same slim stripe to all of them: back to the hub, the game's name, and a 💬
button. Pages keep their own content clear of it with `var(--sprout-top)`
(canvas games measure the stripe instead, since they draw in device pixels).

A page configures the stripe by setting `window.sproutConfig` before loading the
script:

```html
<script>
window.sproutConfig = {
  game: 'garden-pick', title: 'Garden Pick!', home: '../../index.html',
  accent: '#5cb83e',
  context: () => ({ picked: collected.length })   // whatever the game knows now
};
</script>
<script src="../../shared/sprout-ui.js"></script>
```

The 💬 button opens a sheet for a written note, a voice recording (up to 90s,
recorded with MediaRecorder), or both. Each submission carries the game's own
`context()` plus screen size, orientation, whether it is running as an installed
app, language, user agent and how long the page had been open. The sheet shows
exactly what will be sent under "What gets sent with this". If the iPad is
offline the submission is queued in `localStorage` and retried on the next load.

Submissions go to `POST /api/feedback` on the VPS, handled by
`server/feedback_server.py` (Python stdlib, systemd unit `sprout-feedback`,
listening on 127.0.0.1:3031). Each one becomes a directory under
`/var/lib/sprout-feedback/` holding `feedback.json` and any recording. Review
them at `https://sprout-games.yochai.net/feedback/`, which nginx keeps behind
basic auth.
