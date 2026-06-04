import io
import os
import uuid
import json
import re
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, UploadFile, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from PIL import Image, ImageEnhance

# surya imports
# pyrefly: ignore [missing-import]
from surya.inference import SuryaInferenceManager
# pyrefly: ignore [missing-import]
from surya.layout import LayoutPredictor
# pyrefly: ignore [missing-import]
from surya.recognition import RecognitionPredictor

# Global objects to hold the loaded models
models = {}

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

def strip_html_tags(text):
    clean = re.compile('<.*?>')
    return re.sub(clean, '', text)

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Loading Surya models...")
    models["manager"] = SuryaInferenceManager()
    models["layout_predictor"] = LayoutPredictor(models["manager"])
    models["recognition_predictor"] = RecognitionPredictor(models["manager"])
    print("Models loaded successfully.")
    
    # Ensure data directory exists
    os.makedirs("data", exist_ok=True)
    
    yield
    # Clean up if needed
    print("Shutting down Surya models and cleaning up subprocesses...")
    models.clear()
    
    # Surya spawns a llama-server via llama-cpp-python for inference.
    # We forcefully terminate any lingering llama-server processes on shutdown to prevent memory leaks.
    os.system("pkill -f llama-server")

app = FastAPI(lifespan=lifespan)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def read_index():
    with open("static/index.html", "r") as f:
        return f.read()

@app.post("/api/process")
async def process_image(file: UploadFile = File(...)):
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")
    
    # Store original dimensions
    width, height = image.size
    
    # Pre-processing Layer
    # Enhance contrast to improve OCR accuracy on faint or noisy text
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(1.2) # 20% contrast boost
    
    enhancer = ImageEnhance.Sharpness(image)
    image = enhancer.enhance(1.5) # 50% sharpness boost

    # Run predictions
    layout_preds = models["layout_predictor"]([image])
    text_preds = models["recognition_predictor"]([image], layout_preds)

    # text_preds is a list of PageOCRResult objects (one for the single image)
    serializable_preds = make_serializable(text_preds)
    
    results = serializable_preds[0] if serializable_preds else {}
    blocks = results.get("text_lines", results.get("blocks", []))
    
    # Inject Chunk IDs and Generate concatenated markdown
    markdown_lines = []
    for idx, block in enumerate(blocks):
        # Assign IDs directly into the block dict
        block_uuid = str(uuid.uuid4())
        chunk_idx = idx + 1
        block["uuid"] = block_uuid
        block["chunk_index"] = chunk_idx
        
        html = block.get("html", "")
        text = block.get("text", block.get("text_content", ""))
        
        # Format based on label
        label = block.get("label", "")
        clean_text = text if text else strip_html_tags(html)
        
        if label in ["Title", "PageHeader"]:
            markdown_lines.append(f"# {clean_text}\n")
        elif label == "SectionHeader":
            markdown_lines.append(f"## {clean_text}\n")
        elif label == "List":
            markdown_lines.append(f"- {clean_text}")
        else:
            markdown_lines.append(f"{clean_text}\n")
            
    markdown_str = "\n".join(markdown_lines)
    
    # Save to JSON
    file_uid = str(uuid.uuid4())
    save_path = os.path.join("data", f"{file_uid}.json")
    with open(save_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    return {
        "uid": file_uid,
        "width": width,
        "height": height,
        "results": results,
        "markdown": markdown_str
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
