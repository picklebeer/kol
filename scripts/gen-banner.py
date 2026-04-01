"""Generate KOL banner image (1500x500)."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1500, 500
BG = (10, 10, 14)          # near-black
CYAN = (0, 240, 255)
GOLD = (255, 204, 0)
WHITE = (230, 230, 230)
MUTED = (100, 100, 120)

FONT_BOLD = "/tmp/jbmono/fonts/ttf/JetBrainsMono-ExtraBold.ttf"
FONT_REG = "/tmp/jbmono/fonts/ttf/JetBrainsMono-Bold.ttf"
MASCOT = "/Users/gman/Desktop/proj/crypto/dev/kol/static/img/oilking.png"
OUT = "/Users/gman/Desktop/proj/crypto/dev/kol/static/img/banner.png"

# Create base image
img = Image.new("RGBA", (W, H), BG)
draw = ImageDraw.Draw(img)

# Subtle gradient overlay (dark to slightly lighter)
for y in range(H):
    alpha = int(15 * (y / H))
    draw.line([(0, y), (W, y)], fill=(30, 30, 50, alpha))

# Horizontal accent lines (pipeline aesthetic)
for y_pos in [80, 420]:
    draw.line([(50, y_pos), (W - 50, y_pos)], fill=(*CYAN, 30), width=1)

# Add subtle grid dots
for x in range(100, W, 60):
    for y in range(40, H, 60):
        draw.ellipse([x-1, y-1, x+1, y+1], fill=(40, 40, 60))

# Load and place mascot on the left
mascot = Image.open(MASCOT).convert("RGBA")
mascot_h = 400
mascot_w = int(mascot.width * (mascot_h / mascot.height))
mascot = mascot.resize((mascot_w, mascot_h), Image.LANCZOS)

# Add glow behind mascot
glow = Image.new("RGBA", (mascot_w + 80, mascot_h + 80), (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow)
glow_draw.ellipse([0, 0, mascot_w + 80, mascot_h + 80], fill=(0, 240, 255, 20))
glow = glow.filter(ImageFilter.GaussianBlur(30))
img.paste(glow, (30, (H - mascot_h) // 2 - 40), glow)

mascot_x = 80
mascot_y = (H - mascot_h) // 2
img.paste(mascot, (mascot_x, mascot_y), mascot)

# Text area starts after mascot
text_x = mascot_x + mascot_w + 80

# Title: "KOL"
title_font = ImageFont.truetype(FONT_BOLD, 140)
title_bbox = draw.textbbox((0, 0), "KOL", font=title_font)
title_w = title_bbox[2] - title_bbox[0]
title_y = 110

# Cyan glow behind title
for dx in range(-2, 3):
    for dy in range(-2, 3):
        draw.text((text_x + dx, title_y + dy), "KOL", font=title_font, fill=(*CYAN, 40))
draw.text((text_x, title_y), "KOL", font=title_font, fill=CYAN)

# Subtitle: "KING OF THE OIL LINES"
sub_font = ImageFont.truetype(FONT_REG, 36)
sub_y = title_y + 155
draw.text((text_x + 4, sub_y), "KING OF THE OIL LINES", font=sub_font, fill=GOLD)

# Tagline
tag_font = ImageFont.truetype(FONT_REG, 18)
tag_y = sub_y + 55
draw.text((text_x + 4, tag_y), "DRILL  ·  CLAIM  ·  DOMINATE", font=tag_font, fill=MUTED)

# Decorative bar under subtitle
bar_y = sub_y + 48
draw.line([(text_x + 4, bar_y), (text_x + 460, bar_y)], fill=(*CYAN, 80), width=2)

# "BUILT ON SOLANA" bottom right
sol_font = ImageFont.truetype(FONT_REG, 14)
draw.text((W - 220, H - 35), "BUILT ON SOLANA", font=sol_font, fill=MUTED)

# Save
img = img.convert("RGB")
img.save(OUT, quality=95)
print(f"Banner saved to {OUT} ({W}x{H})")
