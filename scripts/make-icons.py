"""Draw the Mountain Chicken launcher art. Charcoal ground, sandstone mountain, chalk chicken."""

from PIL import Image, ImageDraw

SIZE = 1024


def mountain(draw: ImageDraw.ImageDraw, ink: tuple[int, int, int, int]) -> None:
    draw.polygon([(70, 900), (360, 280), (520, 560), (700, 180), (960, 900)], fill=ink)


def chicken(draw: ImageDraw.ImageDraw, chalk: tuple[int, int, int, int], copper: tuple[int, int, int, int], amber: tuple[int, int, int, int], ink: tuple[int, int, int, int]) -> None:
    draw.ellipse((250, 560, 520, 820), fill=chalk)
    draw.ellipse((470, 470, 680, 680), fill=chalk)
    draw.polygon([(650, 560), (790, 610), (650, 660)], fill=copper)
    draw.polygon([(560, 470), (600, 390), (640, 480), (610, 460), (590, 500)], fill=amber)
    draw.ellipse((600, 545, 628, 573), fill=ink)


def main() -> None:
    charcoal = (18, 20, 16, 255)
    sand = (196, 165, 116, 255)
    chalk = (246, 241, 231, 255)
    copper = (212, 120, 58, 255)
    amber = (240, 180, 41, 255)
    ink = (18, 20, 16, 255)

    icon = Image.new("RGBA", (SIZE, SIZE), charcoal)
    draw = ImageDraw.Draw(icon)
    mountain(draw, sand)
    chicken(draw, chalk, copper, amber, ink)
    icon.save("assets/icon.png")
    icon.resize((48, 48), Image.Resampling.LANCZOS).save("assets/favicon.png")

    foreground = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    fdraw = ImageDraw.Draw(foreground)
    mountain(fdraw, sand)
    chicken(fdraw, chalk, copper, amber, ink)
    foreground.save("assets/android-icon-foreground.png")
    foreground.save("assets/android-icon-monochrome.png")
    foreground.save("assets/splash-icon.png")

    background = Image.new("RGBA", (SIZE, SIZE), charcoal)
    background.save("assets/android-icon-background.png")


if __name__ == "__main__":
    main()
