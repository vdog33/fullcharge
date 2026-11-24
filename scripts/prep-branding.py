"""FULLCHARGE branding prep: real logo/wordmark -> app assets.

- icon.png: red-tile option A icon (red tile, black shield, white bolt),
  resized to 1024x1024. Provisional: Vince asked for a red background;
  option A (white bolt on black) vs B (white shield, red bolt) still open.
- bolt-shield.png: shield with the black backdrop flood-filled to transparent.
- wordmark.png: stencil bolt-A wordmark with the pure-black backdrop keyed
  to transparent (FULL white, CHARGE red, A in CHARGE is a lightning bolt).
"""
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

BRAND = "/home/hatch/workspace/goals/become-an-industry-expert-in-ev-extrication/files/fullcharge-wordmark"
OUT = "/home/hatch/workspace/goals/become-an-industry-expert-in-ev-extrication/files/fullcharge-app/fullcharge/assets"
ICON_RED_A = f"{BRAND}/media-generation-fullcharge-app-icon-red-a-0-e6f1efd1-ba67-448d-a240-fbd3785302ca.webp"
SHIELD = f"{BRAND}/fullcharge-icon-shield.webp"
WORDMARK = f"{BRAND}/fullcharge-wordmark-stencil-bolt-a.webp"


def remove_backdrop_flood(im: Image.Image, tol: float = 20.0) -> Image.Image:
    """Make transparent only the backdrop region connected to the image border."""
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    bg = rgb[0, 0]  # corner pixel = backdrop colour
    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    like_bg = dist < tol
    labels, n = ndimage.label(like_bg)
    border_labels = set(np.unique(np.concatenate([
        labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1],
    ])))
    border_labels.discard(0)
    backdrop = np.isin(labels, list(border_labels))
    alpha = np.where(backdrop, 0.0, 255.0).astype(np.float32)
    # 1px feather so the cut edge doesn't look ragged at small sizes
    alpha = np.asarray(Image.fromarray(alpha.astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(1)))
    out = np.dstack([rgb, alpha]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def remove_black_backdrop(im: Image.Image) -> Image.Image:
    """Key pure-black backdrop to transparent, feathering anti-aliased edges."""
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    bright = rgb.max(axis=2)
    alpha = np.clip((bright - 10) / 30.0, 0, 1) * 255
    alpha = np.asarray(Image.fromarray(alpha.astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(1)))
    out = np.dstack([rgb, alpha]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


icon_src = Image.open(ICON_RED_A).convert("RGB")
arr = np.asarray(icon_src).astype(np.float32)
r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
red = (r > 150) & (g < 100) & (b < 100)
ys, xs = np.where(red)
y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
tile = arr[y0:y1 + 1, x0:x1 + 1].copy()
# Dark pixels connected to the crop border are the corner triangles outside
# the rounded tile — paint them the tile red so the icon is a full square.
dark = tile.max(axis=2) < 40
labels, _ = ndimage.label(dark)
border = set(np.unique(np.concatenate([
    labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1],
])))
border.discard(0)
tile[np.isin(labels, list(border))] = np.array([225, 6, 0], dtype=np.float32)
Image.fromarray(tile.astype(np.uint8), "RGB").resize(
    (1024, 1024), Image.LANCZOS).save(f"{OUT}/icon.png")
print("icon.png:", Image.open(f"{OUT}/icon.png").size)

shield = Image.open(SHIELD).convert("RGB")
shield_small = shield.resize((512, 512), Image.LANCZOS)
transparent_shield = remove_backdrop_flood(shield_small)
transparent_shield.save(f"{OUT}/bolt-shield.png")
a = np.asarray(transparent_shield)[:, :, 3]
print("bolt-shield.png:", transparent_shield.size,
      "corner alpha:", a[0, 0], "centre alpha:", a[256, 256],
      "opaque px:", int((a > 200).sum()), "transparent px:", int((a < 55).sum()))

wordmark = Image.open(WORDMARK).convert("RGB")
wordmark_small = wordmark.resize((1024, 341), Image.LANCZOS)
transparent_wordmark = remove_black_backdrop(wordmark_small)
transparent_wordmark.save(f"{OUT}/wordmark.png")
a2 = np.asarray(transparent_wordmark)[:, :, 3]
print("wordmark.png:", transparent_wordmark.size,
      "corner alpha:", a2[0, 0], "text alpha:", a2[170, 512],
      "opaque px:", int((a2 > 200).sum()), "transparent px:", int((a2 < 55).sum()))
