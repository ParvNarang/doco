import json
from PIL import Image, ImageDraw, ImageFont

# Define paths
IMAGE_PATH = "assets/1.png"
JSON_PATH = "assets/1.json"

# Layout result data from the user request
layout_data = [
    {
        "bbox": [323.016, 24.66, 900.188, 85.488],
        "label": "SectionHeader",
        "raw_label": "Section-Header",
        "confidence": 0.889226241163873,
        "position": 0,
        "count": 20,
        "polygon": [[323.016, 24.66], [900.188, 24.66], [900.188, 85.488], [323.016, 85.488]]
    },
    {
        "bbox": [221.604, 96.996, 1006.608, 143.028],
        "label": "Text",
        "raw_label": "Text",
        "confidence": 0.889226241163873,
        "position": 1,
        "count": 100,
        "polygon": [[221.604, 96.996], [1006.608, 96.996], [1006.608, 143.028], [221.604, 143.028]]
    },
    {
        "bbox": [118.94, 161.112, 1113.028, 220.296],
        "label": "Text",
        "raw_label": "Text",
        "confidence": 0.889226241163873,
        "position": 2,
        "count": 160,
        "polygon": [[118.94, 161.112], [1113.028, 161.112], [1113.028, 220.296], [118.94, 220.296]]
    },
    {
        "bbox": [31.3, 271.26, 172.776, 297.564],
        "label": "Text",
        "raw_label": "Text",
        "confidence": 0.889226241163873,
        "position": 3,
        "count": 10,
        "polygon": [[31.3, 271.26], [172.776, 271.26], [172.776, 297.564], [31.3, 297.564]]
    },
    {
        "bbox": [366.836, 271.26, 544.62, 297.564],
        "label": "Text",
        "raw_label": "Text",
        "confidence": 0.889226241163873,
        "position": 4,
        "count": 20,
        "polygon": [[366.836, 271.26], [544.62, 271.26], [544.62, 297.564], [366.836, 297.564]]
    },
    {
        "bbox": [27.544, 346.884, 450.72, 600.06],
        "label": "Text",
        "raw_label": "Text",
        "confidence": 0.889226241163873,
        "position": 5,
        "count": 150,
        "polygon": [[27.544, 346.884], [450.72, 346.884], [450.72, 600.06], [27.544, 600.06]]
    },
    {
        "bbox": [603.464, 337.02, 1214.44, 616.5],
        "label": "Table",
        "raw_label": "Table",
        "confidence": 0.889226241163873,
        "position": 6,
        "count": 110,
        "polygon": [[603.464, 337.02], [1214.44, 337.02], [1214.44, 616.5], [603.464, 616.5]]
    },
    {
        "bbox": [85.136, 715.14, 177.784, 739.8],
        "label": "Text",
        "raw_label": "Text",
        "confidence": 0.889226241163873,
        "position": 7,
        "count": 20,
        "polygon": [[85.136, 715.14], [177.784, 715.14], [177.784, 739.8], [85.136, 739.8]]
    },
    {
        "bbox": [82.632, 756.24, 318.008, 780.9],
        "label": "Text",
        "raw_label": "Text",
        "confidence": 0.889226241163873,
        "position": 8,
        "count": 30,
        "polygon": [[82.632, 756.24], [318.008, 756.24], [318.008, 780.9], [82.632, 780.9]]
    },
    {
        "bbox": [455.728, 756.24, 692.356, 780.9],
        "label": "Text",
        "raw_label": "Text",
        "confidence": 0.889226241163873,
        "position": 9,
        "count": 30,
        "polygon": [[455.728, 756.24], [692.356, 756.24], [692.356, 780.9], [455.728, 780.9]]
    },
    {
        "bbox": [82.632, 803.916, 375.6, 876.252],
        "label": "Text",
        "raw_label": "Text",
        "confidence": 0.889226241163873,
        "position": 10,
        "count": 80,
        "polygon": [[82.632, 803.916], [375.6, 803.916], [375.6, 876.252], [82.632, 876.252]]
    },
    {
        "bbox": [78.876, 895.98, 1216.944, 1126.14],
        "label": "Table",
        "raw_label": "Table",
        "confidence": 0.889226241163873,
        "position": 11,
        "count": 390,
        "polygon": [[78.876, 895.98], [1216.944, 895.98], [1216.944, 1126.14], [78.876, 1126.14]]
    },
    {
        "bbox": [1106.768, 1142.58, 1216.944, 1167.24],
        "label": "Text",
        "raw_label": "Text",
        "confidence": 0.889226241163873,
        "position": 12,
        "count": 20,
        "polygon": [[1106.768, 1142.58], [1216.944, 1142.58], [1216.944, 1167.24], [1106.768, 1167.24]]
    },
    {
        "bbox": [1055.436, 1182.036, 1216.944, 1208.34],
        "label": "Text",
        "raw_label": "Text",
        "confidence": 0.889226241163873,
        "position": 13,
        "count": 20,
        "polygon": [[1055.436, 1182.036], [1216.944, 1182.036], [1216.944, 1208.34], [1055.436, 1208.34]]
    },
    {
        "bbox": [1049.176, 1221.492, 1216.944, 1247.796],
        "label": "Text",
        "raw_label": "Text",
        "confidence": 0.889226241163873,
        "position": 14,
        "count": 20,
        "polygon": [[1049.176, 1221.492], [1216.944, 1221.492], [1216.944, 1247.796], [1049.176, 1247.796]]
    },
    {
        "bbox": [128.956, 1571.664, 529.596, 1599.612],
        "label": "PageFooter",
        "raw_label": "Page-Footer",
        "confidence": 0.889226241163873,
        "position": 15,
        "count": 40,
        "polygon": [[128.956, 1571.664], [529.596, 1571.664], [529.596, 1599.612], [128.956, 1599.612]]
    },
    {
        "bbox": [976.56, 1574.952, 1084.232, 1604.544],
        "label": "PageFooter",
        "raw_label": "Page-Footer",
        "confidence": 0.889226241163873,
        "position": 16,
        "count": 20,
        "polygon": [[976.56, 1574.952], [1084.232, 1574.952], [1084.232, 1604.544], [976.56, 1604.544]]
    }
]

# Write JSON data to file
with open(JSON_PATH, "w", encoding="utf-8") as f:
    json.dump(layout_data, f, indent=2)
print(f"Saved layout data to {JSON_PATH}")

# Open the image
img = Image.open(IMAGE_PATH).convert("RGB")
draw = ImageDraw.Draw(img)

# Premium color scheme for different labels
COLOR_MAP = {
    "SectionHeader": (255, 69, 0),    # Sunset Orange/Red
    "Text": (30, 144, 255),          # Dodger Blue
    "Table": (50, 205, 50),          # Lime Green
    "PageFooter": (186, 85, 211)      # Medium Orchid / Purple
}
DEFAULT_COLOR = (128, 128, 128)      # Gray

# Draw each bounding box and its label
for item in layout_data:
    bbox = item["bbox"]
    label = item["label"]
    color = COLOR_MAP.get(label, DEFAULT_COLOR)
    
    # Draw outline rectangle with a width of 3
    draw.rectangle(bbox, outline=color, width=3)
    
    # Draw a small text background tag
    text_str = f"{label} ({item['confidence']:.2f})"
    
    # Use default font or try to load a nice system font if available
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None
        
    # Get bounding box for the text
    # Draw label text slightly above the bounding box
    tx, ty = bbox[0], bbox[1] - 12 if bbox[1] > 15 else bbox[1]
    
    # Draw a solid background rectangle for text readability
    draw.rectangle([tx, ty, tx + 140, ty + 12], fill=color)
    draw.text((tx + 2, ty), text_str, fill=(255, 255, 255), font=font)

# Save the drawn image back to IMAGE_PATH
img.save(IMAGE_PATH)
print(f"Successfully plotted bounding boxes onto {IMAGE_PATH}")
