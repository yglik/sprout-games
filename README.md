# Sprout Games

Small, self-contained browser games for little kids — light, fun, and a bit teaching.
No build step, no dependencies: each game is a single `index.html` you can open directly
or serve as a static file.

## Games

- **[Garden Pick!](games/garden-pick/index.html)** — walk around a garden, pick ripe fruit
  and veggies into a basket, hear each one named out loud.
- **[Count the Fruit!](games/count-fruits/index.html)** — count the fruit shown on screen
  and tap the matching number on an on-screen keypad.
- **[Poster Paint!](games/poster-paint/index.html)** — paint with a single textured brush
  and a 9-color palette; colors mix like real pigment (blue + yellow = green, and so on).

Open `index.html` at the repo root for a simple hub linking to both.

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
