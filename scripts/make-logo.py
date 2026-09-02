"""Render the Rozakos Fitness mark and every store asset that derives from it.

The mark is the Rozakos Industries robot from rozakos.com — rounded-square head,
two ball-tipped antennae, white visor, crimson eyes — grown a bodybuilder's
upper body and put in a double-biceps pose. Flat vector shapes only, so it stays
legible at a 48dp launcher icon.

Everything is drawn on a supersampled canvas and downsampled at the end, which
is what gives the edges their antialiasing; PIL does not antialias polygons.

    python scripts/make-logo.py

Writes into mobile/assets/store/. Sizes and safe areas follow
https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "mobile" / "assets" / "store"

# Brand palette — mobile/src/theme/colors.ts, itself taken from the rozakos.com
# theme CSS. The body uses the brighter crimson: #a5211f against the #2c2c3e
# charcoal is too close in value to read as a silhouette at launcher size.
CHARCOAL = (44, 44, 62, 255)
CRIMSON = (179, 36, 31, 255)
CRIMSON_DARK = (125, 24, 21, 255)
CRIMSON_LIGHT = (201, 74, 61, 255)
TEAL = (47, 177, 162, 255)
VISOR = (244, 244, 244, 255)

SS = 4  # supersample factor
CANVAS = 1024.0  # the coordinate space draw_mark() is authored in


def capsule(draw, p0, p1, width, fill):
    """A thick line with rounded ends — the limb primitive."""
    r = width / 2.0
    draw.line([p0, p1], fill=fill, width=max(1, int(round(width))))
    for x, y in (p0, p1):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def ellipse(draw, cx, cy, rx, ry, fill):
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=fill)


def draw_mark(draw, s):
    """Draw the robot into the 1024-unit authoring space, scaled by `s`."""

    def P(*pts):
        return [(x * s, y * s) for x, y in pts]

    def box(x0, y0, x1, y1):
        return [x0 * s, y0 * s, x1 * s, y1 * s]

    # ---- torso: a V-taper from wide traps down to a narrow waist -------------
    draw.polygon(P((392, 606), (632, 606), (572, 888), (452, 888)), fill=CRIMSON)

    # traps sloping up from the neck out to the shoulder line
    draw.polygon(P((462, 496), (562, 496), (676, 634), (348, 634)), fill=CRIMSON)

    # ---- arms: the double-biceps pose ---------------------------------------
    # The three segments separate by value rather than by outline, which is what
    # keeps them readable at 48dp: the shoulder-and-bicep mass is the light tone,
    # the forearm crossing in front of it is the mid tone, the fist is the dark
    # one. Drawing the bicep in the same light tone as the upper arm merges them
    # into one muscled mass instead of leaving a crescent poking out of the crook.
    for flip in (False, True):
        joints = [(350, 598), (170, 604), (232, 326)]
        if flip:
            joints = [(1024 - x, y) for x, y in joints]
        sh, el, fi = [(x * s, y * s) for x, y in joints]

        capsule(draw, sh, el, 150 * s, CRIMSON_LIGHT)  # shoulder cap + upper arm
        ellipse(  # the peak, riding on the top edge of the upper arm
            draw,
            sh[0] + (el[0] - sh[0]) * 0.45,
            sh[1] + (el[1] - sh[1]) * 0.45 - 48 * s,
            90 * s,
            64 * s,
            CRIMSON_LIGHT,
        )

        capsule(draw, el, fi, 104 * s, CRIMSON)  # forearm, in front

        # forearm plating, so the limb is not a bare tube
        angle = math.atan2(fi[1] - el[1], fi[0] - el[0]) + math.pi / 2
        dx, dy = math.cos(angle) * 40 * s, math.sin(angle) * 40 * s
        for t in (0.40, 0.62):
            px = el[0] + (fi[0] - el[0]) * t
            py = el[1] + (fi[1] - el[1]) * t
            draw.line(
                [(px - dx, py - dy), (px + dx, py + dy)],
                fill=CRIMSON_DARK,
                width=max(1, int(round(7 * s))),
            )

        ellipse(draw, fi[0], fi[1], 54 * s, 50 * s, CRIMSON_DARK)  # fist

    # ---- chest: the Rozakos chevron, in the teal the app uses for PRs --------
    for dy in (0, 56):
        draw.polygon(
            P(
                (512, 640 + dy),
                (582, 706 + dy),
                (582, 746 + dy),
                (512, 680 + dy),
                (442, 746 + dy),
                (442, 706 + dy),
            ),
            fill=TEAL,
        )

    # ---- neck ---------------------------------------------------------------
    draw.polygon(P((474, 466), (550, 466), (562, 518), (462, 518)), fill=CRIMSON_DARK)

    # ---- antennae (stems tucked behind the head, balls clear of it) ---------
    for x0, x1 in ((452, 402), (572, 622)):
        capsule(draw, (x0 * s, 296 * s), (x1 * s, 184 * s), 18 * s, CRIMSON_DARK)
        ellipse(draw, x1 * s, 178 * s, 32 * s, 32 * s, CRIMSON)

    # ---- head ---------------------------------------------------------------
    draw.rounded_rectangle(box(380, 264, 644, 476), radius=48 * s, fill=CRIMSON)
    draw.rounded_rectangle(box(416, 304, 608, 418), radius=24 * s, fill=VISOR)
    # eyes — crimson on white reads at launcher size where teal would not
    for cx in (462, 562):
        ellipse(draw, cx * s, 361 * s, 27 * s, 27 * s, CRIMSON_DARK)


def render_mark(size, fill, background=None):
    """Render the mark at `size` px, scaled so it spans `fill` of the canvas.

    The mark is drawn, cropped to its own ink, then scaled to the requested
    fraction — so the safe-area fractions below mean what they say regardless of
    how the shapes above get nudged.
    """
    big = size * SS
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw_mark(ImageDraw.Draw(layer), big / CANVAS)

    mark = layer.crop(layer.getbbox())
    scale = (big * fill) / max(mark.width, mark.height)
    mark = mark.resize(
        (max(1, round(mark.width * scale)), max(1, round(mark.height * scale))),
        Image.LANCZOS,
    )

    canvas = Image.new("RGBA", (big, big), background or (0, 0, 0, 0))
    canvas.alpha_composite(mark, ((big - mark.width) // 2, (big - mark.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def render_monochrome(size):
    """Android 13+ themed icon: a flat silhouette the system tints itself.

    Only alpha survives, so the visor is knocked *out* of the silhouette rather
    than filled — otherwise the head flattens into a featureless block and the
    robot stops being a robot. The eyes stay solid inside the hole, which is
    what puts the face back.
    """
    img = render_mark(size, 0.60)
    px = img.load()
    for y in range(size):
        for x in range(size):
            r, g, b, a = px[x, y]
            # visor is near-white; every other filled area is a crimson tone
            if a > 0 and r > 200 and g > 200 and b > 200:
                px[x, y] = (r, g, b, 0)

    out = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    out.putalpha(img.getchannel("A"))
    return out


# Bold grotesques, best first. The wordmark is the only thing here that needs a
# font, and only the feature graphic needs a wordmark — if none of these exist
# the graphic falls back to the rule from the site's lockup rather than failing.
FONT_CANDIDATES = (
    "C:/Windows/Fonts/seguibl.ttf",  # Segoe UI Black
    "C:/Windows/Fonts/ariblk.ttf",  # Arial Black
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/segoeuib.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
)


def load_font(size):
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return None


def render_feature_graphic():
    """Play Store feature graphic, 1024x500 — the mark plus the wordmark."""
    w, h = 1024 * SS, 500 * SS
    img = Image.new("RGBA", (w, h), CHARCOAL)

    mark = render_mark(int(376 * SS), 0.94)
    img.alpha_composite(mark, (int(128 * SS), (h - mark.height) // 2))

    draw = ImageDraw.Draw(img)
    x = 548 * SS
    avail = w - x - 56 * SS  # right margin

    def fitted(text, points):
        """Largest of `points` (descending) whose rendering still fits `avail`."""
        for pt in points:
            font = load_font(int(pt * SS))
            if font is None:
                return None
            if draw.textlength(text, font=font) <= avail:
                return font
        return font

    name = fitted("ROZAKOS", (68, 62, 56, 50, 44))
    if name is None:
        draw.rounded_rectangle([x, 232 * SS, 892 * SS, 248 * SS], radius=8 * SS, fill=CRIMSON)
        draw.rounded_rectangle([x, 268 * SS, 788 * SS, 280 * SS], radius=6 * SS, fill=TEAL)
        return img.resize((1024, 500), Image.LANCZOS)

    # Stacked, not inline: on a 1024x500 with the mark on the left there is not
    # room for "ROZAKOS FITNESS" on one line at a size worth reading. Crimson on
    # the second word is the split the site's own lockup uses.
    draw.text((x, 150 * SS), "ROZAKOS", font=name, fill=(244, 244, 244, 255))
    draw.text((x, 226 * SS), "FITNESS", font=name, fill=CRIMSON_LIGHT)
    draw.rounded_rectangle([x, 318 * SS, x + 88 * SS, 326 * SS], radius=4 * SS, fill=TEAL)

    tagline = fitted("Build your ideas.  Lift your goals.", (24, 21, 18))
    if tagline is not None:
        draw.text(
            (x, 348 * SS),
            "Build your ideas.  Lift your goals.",
            font=tagline,
            fill=(160, 160, 184, 255),
        )
    return img.resize((1024, 500), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    written = []

    def save(name, img):
        img.save(OUT / name)
        written.append("  {:26} {}x{}".format(name, img.width, img.height))

    # Store / iOS icon: charcoal ground, mark at 78% — iOS crops no safe area,
    # so it can run close to the edge.
    save("icon.png", render_mark(1024, 0.78, CHARCOAL))
    # Android adaptive foreground: the launcher masks to a circle and parallaxes
    # it, so the mark has to sit inside the middle 66%.
    save("adaptive-foreground.png", render_mark(1024, 0.60))
    save("monochrome.png", render_monochrome(1024))
    # the splash has no launcher mask to survive, so it fills more of its box
    save("splash.png", render_mark(1024, 0.86))
    save("favicon.png", render_mark(96, 0.82, CHARCOAL))
    save("feature-graphic.png", render_feature_graphic())

    print("wrote into {}".format(OUT))
    print("\n".join(written))


if __name__ == "__main__":
    main()
