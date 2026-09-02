# Branding and app assets

## The mark

The Rozakos Fitness mark is the **Rozakos Industries robot** from
[rozakos.com](https://rozakos.com) — rounded-square head, ball-tipped antennae, white visor,
crimson eyes — given a bodybuilder's upper body in a double-biceps pose, with the teal
chevron on its abs.

It is **generated, not hand-drawn**. Every file in `mobile/assets/store/` comes out of
`scripts/make-logo.py`, which draws flat shapes into a 1024-unit coordinate space and
supersamples 4x before downsampling (PIL does not antialias polygons, so this is what gives
the edges their smoothness).

```bash
python scripts/make-logo.py     # needs Pillow; rewrites every file below
```

**Edit the script, never the PNGs.** A hand-edited PNG is silently reverted the next time
anyone regenerates.

## Palette

Taken from the rozakos.com theme CSS. The app's runtime tokens live in
`mobile/src/theme/colors.ts`; the generator keeps its own copies at the top of the file
because it runs outside the bundler.

| Role | Hex | Used for |
|---|---|---|
| Charcoal | `#2c2c3e` | Icon ground, splash and adaptive-icon background |
| Crimson (brand) | `#a5211f` | Primary actions **in the app** |
| Crimson (mark) | `#b3241f` | The robot's body — see the note below |
| Crimson light | `#c94a3d` | Shoulder + bicep mass, "FITNESS" in the wordmark |
| Crimson dark | `#7d1815` | Fists, neck, antenna stems, eyes |
| Teal | `#2fb1a2` | The chest chevron; PRs and success in the app |
| Visor | `#f4f4f4` | Face plate, "ROZAKOS" in the wordmark |

The mark uses a **brighter crimson than the brand `#a5211f`**. Against the `#2c2c3e`
charcoal the brand crimson is too close in value to read as a silhouette at launcher size.
This is deliberate; do not "correct" it back.

## Generated assets

| File | Size | Mark fills | Consumed by |
|---|---|---|---|
| `icon.png` | 1024² | 78%, on charcoal | `expo.icon`, `expo.ios.icon` |
| `adaptive-foreground.png` | 1024², transparent | 60% | `expo.android.adaptiveIcon.foregroundImage` |
| `monochrome.png` | 1024², alpha only | 60% | `expo.android.adaptiveIcon.monochromeImage` |
| `splash.png` | 1024², transparent | 86% | `expo-splash-screen` plugin (`imageWidth: 76`) |
| `favicon.png` | 96², on charcoal | 82% | `expo.web.favicon` |
| `feature-graphic.png` | 1024 x 500 | — | Play Console listing (not referenced by `app.json`) |

The fill fractions are not arbitrary:

- **60% for the adaptive icon** because Android masks it to a circle and parallaxes it during
  the launcher animation; the mark has to sit inside the middle 66%.
- **86% for the splash** because it has no mask to survive, and at `imageWidth: 76` a smaller
  fraction leaves the robot too small to recognise.
- **78% for the store icon** because iOS crops no safe area, so it can run close to the edge.

`render_mark()` crops the drawing to its own ink before scaling, so these percentages stay
accurate even if the shape coordinates get nudged.

## Three things that are load-bearing

If you redraw the mark, these are the decisions that are easy to lose and expensive to
rediscover:

1. **The arm segments separate by *value*, not by outline** — light shoulder-and-bicep mass,
   mid-tone forearm crossing in front of it, dark fist. Outlines disappear at 48dp; value
   steps survive. An earlier attempt drew the bicep as a contrasting crescent poking out of
   the elbow crook and the whole thing read as a lobster claw.
2. **The monochrome variant knocks the visor *out* of the silhouette.** Only alpha survives a
   themed icon, so a filled head is just a rounded block and the robot stops being a robot.
   The eyes stay solid inside the hole, which is what puts the face back.
3. **The wordmark is stacked, not inline.** On a 1024 x 500 feature graphic with the mark on
   the left there is no room for "ROZAKOS FITNESS" on one line at a readable size.
   `fitted()` picks the largest candidate size that still fits the available width, so the
   graphic degrades gracefully rather than overrunning the canvas.

## Fonts

Only the feature graphic needs a font. `FONT_CANDIDATES` probes Segoe UI Black, Arial Black,
Arial Bold, Segoe UI Bold, then DejaVu Sans Bold and macOS Arial Bold. If none resolve the
graphic falls back to the crimson/teal rule from the site's lockup instead of failing, so the
script stays runnable on a machine with none of them — including CI.

## Checking a change

There is no automated visual test. After regenerating:

1. `node scripts/check-play-readiness.mjs` — asserts the files exist at the right dimensions.
2. Look at the icon **masked to a circle and to a squircle**, and at the monochrome silhouette
   tinted on a dark ground. A mark that reads at 1024 can still fall apart under a circular
   mask.
3. Look at it at **48px**. That is the size it actually ships at in a launcher.

## Releasing a brand change

`app.json` points at these paths and the release flow bakes them into the native project at
**prebuild** time. So a brand change needs the script re-run *before* `scripts/release.ps1`,
and the run must not use `-NoPrebuild`. See [docs/release.md](release.md).

Play caches the store icon and feature graphic separately from the bundle — updating the app
does not update the listing artwork. Re-upload both in Play Console when the mark changes.
