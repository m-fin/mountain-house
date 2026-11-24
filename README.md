# Hearthridge

A cozy couple game set in a little mountain house. You and your person
live on a pine ridge: fix the porch, plant a garden, light the hearth,
and watch the day turn to sunset and night.

A free web build you can play in a desktop or phone browser. All rights
reserved: you may play it, but please do not copy or republish the source
without permission.

- Play: [https://m-fin.github.io/mountain-house/](https://m-fin.github.io/mountain-house/)
- Source: [https://github.com/m-fin/mountain-house](https://github.com/m-fin/mountain-house)

## Play (local)

ES modules need to be served over http:

```sh
python3 -m http.server 8766
# then open http://127.0.0.1:8766/
```

- **Keyboard:** WASD to walk, mouse to look (click the view to capture
  the cursor), E or Space to hold and finish a task, ? for help.
- **Phone:** left stick to walk, drag the right side to look, hold Use
  to work. Add `?touch=1` to force the on-screen controls.

Progress saves in the browser (`localStorage`). `?fresh=1` starts a new
save. `?time=sunset|day|night|dawn` jumps the sky for a screenshot.

## What's in this prototype

- A low-poly cabin on a sloped meadow, pines, and a day–night sky.
- Two characters: you walk one, the other wanders and will help
  (watering the garden if you have planted it).
- Three tasks: repair a broken porch board, plant and water a garden
  bed that grows over time, and light the fireplace.
- An original scored soundtrack (felt piano, guitar-like plucks, strings)
  that follows the time of day, the porch, the garden, the lit hearth, and
  whether you are fixing something or have made the house your own. Soft
  procedural wind stays underneath. Music starts after the first tap or
  keypress. The mute button (M) is remembered in this browser.

Built like DRIFTHOME: plain JavaScript ES modules and vendored
[three.js](https://threejs.org/) 0.186, no build step and no CDN.

## Test

```sh
npx --yes playwright@1.55.1 test --config=tests/playwright.config.mjs
# or: node tests/playtest.mjs
```

---
By Matthew "Frog" Finley. All rights reserved.
