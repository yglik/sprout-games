# Sprout Games

Small, self-contained browser games for little kids — light, fun, and a bit teaching.
No build step, no dependencies: each game is a single `index.html` you can open directly
or serve as a static file.

## Games

- **[Garden Pick!](games/garden-pick/index.html)** — walk around a garden, pick ripe fruit
  and veggies into a basket, hear each one named out loud.
- **[Count the Fruit!](games/count-fruits/index.html)** — count the fruit shown on screen
  and tap the matching number on an on-screen keypad.
- **[Poster Paint!](games/poster-paint/index.html)** — paint with a single bristle brush
  and a 9-color palette; colors mix like real pigment (blue + yellow = green, and so on).
  The 🔬 button switches the mixing engine between the two models below.

Open `index.html` at the repo root for a simple hub linking to both.

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
games/
  garden-pick/           Garden Pick! (index.html + spoken-word audio clips)
  count-fruits/           Count the Fruit!
  poster-paint/           Poster Paint!
```
