document.addEventListener('DOMContentLoaded', () => {
    const imageInput = document.getElementById('imageInput');
    const fileNameDisplay = document.getElementById('fileName');
    const processBtn = document.getElementById('processBtn');
    
    const resultsSection = document.getElementById('resultsSection');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const previewImage = document.getElementById('previewImage');
    const imageWrapper = document.getElementById('imageWrapper');
    const uidDisplay = document.getElementById('uidDisplay');
    
    let currentUid = null;
    let currentExtractedJson = null;
    
    const loader = document.getElementById('loader');
    const loaderText = document.getElementById('loaderText');
    
    const historyBtn = document.getElementById('historyBtn');
    const closeHistoryBtn = document.getElementById('closeHistoryBtn');
    const historyDrawer = document.getElementById('historyDrawer');
    const historyList = document.getElementById('historyList');
    
    const chunksContainer = document.getElementById('chunksContainer');
    const jsonOutput = document.getElementById('jsonOutput');
    
    const copyMdBtn = document.getElementById('copyMdBtn');
    const downloadMdBtn = document.getElementById('downloadMdBtn');
    const copyConfirm = document.getElementById('copyConfirm');
    
    const copyJsonBtn = document.getElementById('copyJsonBtn');
    const downloadJsonBtn = document.getElementById('downloadJsonBtn');
    const copyJsonConfirm = document.getElementById('copyJsonConfirm');
    
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    let currentFile = null;
    let currentPages = [];
    let currentMarkdown = "";
    
    const loaderStrings = [
        "Abstracting syntax...",
        "Evaluating layout constraints...",
        "Identifying visual components...",
        "Aligning bounding boxes...",
        "Deciphering text blocks...",
        "Mapping coordinate space...",
        "Normalizing contrast levels...",
        "Structuring semantic elements...",
        "Building DOM structure..."
    ];
    let loaderInterval;
    // File Selection
    imageInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0]) {
            currentFile = e.target.files[0];
            fileNameDisplay.textContent = currentFile.name;
            processBtn.disabled = false;
            
            // Show the viewer immediately
            // Hide welcome screen, show results
            if (welcomeScreen) welcomeScreen.classList.add('hidden');
            resultsSection.classList.remove('hidden');
            
            // Clean up old UI
            document.querySelectorAll('.bbox-overlay').forEach(el => el.remove());
            currentUid = null;
            uidDisplay.textContent = "";
            chunksContainer.innerHTML = "";
            jsonOutput.innerHTML = "";
            document.getElementById('viewerContent').innerHTML = "";
            document.getElementById('thumbnailSidebar').innerHTML = "";
            currentPages = [];
            
            if (currentFile.type === 'application/pdf') {
                const wrapper = document.createElement('div');
                wrapper.className = 'image-wrapper';
                const img = document.createElement('img');
                img.className = 'preview-img';
                wrapper.appendChild(img);
                document.getElementById('viewerContent').appendChild(wrapper);
                
                const formData = new FormData();
                formData.append('file', currentFile);
                try {
                    const response = await fetch('/api/preview', { method: 'POST', body: formData });
                    if (response.ok) {
                        const blob = await response.blob();
                        img.src = URL.createObjectURL(blob);
                    }
                } catch (err) {
                    console.error("Failed to fetch PDF preview", err);
                }
            } else {
                const wrapper = document.createElement('div');
                wrapper.className = 'image-wrapper';
                const img = document.createElement('img');
                img.className = 'preview-img';
                wrapper.appendChild(img);
                document.getElementById('viewerContent').appendChild(wrapper);
                
                const reader = new FileReader();
                reader.onload = (e) => {
                    img.src = e.target.result;
                };
                reader.readAsDataURL(currentFile);
            }
        }
    });

    // Run Analysis
    processBtn.addEventListener('click', async () => {
        if (!currentFile) return;

        // UI State: Loading
        processBtn.disabled = true;
        loader.classList.remove('hidden');
        
        let strIdx = 0;
        loaderText.textContent = loaderStrings[0];
        loaderInterval = setInterval(() => {
            strIdx = (strIdx + 1) % loaderStrings.length;
            loaderText.textContent = loaderStrings[strIdx];
        }, 1500);
        
        // Hide data contents temporarily
        tabContents.forEach(c => c.classList.remove('active'));
        
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
            
            currentPages = data.pages || [];
            currentMarkdown = data.markdown || "No markdown extracted.";
            
            // Display UID & Type
            const fileExt = currentFile.name.split('.').pop().toUpperCase();
            currentUid = data.uid;
            uidDisplay.textContent = `type: ${fileExt} | id: ${data.uid}`;

            // Populate Tabs
            renderAllPages();

            // UI State: Done
            clearInterval(loaderInterval);
            loader.classList.add('hidden');
            processBtn.disabled = false;
            
            // Re-show active tab
            document.querySelector('.tab-btn.active').click();

        } catch (error) {
            console.error("Error processing document:", error);
            alert("Failed to process document. See console for details.");
            clearInterval(loaderInterval);
            loader.classList.add('hidden');
            processBtn.disabled = false;
        }
    });
    
    function renderAllPages() {
        if (!currentPages || currentPages.length === 0) return;
        
        const viewerContent = document.getElementById('viewerContent');
        const thumbnailSidebar = document.getElementById('thumbnailSidebar');
        viewerContent.innerHTML = ''; // Clear previous images
        thumbnailSidebar.innerHTML = ''; // Clear thumbnails
        chunksContainer.innerHTML = ''; // Clear previous chunks
        
        // Render JSON for all pages
        renderInteractiveJson(currentPages);
        
        let globalChunkIndex = 0;
        
        currentPages.forEach((pageData, pageIndex) => {
            // Create Thumbnail
            const thumbWrapper = document.createElement('div');
            thumbWrapper.className = 'thumbnail-item';
            if (pageIndex === 0) thumbWrapper.classList.add('active'); // highlight first by default
            thumbWrapper.innerHTML = `
                <img src="${pageData.image_url}" class="thumbnail-img">
                <div class="thumbnail-label">${pageIndex + 1}</div>
            `;
            thumbWrapper.addEventListener('click', () => {
                document.getElementById(`image-wrapper-${pageIndex}`).scrollIntoView({ behavior: 'smooth' });
                document.querySelectorAll('.thumbnail-item').forEach(el => el.classList.remove('active'));
                thumbWrapper.classList.add('active');
            });
            thumbnailSidebar.appendChild(thumbWrapper);
            
            // Create Image Wrapper
            const wrapper = document.createElement('div');
            wrapper.className = 'image-wrapper';
            wrapper.id = `image-wrapper-${pageIndex}`;
            
            const img = document.createElement('img');
            img.className = 'preview-img';
            img.src = pageData.image_url;
            wrapper.appendChild(img);
            
            viewerContent.appendChild(wrapper);
            
            // Render HTML Chunks & BBoxes for this page
            const results = pageData.results;
            if (results) {
                let blocks = results.text_lines || results.blocks || [];
                blocks.forEach((block) => {
                    const card = document.createElement('div');
                    card.className = 'chunk-card';
                    card.id = `chunk-card-${globalChunkIndex}`;
                    
                    const labelText = block.label || block.polygon ? "Chunk" : "Text Line";
                    const htmlContent = block.html || `<p>${block.text || block.text_content || '<i>Empty text</i>'}</p>`;
                    
                    const displayLabel = `${block.chunk_index || (globalChunkIndex + 1)} - ${block.label || labelText}`;
                    
                    card.innerHTML = `
                        <div class="chunk-label">
                            <span class="badge-type">${displayLabel}</span>
                        </div>
                        <div class="chunk-html">${htmlContent}</div>
                    `;

                    chunksContainer.appendChild(card);

                    if (block.bbox) {
                        createBBoxOverlay(block, globalChunkIndex, card, pageData.width, pageData.height, wrapper);
                    }
                    globalChunkIndex++;
                });
            }
        });
    }

    // Tab Switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
        });
    });

    // History Logic
    historyBtn.addEventListener('click', async () => {
        historyDrawer.classList.remove('hidden');
        historyList.innerHTML = '<div style="padding:16px;color:gray;text-align:center;">Loading...</div>';
        
        try {
            const res = await fetch('/api/history');
            const history = await res.json();
            historyList.innerHTML = '';
            
            if (history.length === 0) {
                historyList.innerHTML = '<div style="padding:16px;color:gray;text-align:center;">No recent files</div>';
                return;
            }
            
            history.forEach(item => {
                const el = document.createElement('div');
                el.className = 'history-item';
                const date = new Date(item.timestamp).toLocaleString();
                el.innerHTML = `
                    <div class="history-filename">${item.filename}</div>
                    <div class="history-date">${date}</div>
                `;
                el.addEventListener('click', () => loadHistoryDocument(item));
                historyList.appendChild(el);
            });
        } catch (e) {
            historyList.innerHTML = '<div style="padding:16px;color:red;text-align:center;">Failed to load history</div>';
        }
    });
    
    closeHistoryBtn.addEventListener('click', () => {
        historyDrawer.classList.add('hidden');
    });

    async function loadHistoryDocument(item) {
        historyDrawer.classList.add('hidden');
        fileNameDisplay.textContent = item.filename || "History Document";
        currentUid = item.uid;
        uidDisplay.textContent = item.uid;
        
        if (welcomeScreen) welcomeScreen.classList.add('hidden');
        resultsSection.classList.remove('hidden');
        document.querySelectorAll('.bbox-overlay').forEach(el => el.remove());
        chunksContainer.innerHTML = "";
        jsonOutput.innerHTML = "";
        document.getElementById('viewerContent').innerHTML = "";
        document.getElementById('thumbnailSidebar').innerHTML = "";
        currentPages = [];
        currentMarkdown = ""; // not saved in this quick version
        
        loader.classList.remove('hidden');
        loaderText.textContent = "Loading from history...";
        
        try {
            const res = await fetch(`/api/document/${item.uid}`);
            if (!res.ok) throw new Error("Doc not found");
            const data = await res.json();
            
            currentPages = data.pages;
            renderAllPages();
            currentMarkdown = currentPages.map(p => p.markdown || "").join("\n\n---\n\n");
            
            loader.classList.add('hidden');
        } catch (e) {
            loader.classList.add('hidden');
            alert("Failed to load document.");
        }
    }

    // File Selections
    copyMdBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(currentMarkdown).then(() => {
            copyConfirm.classList.remove('hidden');
            setTimeout(() => {
                copyConfirm.classList.add('hidden');
            }, 2000);
        });
    });
    
    downloadMdBtn.addEventListener('click', () => {
        if (!currentMarkdown) return;
        const blob = new Blob([currentMarkdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const baseName = currentFile ? currentFile.name.split('.')[0] : 'document';
        a.download = `${baseName}_extracted.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
    
    copyJsonBtn.addEventListener('click', () => {
        const rawTextContent = escapeHtml(JSON.stringify(currentPages, null, 2)).replace(/<[^>]*>?/gm, '');
        // Unescape to copy valid JSON
        const tempElement = document.createElement('textarea');
        tempElement.innerHTML = rawTextContent;
        navigator.clipboard.writeText(tempElement.value).then(() => {
            copyJsonConfirm.classList.remove('hidden');
            setTimeout(() => {
                copyJsonConfirm.classList.add('hidden');
            }, 2000);
        });
    });
    
    downloadJsonBtn.addEventListener('click', () => {
        if (!currentPages || currentPages.length === 0) return;
        const rawJsonString = JSON.stringify(currentPages, null, 2);
        const blob = new Blob([rawJsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const baseName = currentFile ? currentFile.name.split('.')[0] : 'document';
        a.download = `${baseName}_data.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    function escapeHtml(unsafe) {
        return String(unsafe)
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    function renderInteractiveJson(pagesArray) {
        if (!pagesArray || pagesArray.length === 0) {
            jsonOutput.innerHTML = "{}";
            return;
        }
        
        let allBlocks = [];
        let combinedClone = [];
        
        pagesArray.forEach(page => {
            let res = page.results || {};
            let blocks = res.text_lines || res.blocks || [];
            allBlocks = allBlocks.concat(blocks);
            
            let clone = { ...res };
            delete clone.text_lines;
            delete clone.blocks;
            combinedClone.push(clone);
        });
        
        let blocksKey = "blocks";
        
        let baseStr = JSON.stringify(combinedClone, null, 2);
        
        let blocksStr = `  <span class="json-key">"${blocksKey}"</span>: [\n`;
        allBlocks.forEach((block, index) => {
            let blockJson = JSON.stringify(block, null, 2);
            blockJson = syntaxHighlightJson(blockJson);
            blockJson = blockJson.split('\n').map(l => '    ' + l).join('\n');
            blocksStr += `<span class="json-chunk" id="json-chunk-${index}">${blockJson}</span>`;
            if (index < allBlocks.length - 1) blocksStr += ",\n";
            else blocksStr += "\n";
        });
        blocksStr += "  ]";
        
        let highlightedBase = syntaxHighlightJson(baseStr);
        let finalHtml = highlightedBase.replace(/\n\]$/, `,\n${blocksStr}\n]`);
        
        finalHtml = makeCollapsible(finalHtml);
        finalHtml = finalHtml.replace(/^/gm, '<span class="json-line-num"></span>');
        
        jsonOutput.innerHTML = finalHtml;
        attachFoldingEvents(jsonOutput);
    }
    
    function makeCollapsible(htmlStr) {
        const lines = htmlStr.split('\n');
        let out = [];
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            
            if (line.match(/(\{|\[)(\s*|<[^>]+>|,)*$/) && !line.match(/"(\s*|<[^>]+>|,)*$/)) {
                line = line.replace(/(.*)(\{|\[)/, `$1<span class="json-toggle">-</span>$2<span class="json-collapsible">`);
            }
            
            if (line.match(/^\s*(<[^>]+>)*\s*(\}|\])/)) {
                line = line.replace(/(\}|\])/, `</span><span class="json-ellipsis json-collapsed">...</span>$1`);
            }
            
            out.push(line);
        }
        return out.join('\n');
    }

    function attachFoldingEvents(container) {
        const toggles = container.querySelectorAll('.json-toggle');
        toggles.forEach(toggle => {
            toggle.addEventListener('click', function(e) {
                e.stopPropagation();
                const content = this.nextElementSibling; // After { is .json-collapsible
                const ellipsis = content.nextElementSibling; // The ellipsis comes after </span> of collapsible
                
                if (content && content.classList.contains('json-collapsible')) {
                    if (content.classList.contains('json-collapsed')) {
                        content.classList.remove('json-collapsed');
                        if (ellipsis) ellipsis.classList.add('json-collapsed');
                        this.textContent = '-';
                    } else {
                        content.classList.add('json-collapsed');
                        if (ellipsis) ellipsis.classList.remove('json-collapsed');
                        this.textContent = '+';
                    }
                }
            });
        });
        
        const ellipses = container.querySelectorAll('.json-ellipsis');
        ellipses.forEach(ellipsis => {
            ellipsis.addEventListener('click', function(e) {
                e.stopPropagation();
                // clicking ellipsis expands it
                const content = this.previousElementSibling;
                if (content && content.classList.contains('json-collapsible')) {
                    content.classList.remove('json-collapsed');
                    this.classList.add('json-collapsed');
                    // Find the toggle before the { 
                    const toggle = content.previousElementSibling.previousElementSibling;
                    if (toggle && toggle.classList.contains('json-toggle')) {
                        toggle.textContent = '-';
                    }
                }
            });
        });
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

    function createBBoxOverlay(block, index, cardElement, pageWidth, pageHeight, wrapperElement) {
        const overlay = document.createElement('div');
        overlay.className = 'bbox-overlay';
        overlay.id = `bbox-${index}`;
        
        // Coordinates usually [x1, y1, x2, y2]
        const [x1, y1, x2, y2] = block.bbox;
        
        const leftPct = (x1 / pageWidth) * 100 + 0.20;
        const topPct = ((y1 / pageHeight) * 100) + 0.23; // Shift slightly down by 0.5% for better alignment with text
        const widthPct = ((x2 - x1) / pageWidth) * 100 + 0.18;
        const heightPct = ((y2 - y1) / pageHeight) * 100 + 0.15;
        
        overlay.style.left = `${leftPct}%`;
        overlay.style.top = `${topPct}%`;
        overlay.style.width = `${widthPct}%`;
        overlay.style.height = `${heightPct}%`;
        
        // Apply color class based on label
        const labelClass = block.label ? `bbox-${block.label.toLowerCase().replace(' ', '-')}` : 'bbox-default';
        overlay.classList.add(labelClass);

        wrapperElement.appendChild(overlay);

        // Hover events for 3-way synchronization
        const jsonChunkEl = document.getElementById(`json-chunk-${index}`);
        
        overlay.addEventListener('mouseenter', () => {
            overlay.classList.add('active');
            cardElement.classList.add('active');
            if (jsonChunkEl) jsonChunkEl.classList.add('active');
            
            // Scroll elements into view gently
            cardElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            if (jsonChunkEl) {
                // Determine if jsonOutput tab is currently active
                if (document.getElementById('jsonView').classList.contains('active')) {
                    jsonChunkEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        });
        
        overlay.addEventListener('mouseleave', () => {
            overlay.classList.remove('active');
            cardElement.classList.remove('active');
            if (jsonChunkEl) jsonChunkEl.classList.remove('active');
        });

        cardElement.addEventListener('mouseenter', () => {
            cardElement.classList.add('active');
            overlay.classList.add('active');
            if (jsonChunkEl) jsonChunkEl.classList.add('active');
            
            overlay.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });

        cardElement.addEventListener('mouseleave', () => {
            cardElement.classList.remove('active');
            overlay.classList.remove('active');
            if (jsonChunkEl) jsonChunkEl.classList.remove('active');
        });
        
        if (jsonChunkEl) {
            jsonChunkEl.addEventListener('mouseenter', () => {
                jsonChunkEl.classList.add('active');
                overlay.classList.add('active');
                cardElement.classList.add('active');
                
                overlay.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });

            jsonChunkEl.addEventListener('mouseleave', () => {
                jsonChunkEl.classList.remove('active');
                overlay.classList.remove('active');
                cardElement.classList.remove('active');
            });
        }
    }

    // Chat Simulation
    const chatTextarea = document.querySelector('.chat-textarea');
    const chatSendBtn = document.querySelector('.chat-send-btn');
    const chatHistory = document.querySelector('.chat-history');

    function appendMessage(role, text) {
        if (!chatHistory) return;
        
        const emptyState = document.getElementById('chatEmptyState');
        if (emptyState) emptyState.remove();

        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${role}-message`;
        
        let avatarSvg = '';
        if (role === 'user') {
            avatarSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
        } else {
            avatarSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>';
        }
        
        if (role === 'bot') {
            msgDiv.innerHTML = `
                <div class="chat-avatar">
                    ${avatarSvg}
                </div>
                <div class="chat-bubble">
                    <p>${text}</p>
                    <div class="chat-feedback">
                        <button class="feedback-btn thumbs-up" title="Helpful">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
                        </button>
                        <button class="feedback-btn thumbs-down" title="Not helpful">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-2"></path></svg>
                        </button>
                    </div>
                </div>
            `;
            
            setTimeout(() => {
                const thumbsUp = msgDiv.querySelector('.thumbs-up');
                const thumbsDown = msgDiv.querySelector('.thumbs-down');
                if (thumbsUp && thumbsDown) {
                    thumbsUp.addEventListener('click', () => {
                        thumbsUp.classList.toggle('active-up');
                        thumbsDown.classList.remove('active-down');
                    });
                    thumbsDown.addEventListener('click', () => {
                        thumbsDown.classList.toggle('active-down');
                        thumbsUp.classList.remove('active-up');
                    });
                }
            }, 0);
        } else {
            msgDiv.innerHTML = `
                <div class="chat-avatar">
                    ${avatarSvg}
                </div>
                <div class="chat-bubble">
                    <p>${text}</p>
                </div>
            `;
        }
        
        chatHistory.appendChild(msgDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    async function handleSend() {
        if (!chatTextarea) return;
        const text = chatTextarea.value.trim();
        if (!text) return;
        
        if (text.toLowerCase() === '/clear') {
            if (chatHistory) {
                chatHistory.innerHTML = `
                    <div id="chatEmptyState" class="chat-empty-state">
                        <svg opacity="0.5" viewBox="0 0 24 24" fill="url(#glassGradient)" stroke="rgba(255,255,255,0.5)" stroke-width="0.2" stroke-linecap="round" stroke-linejoin="round">
                          <defs>
                            <linearGradient id="glassGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stop-color="rgba(255,255,255,0.25)" />
                              <stop offset="100%" stop-color="rgba(255,255,255,0.05)" />
                            </linearGradient>
                          </defs>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                          <line x1="16" y1="13" x2="8" y2="13"></line>
                          <line x1="16" y1="17" x2="8" y2="17"></line>
                          <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                    </div>
                `;
            }
            chatTextarea.value = '';
            return;
        }
        
        appendMessage('user', text);
        chatTextarea.value = '';
        
        if (!currentUid) {
            appendMessage('bot', "Please process a document first.");
            return;
        }
        
        // Find dropdown values
        const selects = document.querySelectorAll('.chat-select');
        let model = "GPT-4o";
        let method = "QA";
        if (selects.length >= 2) {
            model = selects[0].value.replace("Model: ", "");
            method = selects[1].value.replace("Method: ", "");
        }
        
        // Show loading
        const loadingId = 'loading-' + Date.now();
        chatHistory.insertAdjacentHTML('beforeend', `
            <div id="${loadingId}" class="chat-message bot-message" style="opacity: 0.7;">
                <div class="chat-avatar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
                </div>
                <div class="chat-bubble" style="background: transparent; border: 1px solid var(--border-color); display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: 8px;">
                    <span id="${loadingId}-text" style="color: var(--text-muted); font-size: 0.9em;">Searching document</span>
                    <div class="typing-indicator" style="display: flex;">
                        <span style="display: inline-block; width: 4px; height: 4px; background-color: var(--text-muted); border-radius: 50%; margin: 0 2px; animation: blink 1.4s infinite both; animation-delay: 0s;"></span>
                        <span style="display: inline-block; width: 4px; height: 4px; background-color: var(--text-muted); border-radius: 50%; margin: 0 2px; animation: blink 1.4s infinite both; animation-delay: 0.2s;"></span>
                        <span style="display: inline-block; width: 4px; height: 4px; background-color: var(--text-muted); border-radius: 50%; margin: 0 2px; animation: blink 1.4s infinite both; animation-delay: 0.4s;"></span>
                    </div>
                </div>
            </div>
        `);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uid: currentUid,
                    message: text,
                    model: model,
                    method: method
                })
            });
            
            // Do not remove loading indicator yet, wait for first token
            
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            
            let isFirstToken = true;
            let currentMessageDiv = null;
            let pElement = null;
            let currentMarkdown = "";
            let retrievedContext = "";
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunkStr = decoder.decode(value, { stream: true });
                const lines = chunkStr.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.substring(6);
                        if (dataStr === '[DONE]') continue;
                        
                        try {
                            const data = JSON.parse(dataStr);
                            
                            if (data.type === 'results') {
                                const loadText = document.getElementById(`${loadingId}-text`);
                                if (loadText) loadText.innerText = "Thinking";
                            } else if (data.type === 'token') {
                                if (isFirstToken) {
                                    document.getElementById(loadingId)?.remove();
                                    appendMessage('bot', '');
                                    currentMessageDiv = chatHistory.lastElementChild;
                                    pElement = currentMessageDiv.querySelector('p');
                                    isFirstToken = false;
                                }
                                currentMarkdown += data.content;
                                pElement.innerHTML = currentMarkdown.replace(/\\n/g, '<br>');
                                chatHistory.scrollTop = chatHistory.scrollHeight;
                            } else if (data.type === 'error') {
                                appendMessage('bot', "Error: " + data.error);
                            }
                        } catch(e) {
                            // Ignore incomplete JSON chunks from split boundaries
                        }
                    }
                }
            }
            
            if (pElement && currentMarkdown) {
                pElement.innerHTML = currentMarkdown.replace(/\\n/g, '<br>');
                chatHistory.scrollTop = chatHistory.scrollHeight;
            }
            
        } catch (e) {
            document.getElementById(loadingId)?.remove();
            appendMessage('bot', "Network error: " + e.message);
        }
    }

    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', handleSend);
    }

    if (chatTextarea) {
        chatTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });
    }

    // Add listeners to static feedback buttons
    document.querySelectorAll('.chat-message.bot-message .chat-feedback').forEach(feedbackDiv => {
        const thumbsUp = feedbackDiv.querySelector('.thumbs-up');
        const thumbsDown = feedbackDiv.querySelector('.thumbs-down');
        if (thumbsUp && thumbsDown) {
            thumbsUp.addEventListener('click', () => {
                thumbsUp.classList.toggle('active-up');
                thumbsDown.classList.remove('active-down');
            });
            thumbsDown.addEventListener('click', () => {
                thumbsDown.classList.toggle('active-down');
                thumbsUp.classList.remove('active-up');
            });
        }
    });

    // Extraction Tab Logic
    const suggestSchemaBtn = document.getElementById('suggestSchemaBtn');
    const uploadSchemaBtn = document.getElementById('uploadSchemaBtn');
    const schemaFileInput = document.getElementById('schemaFileInput');
    const schemaTextarea = document.getElementById('schemaTextarea');
    const schemaLineNumbers = document.getElementById('schemaLineNumbers');
    const runExtractBtn = document.getElementById('runExtractBtn');
    const extractConsole = document.getElementById('extractConsole');
    const extractedJsonOutput = document.getElementById('extractedJsonOutput');
    const downloadExtractBtn = document.getElementById('downloadExtractBtn');
    const copyExtractBtn = document.getElementById('copyExtractBtn');

    // Default schema placeholder
    const defaultSchema = {
        "type": "object",
        "properties": {
            "title": { "type": "string" },
            "summary": { "type": "string" },
            "entities": {
            "type": "array",
            "items": { "type": "string" }
            }
        },
        "required": ["title", "summary"]
    };

    function updateSchemaLineNumbers() {
        if (!schemaTextarea || !schemaLineNumbers) return;
        const linesCount = schemaTextarea.value.split('\n').length;
        let numbersHtml = '';
        for (let i = 1; i <= linesCount; i++) {
            numbersHtml += i + '<br>';
        }
        schemaLineNumbers.innerHTML = numbersHtml;
    }

    if (schemaTextarea) {
        schemaTextarea.value = JSON.stringify(defaultSchema, null, 2);
        if (schemaLineNumbers) {
            schemaTextarea.addEventListener('input', updateSchemaLineNumbers);
            schemaTextarea.addEventListener('scroll', () => {
                schemaLineNumbers.scrollTop = schemaTextarea.scrollTop;
            });
            updateSchemaLineNumbers();
        }
    }

    const threshold = 20000;

    function updateExtractionBadgeState() {
        const docLengthBadge = document.getElementById('docLengthBadge');
        const routingBadge = document.getElementById('routingBadge');
        if (!docLengthBadge || !routingBadge) return;
        
        if (!currentMarkdown) {
            docLengthBadge.textContent = "Length: 0 Chars";
            routingBadge.textContent = "Route: N/A";
            routingBadge.style.borderColor = "var(--border-color)";
            routingBadge.style.color = "var(--text-muted)";
            routingBadge.style.background = "var(--bg-hover)";
            return;
        }
        
        const len = currentMarkdown.length;
        docLengthBadge.textContent = `Length: ${len.toLocaleString()} Chars`;
        
        if (len < threshold) {
            routingBadge.textContent = "Route: Direct";
            routingBadge.style.borderColor = "var(--accent-green)";
            routingBadge.style.color = "var(--accent-green)";
            routingBadge.style.background = "var(--accent-green-dim)";
        } else {
            routingBadge.textContent = "Route: Chunked";
            routingBadge.style.borderColor = "#d97706";
            routingBadge.style.color = "#d97706";
            routingBadge.style.background = "rgba(217, 119, 6, 0.05)";
        }
    }

    // Call update on tab click if targets extraction view
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.target === 'extractView') {
                updateExtractionBadgeState();
            }
        });
    });

    // Helper to log to console
    function appendConsoleLog(message, type = 'normal') {
        if (!extractConsole) return;
        const line = document.createElement('div');
        line.className = `console-line ${type}-line`;
        line.textContent = `> ${message}`;
        extractConsole.appendChild(line);
        extractConsole.scrollTop = extractConsole.scrollHeight;
    }

    // Suggest Schema
    if (suggestSchemaBtn) {
        suggestSchemaBtn.addEventListener('click', async () => {
            if (!currentUid) {
                alert("Please process or select a document first.");
                return;
            }
            
            const schemaLoader = document.getElementById('schemaLoader');
            if (schemaLoader) schemaLoader.classList.remove('hidden');
            suggestSchemaBtn.disabled = true;
            appendConsoleLog("Contacting model to analyze content and suggest schema...", "info");
            
            const selects = document.querySelectorAll('.chat-select');
            let model = "qwen2.5vl:7b";
            if (selects.length >= 1) {
                model = selects[0].value.replace("Model: ", "");
            }
            
            try {
                const res = await fetch('/api/suggest-schema', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uid: currentUid, model: model })
                });
                
                if (!res.ok) throw new Error("Server failed to suggest schema");
                const suggestedSchema = await res.json();
                
                if (schemaTextarea) {
                    schemaTextarea.value = JSON.stringify(suggestedSchema, null, 2);
                    if (typeof updateSchemaLineNumbers === 'function') updateSchemaLineNumbers();
                }
                appendConsoleLog("Schema suggestion loaded successfully.", "success");
            } catch (e) {
                appendConsoleLog(`Failed to suggest schema: ${e.message}`, "warning");
            } finally {
                if (schemaLoader) schemaLoader.classList.add('hidden');
                suggestSchemaBtn.disabled = false;
            }
        });
    }

    // Upload Schema File
    if (uploadSchemaBtn && schemaFileInput) {
        uploadSchemaBtn.addEventListener('click', () => {
            schemaFileInput.click();
        });
        
        schemaFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = (evt) => {
                    try {
                        const parsed = JSON.parse(evt.target.result);
                        if (schemaTextarea) {
                            schemaTextarea.value = JSON.stringify(parsed, null, 2);
                            if (typeof updateSchemaLineNumbers === 'function') updateSchemaLineNumbers();
                        }
                        appendConsoleLog(`Uploaded schema successfully from ${file.name}.`, "success");
                    } catch (err) {
                        appendConsoleLog(`Error: Failed to parse uploaded schema. Invalid JSON file.`, "warning");
                        alert("Invalid JSON file uploaded.");
                    }
                };
                reader.readAsText(file);
            }
        });
    }

    // Run Extraction
    if (runExtractBtn) {
        runExtractBtn.addEventListener('click', async () => {
            if (!currentUid) {
                alert("Please process or select a document first.");
                return;
            }
            
            let schemaJson;
            try {
                schemaJson = JSON.parse(schemaTextarea.value);
            } catch (err) {
                alert("Error: Schema text is not valid JSON.");
                appendConsoleLog("Error: Invalid schema JSON in textarea.", "warning");
                return;
            }
            
            // UI state: running
            const extractLoader = document.getElementById('extractLoader');
            if (extractLoader) extractLoader.classList.remove('hidden');
            runExtractBtn.disabled = true;
            if (suggestSchemaBtn) suggestSchemaBtn.disabled = true;
            if (uploadSchemaBtn) uploadSchemaBtn.disabled = true;
            downloadExtractBtn.disabled = true;
            copyExtractBtn.disabled = true;
            extractedJsonOutput.textContent = "{}";
            
            // Clear console except initial log
            extractConsole.innerHTML = '<div class="console-line system-line">> Console initialized. Starting extraction...</div>';
            
            const selects = document.querySelectorAll('.chat-select');
            let model = "qwen2.5vl:7b";
            if (selects.length >= 1) {
                model = selects[0].value.replace("Model: ", "");
            }
            
            try {
                const res = await fetch('/api/extract', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        uid: currentUid,
                        schema_dict: schemaJson,
                        model: model,
                        threshold: threshold
                    })
                });
                
                if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
                
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunkStr = decoder.decode(value, { stream: true });
                    const lines = chunkStr.split('\n');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const dataStr = line.substring(6);
                            if (dataStr === '[DONE]') continue;
                            
                            try {
                                const payload = JSON.parse(dataStr);
                                if (payload.type === 'log') {
                                    let type = 'normal';
                                    if (payload.message.includes('Success')) type = 'success';
                                    else if (payload.message.includes('Warning') || payload.message.includes('Failed')) type = 'warning';
                                    else if (payload.message.includes('[Routing]')) type = 'info';
                                    appendConsoleLog(payload.message, type);
                                } else if (payload.type === 'result') {
                                    currentExtractedJson = payload.data;
                                    let rawJson = JSON.stringify(payload.data, null, 2);
                                    let highlightedHtml = syntaxHighlightJson(rawJson);
                                    highlightedHtml = makeCollapsible(highlightedHtml);
                                    highlightedHtml = highlightedHtml.replace(/^/gm, '<span class="json-line-num"></span>');
                                    extractedJsonOutput.innerHTML = highlightedHtml;
                                    attachFoldingEvents(extractedJsonOutput);
                                    if (!payload.data.error) {
                                        downloadExtractBtn.disabled = false;
                                        copyExtractBtn.disabled = false;
                                        appendConsoleLog("Extraction complete. JSON saved.", "success");
                                    } else {
                                        appendConsoleLog("Extraction aborted. Failed to extract valid JSON.", "warning");
                                    }
                                }
                            } catch (e) {
                                // Ignore split chunks
                            }
                        }
                    }
                }
            } catch (err) {
                appendConsoleLog(`Fatal error during extraction stream: ${err.message}`, "warning");
            } finally {
                const extractLoader = document.getElementById('extractLoader');
                if (extractLoader) extractLoader.classList.add('hidden');
                runExtractBtn.disabled = false;
                if (suggestSchemaBtn) suggestSchemaBtn.disabled = false;
                if (uploadSchemaBtn) uploadSchemaBtn.disabled = false;
            }
        });
    }

    // Copy Extracted JSON
    if (copyExtractBtn) {
        copyExtractBtn.addEventListener('click', () => {
            if (!currentExtractedJson) return;
            navigator.clipboard.writeText(JSON.stringify(currentExtractedJson, null, 2)).then(() => {
                copyExtractBtn.textContent = "COPIED!";
                setTimeout(() => {
                    copyExtractBtn.innerHTML = `
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        COPY
                    `;
                }, 1500);
            }).catch(e => alert("Failed to copy JSON: " + e.message));
        });
    }

    // Download Extracted JSON
    if (downloadExtractBtn) {
        downloadExtractBtn.addEventListener('click', () => {
            if (!currentExtractedJson) return;
            const blob = new Blob([JSON.stringify(currentExtractedJson, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `extracted_${currentUid || 'document'}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    // Document Viewer Controls: Zoom Logic
    let currentZoom = 100;
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomResetBtn = document.getElementById('zoomResetBtn');
    const zoomLabel = document.getElementById('zoomLabel');
    const viewerContent = document.getElementById('viewerContent');

    function applyZoom() {
        if (viewerContent) {
            viewerContent.style.setProperty('--zoom-level', currentZoom / 100);
        }
        if (zoomLabel) {
            zoomLabel.textContent = `${currentZoom}%`;
        }
    }

    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            if (currentZoom < 200) {
                currentZoom += 10;
                applyZoom();
            }
        });
    }

    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            if (currentZoom > 50) {
                currentZoom -= 10;
                applyZoom();
            }
        });
    }

    if (zoomResetBtn) {
        zoomResetBtn.addEventListener('click', () => {
            currentZoom = 100;
            applyZoom();
        });
    }

    // Color Customizer Toggle and Input Bindings
    const toggleColorPanelBtn = document.getElementById('toggleColorPanelBtn');
    const closeColorPanelBtn = document.getElementById('closeColorPanelBtn');
    const bboxColorPanel = document.getElementById('bboxColorPanel');
    const resetColorsBtn = document.getElementById('resetColorsBtn');
    const colorInputs = document.querySelectorAll('#bboxColorPanel input[type="color"]');

    const defaultColors = {
        'text': '#0091ff',
        'section-header': '#2cdd38',
        'table': '#0891b2',
        'page-header': '#ea580c',
        'page-footer': '#6d28d9',
        'title': '#d97706',
        'image': '#0d9488',
        'list': '#db2777',
        'caption': '#7c3aed',
        'default': '#1f6443'
    };

    if (toggleColorPanelBtn && bboxColorPanel) {
        toggleColorPanelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            bboxColorPanel.classList.toggle('hidden');
        });
        
        // Prevent click outside panel from closing if clicking inside
        bboxColorPanel.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Click outside closes panel
        document.addEventListener('click', () => {
            bboxColorPanel.classList.add('hidden');
        });
    }

    if (closeColorPanelBtn && bboxColorPanel) {
        closeColorPanelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            bboxColorPanel.classList.add('hidden');
        });
    }

    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function updateBBoxStyles(label, hex) {
        const borderVar = `--color-${label}-border`;
        const bgVar = `--color-${label}-bg`;
        const hoverBgVar = `--color-${label}-hover-bg`;
        const hoverBorderVar = `--color-${label}-hover-border`;

        const baseBg = hexToRgba(hex, 0.12);
        const baseBorder = hexToRgba(hex, 0.65);
        const hoverBg = hexToRgba(hex, 0.22);
        const hoverBorder = hexToRgba(hex, 1.0);

        document.documentElement.style.setProperty(borderVar, baseBorder);
        document.documentElement.style.setProperty(bgVar, baseBg);
        document.documentElement.style.setProperty(hoverBgVar, hoverBg);
        document.documentElement.style.setProperty(hoverBorderVar, hoverBorder);
    }

    colorInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            const label = e.target.dataset.label;
            const hex = e.target.value;
            updateBBoxStyles(label, hex);
        });
    });

    if (resetColorsBtn) {
        resetColorsBtn.addEventListener('click', () => {
            colorInputs.forEach(input => {
                const label = input.dataset.label;
                const defaultHex = defaultColors[label] || '#1f6443';
                input.value = defaultHex;
                
                const borderVar = `--color-${label}-border`;
                const bgVar = `--color-${label}-bg`;
                const hoverBgVar = `--color-${label}-hover-bg`;
                const hoverBorderVar = `--color-${label}-hover-border`;

                document.documentElement.style.removeProperty(borderVar);
                document.documentElement.style.removeProperty(bgVar);
                document.documentElement.style.removeProperty(hoverBgVar);
                document.documentElement.style.removeProperty(hoverBorderVar);
            });
        });
    }
});
