# Chromebook Lite test mode

This branch adds a real low-resolution rendering option for weak Chromebooks.

## Test
Deploy this branch (or run its build) and open:

- `/nacht?lite=1&renderer=webgl2` — render at up to 640 pixels wide (approximately 640×360 for a 16:9 display).
- `/nacht?lite=1&renderScale=0.35&renderer=webgl2` — use around 35% of CSS viewport dimensions, with a minimum of 320×180.
- `/nacht?lite=1&renderScale=0.25&renderer=webgl2` — minimum detail. Does not go below 320×180.

This changes the **actual engine canvas/backbuffer**, not only CSS window dimensions. The base game's 800×600 minimum is left unchanged unless `lite=1` is present. The WebGL2 renderer is requested explicitly for testing compatibility.

## Limitations

This alone cannot guarantee that a map starts on a Chromebook with limited RAM. The engine's WebAssembly memory and full map resources are still required. Lower resolution primarily reduces frame buffer / GPU usage and rendering work, not the whole map's loaded RAM.

Watch the F3 performance panel, console, and the crash report. Compare Nacht at normal resolution against the Lite settings. If the browser process is killed with no engine error, investigate peak WebAssembly/asset memory consumption next.

## Deploy

The branch needs building/deployment; editing the GitHub repository does not change the currently live vel.gg deployment.
