const imageInput = document.getElementById('imageInput');
const fileName = document.getElementById('fileName');
const processBtn = document.getElementById('processBtn');
const loader = document.getElementById('loader');
const resultsSection = document.getElementById('resultsSection');
const previewImage = document.getElementById('previewImage');
const chunksContainer = document.getElementById('chunksContainer');
const imageWrapper = document.getElementById('imageWrapper');
const uidDisplay = document.getElementById('uidDisplay');
const jsonOutput = document.getElementById('jsonOutput');
const copyMdBtn = document.getElementById('copyMdBtn');
const copyConfirm = document.getElementById('copyConfirm');
const copyJsonBtn = document.getElementById('copyJsonBtn');
const copyJsonConfirm = document.getElementById('copyJsonConfirm');

let currentFile = null;
let currentResults = null;
let currentMarkdown = "";
let originalImageWidth = 0;
let originalImageHeight = 0;

// Premium color scheme for labels from surya_inf.py
const COLOR_MAP = {
    "SectionHeader": "rgba(255, 69, 0, 0.2)",
    "Text": "rgba(30, 144, 255, 0.2)",
    "Table": "rgba(50, 205, 50, 0.2)",
    "PageFooter": "rgba(186, 85, 211, 0.2)",
    "Title": "rgba(255, 215, 0, 0.2)",
    "Header": "rgba(255, 140, 0, 0.2)",
    "Image": "rgba(0, 206, 209, 0.2)",
    "List": "rgba(255, 20, 147, 0.2)",
    "Caption": "rgba(138, 43, 226, 0.2)"
};
const DEFAULT_COLOR = "rgba(128, 128, 128, 0.2)";

const loaderText = document.getElementById('loaderText');
const loaderStrings = [
    "Abstracting syntax...",
    "Aligning tensors...",
    "Computing bounding boxes...",
    "Extracting text features...",
    "Decoding language patterns...",
    "Running layout heuristics..."
];
let loaderInterval;

// Handle file selection
imageInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        currentFile = e.target.files[0];
        fileName.textContent = currentFile.name;
        fileName.title = currentFile.name;
        processBtn.disabled = false;
        
        // Show the viewer immediately
        resultsSection.classList.remove('hidden');
        
        // Clear previous runs
        chunksContainer.innerHTML = '';
        jsonOutput.textContent = '';
        uidDisplay.textContent = '';
        document.querySelectorAll('.bbox-overlay').forEach(el => el.remove());
        
        // Load image for preview
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
        };
        reader.readAsDataURL(currentFile);
    }
});

// Handle processing
processBtn.addEventListener('click', async () => {
    if (!currentFile) return;

    // UI State: Loading
    processBtn.disabled = true;
    loader.classList.remove('hidden');
    
    // Hide data contents temporarily
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    // Start Claude style loader animation
    let stringIdx = 0;
    loaderText.textContent = loaderStrings[0];
    loaderInterval = setInterval(() => {
        stringIdx = (stringIdx + 1) % loaderStrings.length;
        loaderText.textContent = loaderStrings[stringIdx];
    }, 800);

    const formData = new FormData();
    formData.append('file', currentFile);

    try {
        const response = await fetch('/api/process', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Server responded with status ${response.status}`);
        }

        const data = await response.json();
        
        originalImageWidth = data.width;
        originalImageHeight = data.height;
        currentResults = data.results;
        currentMarkdown = data.markdown || "No markdown extracted.";
        
        // Display UID
        const fileExt = currentFile.name.split('.').pop().toUpperCase();
        uidDisplay.textContent = `TYPE: ${fileExt} | DOC: ${data.uid}`;

        // Populate Tabs
        renderInteractiveJson();
        renderChunks();

        // UI State: Done
        clearInterval(loaderInterval);
        loader.classList.add('hidden');
        processBtn.disabled = false;
        
        // Reactivate current tab
        const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-target');
        document.getElementById(activeTab).classList.add('active');

    } catch (error) {
        console.error('Error processing image:', error);
        alert('Failed to process image. Make sure the server is running and check the console.');
        clearInterval(loaderInterval);
        loader.classList.add('hidden');
        processBtn.disabled = false;
    }
});

// --- Tab Switching Logic ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Remove active class from all buttons and content
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        // Add active class to clicked button and target content
        const targetId = e.currentTarget.getAttribute('data-target');
        e.currentTarget.classList.add('active');
        document.getElementById(targetId).classList.add('active');
    });
});

// --- Copy Logic ---
copyMdBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentMarkdown).then(() => {
        copyConfirm.classList.remove('hidden');
        setTimeout(() => {
            copyConfirm.classList.add('hidden');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
});

copyJsonBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(JSON.stringify(currentResults, null, 2)).then(() => {
        copyJsonConfirm.classList.remove('hidden');
        setTimeout(() => {
            copyJsonConfirm.classList.add('hidden');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy JSON: ', err);
    });
});

// --- Rendering Logic ---
function renderChunks() {
    if (!currentResults) {
        chunksContainer.innerHTML = '<p>No text chunks found.</p>';
        return;
    }

    // Sort by reading order if available
    let blocks = currentResults.text_lines || currentResults.blocks || [];

    if (blocks.length === 0) {
        chunksContainer.innerHTML = '<p>No text chunks found.</p>';
        return;
    }

    // Clear old overlays
    document.querySelectorAll('.bbox-overlay').forEach(el => el.remove());
    chunksContainer.innerHTML = '';

    blocks.forEach((block, index) => {
        const card = document.createElement('div');
        card.className = 'chunk-card';
        card.id = `chunk-card-${index}`;
        
        // Use text if html is not present (depending on surya RecognitionPredictor returns)
        const labelText = block.label || block.polygon ? "Chunk" : "Text Line";
        const htmlContent = block.html || `<p>${block.text || block.text_content || '<i>Empty text</i>'}</p>`;
        
        card.innerHTML = `
            <div class="chunk-label">
                <span>${labelText} ${block.chunk_index || (index + 1)}</span>
                <span class="chunk-id">${(block.uuid || 'unknown')}</span>
            </div>
            <div class="chunk-html">${htmlContent}</div>
        `;

        chunksContainer.appendChild(card);

        // Create bounding box overlay on the image
        if (block.bbox) {
            createBBoxOverlay(block, index, card);
        }
    });
}

function escapeHtml(unsafe) {
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function renderInteractiveJson() {
    if (!currentResults) return;
    
    const blocksKey = currentResults.text_lines ? 'text_lines' : (currentResults.blocks ? 'blocks' : null);
    
    if (!blocksKey) {
        jsonOutput.innerHTML = escapeHtml(JSON.stringify(currentResults, null, 2));
        return;
    }
    
    const clone = { ...currentResults };
    const blocks = clone[blocksKey];
    delete clone[blocksKey];
    
    let baseStr = JSON.stringify(clone, null, 2);
    
    let blocksStr = `  <span class="json-key">"${blocksKey}"</span>: [\n`;
    blocks.forEach((block, index) => {
        let blockJson = JSON.stringify(block, null, 2);
        blockJson = syntaxHighlightJson(blockJson);
        // Indent the block JSON and wrap it
        blockJson = blockJson.split('\n').map(l => '    ' + l).join('\n');
        blocksStr += `<span class="json-chunk" id="json-chunk-${index}">${blockJson}</span>`;
        if (index < blocks.length - 1) blocksStr += ",\n";
        else blocksStr += "\n";
    });
    blocksStr += "  ]";
    
    if (Object.keys(clone).length === 0) {
        jsonOutput.innerHTML = `{\n${blocksStr}\n}`;
    } else {
        // syntax highlight baseStr first
        let highlightedBase = syntaxHighlightJson(baseStr);
        jsonOutput.innerHTML = highlightedBase.replace(/\n\}$/, `,\n${blocksStr}\n}`);
    }
}

function syntaxHighlightJson(jsonStr) {
    let escaped = escapeHtml(jsonStr);
    return escaped.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        let cls = 'json-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'json-key';
            } else {
                cls = 'json-string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'json-boolean';
        } else if (/null/.test(match)) {
            cls = 'json-null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
}

function createBBoxOverlay(block, index, cardElement) {
    const [x1, y1, x2, y2] = block.bbox;
    
    const leftPct = (x1 / originalImageWidth) * 100;
    const topPct = (y1 / originalImageHeight) * 100;
    const widthPct = ((x2 - x1) / originalImageWidth) * 100;
    const heightPct = ((y2 - y1) / originalImageHeight) * 100;

    const overlay = document.createElement('div');
    overlay.className = 'bbox-overlay';
    overlay.id = `bbox-overlay-${index}`;
    
    const label = block.label || "Text";
    const baseColor = COLOR_MAP[label] || DEFAULT_COLOR;
    const hoverColor = baseColor.replace('0.2)', '0.6)');
    
    // Set custom css variables for dynamic styling based on type
    overlay.style.setProperty('--base-bg', baseColor);
    overlay.style.setProperty('--hover-bg', hoverColor);
    overlay.style.setProperty('--border-color', hoverColor.replace('0.6)', '1.0)'));
    
    overlay.style.left = `${leftPct}%`;
    overlay.style.top = `${topPct}%`;
    overlay.style.width = `${widthPct}%`;
    overlay.style.height = `${heightPct}%`;

    // Interactive Hover between the Overlay, Card, and JSON
    const activate = () => {
        const jsonElement = document.getElementById(`json-chunk-${index}`);
        
        overlay.classList.add('active');
        cardElement.classList.add('active');
        if (jsonElement) jsonElement.classList.add('active');
        
        // Only scroll the active view
        const htmlView = document.getElementById('htmlView');
        const jsonView = document.getElementById('jsonView');
        if (htmlView.classList.contains('active')) {
            cardElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else if (jsonView.classList.contains('active') && jsonElement) {
            jsonElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    };

    const deactivate = () => {
        const jsonElement = document.getElementById(`json-chunk-${index}`);
        
        overlay.classList.remove('active');
        cardElement.classList.remove('active');
        if (jsonElement) jsonElement.classList.remove('active');
    };

    overlay.addEventListener('mouseenter', activate);
    overlay.addEventListener('mouseleave', deactivate);
    cardElement.addEventListener('mouseenter', activate);
    cardElement.addEventListener('mouseleave', deactivate);
    
    // Also attach to json element so hovering json highlights the bbox
    const jsonElement = document.getElementById(`json-chunk-${index}`);
    if (jsonElement) {
        jsonElement.addEventListener('mouseenter', activate);
        jsonElement.addEventListener('mouseleave', deactivate);
    }

    imageWrapper.appendChild(overlay);
}
