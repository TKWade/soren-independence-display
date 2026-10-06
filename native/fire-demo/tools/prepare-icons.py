"""Resize supplied artwork only; no artwork generation. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[3]
RES = ROOT / "native/fire-demo/android/app/src/main/res"
OUT = ROOT / "native/fire-demo/android/app/build/icon-review"
OUT.mkdir(parents=True, exist_ok=True)
regular = Image.open(ROOT / "public/icons/soren-app-icon-1024.png").convert("RGBA")
maskable = Image.open(ROOT / "public/icons/maskable-512.png").convert("RGBA")
# Keep the supplied maskable art in the central 72dp viewport of a 108dp layer.
# Extend only its background edge pixels into the system's 18dp overscan area.
def foreground(size):
    inner = round(size * 72 / 108)
    art = maskable.resize((inner, inner), Image.Resampling.LANCZOS)
    pad = (size - inner) // 2
    layer = Image.new("RGBA", (size, size))
    layer.paste(art, (pad, pad))
    layer.paste(art.crop((0, 0, inner, 1)).resize((inner, pad)), (pad, 0))
    layer.paste(art.crop((0, inner-1, inner, inner)).resize((inner, size-pad-inner)), (pad, pad+inner))
    layer.paste(layer.crop((pad, 0, pad+1, size)).resize((pad, size)), (0, 0))
    layer.paste(layer.crop((pad+inner-1, 0, pad+inner, size)).resize((size-pad-inner, size)), (pad+inner, 0))
    return layer
def masked(image, shape):
    image=image.copy()
    alpha=Image.new("L", image.size, 0)
    draw=ImageDraw.Draw(alpha)
    box=(0,0,image.width-1,image.height-1)
    if shape=="circle": draw.ellipse(box, fill=255)
    else: draw.rounded_rectangle(box, radius=image.width*.22, fill=255)
    image.putalpha(alpha)
    return image
for density, legacy, adaptive in [("mdpi",48,108),("hdpi",72,162),("xhdpi",96,216),("xxhdpi",144,324),("xxxhdpi",192,432)]:
    folder=RES / ("mipmap-"+density)
    regular.resize((legacy,legacy),Image.Resampling.LANCZOS).save(folder/"ic_launcher.png")
    masked(maskable,"circle").resize((legacy,legacy),Image.Resampling.LANCZOS).save(folder/"ic_launcher_round.png")
    foreground(adaptive).save(folder/"ic_launcher_foreground.png")
# Same image with unchanged proportions under common launcher masks.
canvas=Image.new("RGB",(1000,310),"#e8e8e8")
draw=ImageDraw.Draw(canvas)
preview=foreground(432).crop((72,72,360,360)).resize((220,220),Image.Resampling.LANCZOS)
for i,(label,img) in enumerate([
 ("Legacy",regular.resize((220,220),Image.Resampling.LANCZOS)),
 ("Legacy round",masked(maskable,"circle").resize((220,220),Image.Resampling.LANCZOS)),
 ("Adaptive circle",masked(preview,"circle")),
 ("Adaptive rounded square",masked(preview,"square"))]):
    canvas.paste(img,(i*250+15,45),img)
    draw.text((i*250+15,15),label,fill="black")
canvas.save(OUT/"launcher-masks.png")
(RES/"values/ic_launcher_background.xml").write_text('<resources><color name="ic_launcher_background">#064786</color></resources>\n')
print(OUT/"launcher-masks.png")
