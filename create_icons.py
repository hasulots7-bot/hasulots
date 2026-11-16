import os
from PIL import Image, ImageDraw

def create_icon(size):
    # Create image with smooth rounded corner background
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw rounded rectangle background (Royal blue gradient simulated)
    corner_radius = int(size * 0.22)
    draw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=corner_radius, fill=(37, 99, 235, 255))

    # Inner decorative glow
    margin = int(size * 0.04)
    draw.rounded_rectangle([(margin, margin), (size - margin - 1, size - margin - 1)], 
                           radius=corner_radius - margin, outline=(96, 165, 250, 100), width=int(size * 0.02))

    # Draw stylized printer icon
    # Printer main body
    body_x0 = int(size * 0.22)
    body_y0 = int(size * 0.42)
    body_x1 = int(size * 0.78)
    body_y1 = int(size * 0.72)
    draw.rounded_rectangle([(body_x0, body_y0), (body_x1, body_y1)], radius=int(size * 0.05), fill=(255, 255, 255, 255))

    # Printer top paper feed
    feed_x0 = int(size * 0.32)
    feed_y0 = int(size * 0.22)
    feed_x1 = int(size * 0.68)
    feed_y1 = int(size * 0.45)
    draw.rounded_rectangle([(feed_x0, feed_y0), (feed_x1, feed_y1)], radius=int(size * 0.03), fill=(226, 232, 240, 255), outline=(255, 255, 255, 255), width=int(size * 0.015))

    # Printer bottom output tray paper
    out_x0 = int(size * 0.30)
    out_y0 = int(size * 0.62)
    out_x1 = int(size * 0.70)
    out_y1 = int(size * 0.85)
    draw.rounded_rectangle([(out_x0, out_y0), (out_x1, out_y1)], radius=int(size * 0.03), fill=(241, 245, 249, 255), outline=(37, 99, 235, 255), width=int(size * 0.015))

    # Paper lines on output sheet
    line_w = int(size * 0.015)
    draw.line([(int(size * 0.36), int(size * 0.68)), (int(size * 0.64), int(size * 0.68))], fill=(148, 163, 184, 255), width=line_w)
    draw.line([(int(size * 0.36), int(size * 0.74)), (int(size * 0.58), int(size * 0.74))], fill=(148, 163, 184, 255), width=line_w)

    # Indicator light on printer
    light_r = int(size * 0.02)
    light_x = int(size * 0.70)
    light_y = int(size * 0.50)
    draw.ellipse([(light_x - light_r, light_y - light_r), (light_x + light_r, light_y + light_r)], fill=(16, 185, 129, 255))

    return img

public_dir = os.path.join(os.path.dirname(__file__), "public")
os.makedirs(public_dir, exist_ok=True)

# Generate 512x512
img512 = create_icon(512)
img512.save(os.path.join(public_dir, "icon-512.png"))

# Generate 192x192
img192 = create_icon(192)
img192.save(os.path.join(public_dir, "icon-192.png"))

# Generate Windows ICO containing 16, 32, 48, 64, 128, 256
img512.save(os.path.join(public_dir, "icon.ico"), format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("Icons generated successfully!")
