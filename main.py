import io
import os
import uuid
import json
import re
import datetime
import pypdfium2 as pdfium
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, UploadFile, Request
from fastapi.responses import HTMLResponse, Response, JSONResponse
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
    
    # Ensure data directory exists for both JSONs and Images
    os.makedirs("data", exist_ok=True)
    
    yield
    # Clean up if needed
    print("Shutting down Surya models and cleaning up subprocesses...")
    models.clear()
    
    # Surya spawns a llama-server via llama-cpp-python for inference.
    # We forcefully terminate any lingering llama-server processes on shutdown to prevent memory leaks.
    os.system("pkill -f llama-server")

app = FastAPI(lifespan=lifespan)

# Mount static files and data directory for serving images
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/data", StaticFiles(directory="data"), name="data")

@app.get("/", response_class=HTMLResponse)
async def read_index():
    with open("static/index.html", "r") as f:
        return f.read()

@app.post("/api/preview")
async def get_pdf_preview(file: UploadFile = File(...)):
    contents = await file.read()
    pdf = pdfium.PdfDocument(contents)
    page = pdf.get_page(0)
    # Render with scale 2 for decent preview resolution
    pil_image = page.render(scale=2).to_pil()
    
    buf = io.BytesIO()
    pil_image.save(buf, format="JPEG")
    buf.seek(0)
    return Response(content=buf.getvalue(), media_type="image/jpeg")

@app.post("/api/process")
async def process_document(file: UploadFile = File(...)):
    contents = await file.read()
    file_uid = str(uuid.uuid4())
    
    images = []
    
    if file.filename.lower().endswith('.pdf'):
        pdf = pdfium.PdfDocument(contents)
        for i in range(len(pdf)):
            page = pdf.get_page(i)
            # High scale for better OCR accuracy
            pil_image = page.render(scale=3).to_pil().convert("RGB")
            images.append(pil_image)
    else:
        images.append(Image.open(io.BytesIO(contents)).convert("RGB"))
        
    enhanced_images = []
    page_metadata = []
    
    doc_dir = os.path.join("data", file_uid)
    os.makedirs(doc_dir, exist_ok=True)
    
    for idx, img in enumerate(images):
        width, height = img.size
        # Pre-processing Layer
        enhancer = ImageEnhance.Contrast(img)
        img_enhanced = enhancer.enhance(1.2)
        enhancer = ImageEnhance.Sharpness(img_enhanced)
        img_enhanced = enhancer.enhance(1.5)
        
        enhanced_images.append(img_enhanced)
        
        # Save image for frontend display
        img_path = os.path.join(doc_dir, f"page_{idx}.jpg")
        img_enhanced.save(img_path, format="JPEG")
        
        page_metadata.append({
            "page_num": idx + 1,
            "width": width,
            "height": height,
            "image_url": f"/data/{file_uid}/page_{idx}.jpg"
        })

    # Run predictions in batch
    layout_preds = models["layout_predictor"](enhanced_images)
    text_preds = models["recognition_predictor"](enhanced_images, layout_preds)

    serializable_preds = make_serializable(text_preds)
    
    markdown_lines = []
    global_chunk_idx = 1
    
    pages_data = []
    
    for page_idx, page_results in enumerate(serializable_preds):
        if not page_results:
            page_results = {}
            
        blocks = page_results.get("text_lines", page_results.get("blocks", []))
        
        # Inject Chunk IDs and Generate concatenated markdown
        for block in blocks:
            block_uuid = str(uuid.uuid4())
            block["uuid"] = block_uuid
            block["chunk_index"] = global_chunk_idx
            global_chunk_idx += 1
            
            html = block.get("html", "")
            text = block.get("text", block.get("text_content", ""))
            
            # Format based on label
            label = block.get("label", "")
            clean_text = text if text else strip_html_tags(html)
            
            anchor = f"<a id='{block_uuid}'></a>"
            
            if label in ["Title", "PageHeader"]:
                markdown_lines.append(f"{anchor}\n# {clean_text}\n")
            elif label == "SectionHeader":
                markdown_lines.append(f"{anchor}\n## {clean_text}\n")
            elif label == "List":
                markdown_lines.append(f"{anchor}\n- {clean_text}")
            else:
                markdown_lines.append(f"{anchor}\n{clean_text}\n")
        
        markdown_lines.append("\n---\n") # Page divider in markdown
        
        # Combine metadata and results for this page
        page_data = {**page_metadata[page_idx], "results": page_results}
        pages_data.append(page_data)
            
    markdown_str = "\n".join(markdown_lines)
    
    # Save combined JSON
    save_path = os.path.join(doc_dir, "data.json")
    with open(save_path, "w", encoding="utf-8") as f:
        json.dump(pages_data, f, ensure_ascii=False, indent=2)

    # Save metadata
    metadata = {
        "uid": file_uid,
        "filename": file.filename,
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z"
    }
    with open(os.path.join(doc_dir, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    return {
        "uid": file_uid,
        "pages": pages_data,
        "markdown": markdown_str
    }

@app.get("/api/history")
async def get_history():
    history = []
    if not os.path.exists("data"):
        return JSONResponse(content=[])
        
    for item in os.listdir("data"):
        meta_path = os.path.join("data", item, "metadata.json")
        if os.path.isdir(os.path.join("data", item)) and os.path.exists(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    history.append(json.load(f))
            except:
                pass
                
    # Sort by timestamp descending
    history.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return JSONResponse(content=history)

@app.get("/api/document/{uid}")
async def get_document(uid: str):
    doc_dir = os.path.join("data", uid)
    data_path = os.path.join(doc_dir, "data.json")
    
    if not os.path.exists(data_path):
        return JSONResponse(status_code=404, content={"error": "Document not found"})
        
    try:
        with open(data_path, "r", encoding="utf-8") as f:
            pages_data = json.load(f)
            
        # Optional: Reconstruct markdown if needed, or just return pages
        # The frontend just needs `pages` to call renderAllPages
        return JSONResponse(content={
            "uid": uid,
            "pages": pages_data
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
