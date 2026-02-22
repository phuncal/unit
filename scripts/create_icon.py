#!/usr/bin/env python3
"""
将图标转换为 macOS 风格的圆角矩形图标
"""

from PIL import Image, ImageDraw
import os

def create_macos_icon(input_path, output_path, size=1024, padding_ratio=0.10):
    """创建 macOS 风格的圆角图标

    Args:
        padding_ratio: 内边距比例，0.10 = 10%
    """

    # 打开原图
    img = Image.open(input_path).convert('RGBA')

    # 计算内边距
    padding = int(size * padding_ratio)
    content_size = size - (padding * 2)

    # 调整原图大小
    img_resized = img.resize((content_size, content_size), Image.Resampling.LANCZOS)

    # 创建画布，将图片居中
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(img_resized, (padding, padding))

    # 计算圆角半径 (macOS Big Sur 约 22.37%)
    corner_radius = int(size * 0.2237)

    # 创建圆角蒙版
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=corner_radius, fill=255)

    # 应用蒙版
    result = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    result.paste(canvas, mask=mask)

    result.save(output_path, 'PNG')
    print(f'图标已保存: {output_path}')
    print(f'  尺寸: {size}px, 边距: {padding_ratio*100}%, 圆角: {corner_radius}px')

def create_iconset(input_path, output_dir, padding_ratio=0.10):
    """创建 iconset 目录"""

    os.makedirs(output_dir, exist_ok=True)

    sizes = [
        (16, 'icon_16x16.png'),
        (32, 'icon_16x16@2x.png'),
        (32, 'icon_32x32.png'),
        (64, 'icon_32x32@2x.png'),
        (128, 'icon_128x128.png'),
        (256, 'icon_128x128@2x.png'),
        (256, 'icon_256x256.png'),
        (512, 'icon_256x256@2x.png'),
        (512, 'icon_512x512.png'),
        (1024, 'icon_512x512@2x.png'),
    ]

    temp = os.path.join(output_dir, '_temp.png')
    create_macos_icon(input_path, temp, 1024, padding_ratio)

    base = Image.open(temp)

    for size, filename in sizes:
        img = base.resize((size, size), Image.Resampling.LANCZOS)
        img.save(os.path.join(output_dir, filename), 'PNG')
        print(f'  {filename}')

    os.remove(temp)

if __name__ == '__main__':
    input_file = '/Volumes/Extreme Pro/AI Lab/Unit/unit_logo.png'
    output_dir = '/Volumes/Extreme Pro/AI Lab/Unit/resources/icon.iconset'
    output_png = '/Volumes/Extreme Pro/AI Lab/Unit/resources/icon.png'

    # 10% 边距
    create_macos_icon(input_file, output_png, 1024, padding_ratio=0.10)
    create_iconset(input_file, output_dir, padding_ratio=0.10)
