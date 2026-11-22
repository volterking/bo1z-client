# Xbox One S / Microsoft Edge experimental controller support

This branch is a **browser compatibility experiment**, not a verified Xbox port.

## What changed
- Xbox User-Agent detection activates gamepad-only mode automatically; any desktop can test the same mode using `?controller=1`.
- Reads **standard-layout** controllers through the Gamepad API (left stick WASD, right stick mouse movement, RT shoot, LT aim, A jump/select, B crouch/back, X reload, Y change weapon, bumpers Q/G, Menu Escape, D-pad menu arrows).
- On a controller-enabled page, the engine starts **without browser pointer lock**. The game-page loading overlay displays a **Start with controller** button that can be activated with Xbox Edge's browser controls; its user gesture requests fullscreen (where allowed) and starts audio.
- Xbox detection avoids the mobile User-Agent gate; all actual Wasm threads, SIMD, JSPI, OPFS, cross-origin isolation, WebGL2 and worker graphics checks remain enforced. Xbox Edge builds that lack any of those prerequisites still cannot run the engine.
- Adds persistent **Blood effects** toggle in Options. When off the game is started with `+set cg_blood 0`. This may hide blood spurts; whether it removes all gore/decals depends on the compiled engine.

## Try on Xbox One S
1. Merge/deploy on Render (HTTPS); open the Render game URL in Microsoft Edge on Xbox.
2. Enable Edge's game-controller / browsing controls where necessary to navigate the web page. Open Options and turn **Blood effects** off if desired, then select the **Nacht** map.
3. When **Ready**, activate **Start with controller**. Fullscreen will be requested, but Edge may refuse it.
4. If the game begins, try both analog sticks, RT, LT, A, B, X, Y and Menu. If nothing responds, verify the Xbox browser exposes a standard Gamepad API device and that browser navigation is not consuming the input.
5. Test the same controls on a desktop Chrome/Edge first by loading `/nacht?controller=1&lite=3&renderer=webgl2` with an Xbox controller, then compare to `/nacht?controller=1&lite=3&renderer=webgl2` on Xbox.

## Important limitations
- No Xbox device or browser test was performed. It may fail capability checks, memory allocation or graphics initialization, regardless of controller support.
- Xbox Edge may retain browser-level shortcuts, require a browser game-controls toggle, or reject automatic fullscreen/pointer use.
- The gamepad mapping is a keyboard/mouse emulation; it isn't a native CoD controller implementation, and menu support may be incomplete.
- `cg_blood 0` is not guaranteed to suppress every gore texture or animation.
- Existing desktop keyboard/mouse behavior is unchanged outside controller mode.
