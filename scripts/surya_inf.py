from PIL import Image, ImageDraw, ImageFont
import os
import psutil
import time

# Initialize CPU and process monitoring
psutil.cpu_percent(interval=None)
process = psutil.Process(os.getpid())
process.cpu_percent(interval=None)

def print_resource_usage(stage=""):
    # Current process resource usage
    mem_info = process.memory_info()
    rss_mb = mem_info.rss / (1024 * 1024)
    cpu_pct = process.cpu_percent(interval=None)
    
    # System resource usage
    sys_mem = psutil.virtual_memory()
    sys_cpu = psutil.cpu_percent(interval=None)
    
    label = f"[{stage}]" if stage else "[Usage]"
    print(f"\n--- {label} CPU & Memory Usage ---")
    print(f"  Process: Memory (RSS) = {rss_mb:.2f} MB | CPU Usage = {cpu_pct:.1f}%")
    print(f"  System : Memory (Used) = {sys_mem.percent}% ({sys_mem.used / (1024**3):.2f} GB / {sys_mem.total / (1024**3):.2f} GB) | CPU Usage = {sys_cpu:.1f}%")
    print("----------------------------------\n")

def make_serializable(obj):
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    elif hasattr(obj, "dict"):
        return obj.dict()
    elif isinstance(obj, list):
        return [make_serializable(item) for item in obj]
    elif isinstance(obj, dict):
        return {k: make_serializable(v) for k, v in obj.items()}
    else:
        return obj

# pyrefly: ignore [missing-import]
from surya.inference import SuryaInferenceManager
# pyrefly: ignore [missing-import]
from surya.layout import LayoutPredictor
# pyrefly: ignore [missing-import]
from surya.recognition import RecognitionPredictor

print_resource_usage("Start")

IMAGE_PATH = "../assets/pamaro_shop.png"

print("Initializing LayoutPredictor...")
print_resource_usage("Before Predictor Init")
manager = SuryaInferenceManager()
layout_predictor = LayoutPredictor(manager)
recognition_predictor = RecognitionPredictor(manager)

print("Predicting layout...")
print_resource_usage("Before Prediction")
layout_predictions = layout_predictor([Image.open(IMAGE_PATH)])
text_predictions = recognition_predictor([Image.open(IMAGE_PATH)], layout_predictions)

print_resource_usage("After Prediction")
#print(layout_predictions)
print(text_predictions)

# Save text_predictions as a JSON file
import json
serializable_preds = make_serializable(text_predictions)
json_output_path = IMAGE_PATH.replace(".png", "_text.json")
with open(json_output_path, "w", encoding="utf-8") as f:
    json.dump(serializable_preds, f, indent=2, ensure_ascii=False)
print(f"Saved text predictions to: {json_output_path}")

# Plotting the layout on the image
print("Plotting detected layout...")
for pred in layout_predictions:
    img = Image.open(IMAGE_PATH).convert("RGB")
    
    # Create a transparent overlay for alpha-blended boxes
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    
    # Premium color scheme for different labels
    COLOR_MAP = {
        "SectionHeader": (255, 69, 0),
        "Text": (30, 144, 255),
        "Table": (50, 205, 50),
        "PageFooter": (186, 85, 211),
        "Title": (255, 215, 0),
        "Header": (255, 140, 0),
        "Image": (0, 206, 209),
        "List": (255, 20, 147),
        "Caption": (138, 43, 226),
    }
    DEFAULT_COLOR = (128, 128, 128)
    
    for box_info in pred.bboxes:
        bbox = box_info.bbox
        label = box_info.label
        
        color = COLOR_MAP.get(label, DEFAULT_COLOR)
        
        # Draw light visible colored boxes using alpha transparency (fill alpha = 60, outline alpha = 120)
        fill_color = color + (60,)
        outline_color = color + (120,)
        draw.rectangle(bbox, fill=fill_color, outline=outline_color, width=1)
        
    # Composite the overlay onto the original image
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    
    output_path = IMAGE_PATH.replace(".png", "_plotted.png")
    img.save(output_path)
    print(f"Saved plotted layout image to: {output_path}")

print_resource_usage("Done")