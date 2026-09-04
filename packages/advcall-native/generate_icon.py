#!/usr/bin/env python3
"""Generate the advcall 'A' app icon — dark theme, sharp typography."""
import os
from PIL import Image, ImageDraw, ImageFont


def generate_icon(size):
    """Generate an 'A' icon at the given size."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded rect background — dark purple gradient
    corner = size // 4
    # Fill background with gradient
    for y in range(size):
        t = y / size
        r = int(30 + t * 15)
        g = int(12 + t * 8)
        b = int(55 + t * 35)
        draw.line([(0, y), (size - 1, y)], fill=(r, g, b, 255))

    # Mask to rounded rect
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=corner, fill=255)

    # Apply mask
    bg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bg.paste(img, mask=mask)
    img = bg
    draw = ImageDraw.Draw(img)

    # Draw "A" letter — use font for crisp rendering
    font_size = int(size * 0.68)
    try:
        # Try to use a bold system font
        font = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", font_size)
    except (OSError, IOError):
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
        except (OSError, IOError):
            font = ImageFont.load_default()

    # Get text bounding box for centering
    text = "A"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    # Center the text
    x = (size - text_w) // 2 - bbox[0]
    y = (size - text_h) // 2 - bbox[1]

    # Draw shadow first (subtle depth)
    shadow_offset = max(1, size // 128)
    draw.text((x + shadow_offset, y + shadow_offset), text, fill=(0, 0, 0, 80), font=font)

    # Draw main letter — white with slight blue tint
    draw.text((x, y), text, fill=(240, 240, 255, 255), font=font)

    return img


def main():
    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Resources')
    os.makedirs(output_dir, exist_ok=True)

    # Generate icon sizes
    sizes = [16, 32, 64, 128, 256, 512, 1024]

    for size in sizes:
        img = generate_icon(size)
        filename = f'AppIcon_{size}x{size}.png'
        filepath = os.path.join(output_dir, filename)
        img.save(filepath, 'PNG')
        print(f'  Generated: {filename}')

    # Main 1024x1024
    img = generate_icon(1024)
    main_icon = os.path.join(output_dir, 'AppIcon.png')
    img.save(main_icon, 'PNG')
    print(f'  Generated: AppIcon.png (1024x1024)')

    # Create .icns using iconutil
    icns_dir = os.path.join(output_dir, 'AppIcon.iconset')
    os.makedirs(icns_dir, exist_ok=True)

    icns_sizes = {
        'icon_16x16.png': 16,
        'icon_16x16@2x.png': 32,
        'icon_32x32.png': 32,
        'icon_32x32@2x.png': 64,
        'icon_128x128.png': 128,
        'icon_128x128@2x.png': 256,
        'icon_256x256.png': 256,
        'icon_256x256@2x.png': 512,
        'icon_512x512.png': 512,
        'icon_512x512@2x.png': 1024,
    }

    for filename, px_size in icns_sizes.items():
        img = generate_icon(px_size)
        filepath = os.path.join(icns_dir, filename)
        img.save(filepath, 'PNG')

    print(f'  Iconset created')

    # Convert to .icns
    icns_path = os.path.join(output_dir, 'AppIcon.icns')
    result = os.system(f'iconutil -c icns "{icns_dir}" -o "{icns_path}" 2>/dev/null')
    if result == 0:
        print(f'  ✅ AppIcon.icns created')
    else:
        print(f'  ⚠️  iconutil failed')

    # Clean up
    import shutil
    shutil.rmtree(icns_dir, ignore_errors=True)

    print('\n🗡️  Icon generation complete!')


if __name__ == '__main__':
    main()
