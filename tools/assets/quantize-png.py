#!/usr/bin/env python3

import argparse
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser(description="Quantize pixel-art PNG files without dithering.")
    parser.add_argument("paths", nargs="+", type=Path)
    parser.add_argument("--colors", type=int, default=64)
    args = parser.parse_args()

    for path in args.paths:
        image = Image.open(path).convert("RGBA")
        quantized = image.quantize(
            colors=args.colors,
            method=Image.Quantize.FASTOCTREE,
            dither=Image.Dither.NONE,
        )
        temporary = path.with_suffix(".quantized.png")
        quantized.save(temporary, optimize=True)
        temporary.replace(path)
        print(f"Quantized {path} to {args.colors} colors")


if __name__ == "__main__":
    main()
