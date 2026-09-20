"""Offline synthetic-first pilot corpus. No private image is read by this generator."""
import argparse
import hashlib
import io
import json
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


def render(token, font_path, rng):
    clean = rng.random() < .25
    size = rng.randint(24, 44)
    font = ImageFont.truetype(str(font_path), size)
    spacing = rng.uniform(-.4, 2)
    width = int(sum(font.getlength(c) for c in token) + spacing * len(token) + 36)
    height = size + 32
    background = 255 if clean else rng.randint(223, 253)
    ink = 20 if clean else rng.randint(45, background - 22)
    im = Image.new('L', (width, height), background)
    draw = ImageDraw.Draw(im)
    x = 16
    hyphen_space = rng.uniform(0, 3)
    for char in token:
        if char == '-':
            x += hyphen_space
        draw.text((x, 10), char, font=font, fill=ink, stroke_width=int(rng.random() < .08))
        x += font.getlength(char) + spacing + (hyphen_space if char == '-' else 0)
    families = ['clean'] if clean else ['paper-tone', 'faint-toner', 'spacing', 'anisotropic-scale']
    if not clean:
        if rng.random() < .35:
            for _ in range(rng.randint(3, 15)):
                xx, yy = rng.randrange(12, width-12), rng.randrange(10, height-10)
                draw.line((xx, yy, xx+rng.randint(1, 3), yy), fill=background, width=1)
            families.append('dropout')
        im = im.resize((round(width*rng.uniform(.7, 1.18)), round(height*rng.uniform(.8, 1.12))), Image.Resampling.BICUBIC)
        im = im.transform(im.size, Image.Transform.PERSPECTIVE,
                          (1, rng.uniform(-.07, .07), 0, rng.uniform(-.025, .025), 1, 0,
                           rng.uniform(-.00015, .00015), rng.uniform(-.0001, .0001)),
                          Image.Resampling.BICUBIC, fillcolor=background)
        im = im.rotate(rng.uniform(-1.8, 1.8), Image.Resampling.BICUBIC, fillcolor=background)
        families += ['perspective', 'skew']
        if rng.random() < .4:
            small = (max(30, im.width//2), max(16, im.height//2))
            im = im.resize(small, Image.Resampling.BILINEAR).resize(im.size, Image.Resampling.BICUBIC)
            families.append('low-resolution-resample')
        im = im.filter(ImageFilter.GaussianBlur(rng.uniform(.1, 1.05)))
        families.append('defocus-scanner-softness')
        if rng.random() < .25:
            im = im.filter(ImageFilter.Kernel((3, 3), (0, 0, 0, 1, 2, 1, 0, 0, 0), 4))
            families.append('motion-softness')
        a = np.asarray(im, dtype=np.float32)
        yy, xx = np.mgrid[:im.height, :im.width]
        shadow = rng.uniform(0, 18)*xx/im.width + rng.uniform(0, 9)*np.sin(xx/23 + yy/40)
        im = Image.fromarray(np.clip(a-shadow, 0, 255).astype('uint8'))
        families += ['uneven-illumination', 'wrinkle-shadow']
        buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=rng.randint(45, 92))
        im = Image.open(io.BytesIO(buf.getvalue())).convert('L')
        families.append('jpeg')
    return im, families


def build(output, train_count=8000, validation_count=1000):
    output = Path(output).resolve()
    repo = Path(__file__).resolve().parents[3]
    if output.is_relative_to(repo):
        raise ValueError('Corpus must be outside repository')
    output.mkdir(parents=True, exist_ok=False)
    # Public test expectations excluded as strings too; no B pixels are opened.
    reserved = {513, 514, 515, 518, 519}
    numbers = [n for n in range(10000) if n not in reserved]
    random.Random(320260920).shuffle(numbers)
    assert train_count + validation_count <= len(numbers)
    train_fonts = sorted(Path('/usr/share/fonts/truetype/liberation').glob('*.ttf'))
    train_fonts += sorted(Path('/usr/share/fonts/truetype/dejavu').glob('*.ttf'))
    val_fonts = sorted(Path('/usr/share/fonts/truetype/freefont').glob('*.ttf'))
    assert train_fonts and val_fonts, 'Install Liberation, DejaVu and FreeFont'
    rows = []
    for split, count, offset, fonts, seed in [('train', train_count, 0, train_fonts, 320260921),
                                            ('validation', validation_count, train_count, val_fonts, 320260922)]:
        (output/split).mkdir()
        rng = random.Random(seed)
        for i in range(count):
            # Historical A/C/D visibly print INV####; retain both renderings.
            canonical = f'INV-{numbers[offset+i]:04d}'
            token = canonical if rng.random() < .5 else canonical.replace('-', '')
            font = rng.choice(fonts)
            im, families = render(token, font, rng)
            stem = output/split/f'{split}-{i:05d}'
            im.save(stem.with_suffix('.png'))
            stem.with_suffix('.gt.txt').write_text(token+'\n')
            # Same whole-line boxes as tesstrain/generate_line_box.py.
            stem.with_suffix('.box').write_text(''.join(f'{c} 0 0 {im.width} {im.height} 0\n' for c in token+'\t'))
            rows.append({'id':stem.name, 'split':split, 'label':token, 'canonical':canonical, 'font':font.name,
                         'kind':'synthetic', 'file':str(stem.with_suffix('.png').relative_to(output)),
                         'sha256':hashlib.sha256(stem.with_suffix('.png').read_bytes()).hexdigest(),
                         'degradations':families, 'seed':seed})
    manifest = {'version':'pilot-v1', 'train':train_count, 'validation':validation_count,
                'fixtureBExcluded':True, 'samples':rows}
    payload = json.dumps(manifest, indent=2)
    (output/'manifest.json').write_text(payload)
    (output/'manifest.sha256').write_text(hashlib.sha256(payload.encode()).hexdigest()+'\n')
    print(json.dumps({'train':train_count, 'validation':validation_count, 'output':str(output)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('output')
    args = parser.parse_args()
    build(args.output)
