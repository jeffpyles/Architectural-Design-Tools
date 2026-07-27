#!/usr/bin/env python3
"""Subset the faces used by the shop model into inline-able woff2.

Output is committed to assets/fonts/*.woff2 so CI can build the page without
the subsetting toolchain; build.mjs base64s them into the page.
Keeping this a separate step means the font payload only changes when the
character set does.
"""
import pathlib
import subprocess
import sys

SRC = pathlib.Path("/mnt/skills/examples/canvas-design/canvas-fonts")
OUT = pathlib.Path(__file__).resolve().parent.parent / "assets" / "fonts"

# ASCII plus the marks a framing drawing actually uses: feet/inch primes,
# vulgar fractions down to sixteenths, arrows, and a warning glyph.
CHARS = (
    "".join(chr(c) for c in range(0x20, 0x7F))
    + "°·×–—‘’“”…"
    + "′″→←↑↓•✓✗⚠️"
    + "¼½¾⅓⅔⅛⅜⅝⅞⁄"
    + "₀₁₂₃₄₅₆₇₈₉"
)

FACES = [
    ("BigShoulders-Bold.ttf", "shoulders-bold"),
    ("InstrumentSans-Regular.ttf", "instrument-regular"),
    ("InstrumentSans-Bold.ttf", "instrument-bold"),
    ("RedHatMono-Regular.ttf", "mono-regular"),
]


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for filename, stem in FACES:
        src = SRC / filename
        if not src.exists():
            print(f"missing source face: {src}", file=sys.stderr)
            return 1
        dest = OUT / f"{stem}.woff2"
        subprocess.run(
            [
                sys.executable, "-m", "fontTools.subset", str(src),
                f"--text={CHARS}",
                "--flavor=woff2",
                "--layout-features=kern,liga,tnum,frac",
                "--desubroutinize",
                "--no-hinting",
                f"--output-file={dest}",
            ],
            check=True,
        )
        size = dest.stat().st_size
        total += size
        print(f"{stem:22s} {size / 1024:7.1f} KB")
    print(f"{'total':22s} {total / 1024:7.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
