document.addEventListener('DOMContentLoaded', () => {
    const imageInput = document.getElementById('imageInput');
    const fileNameDisplay = document.getElementById('fileName');
    const processBtn = document.getElementById('processBtn');
    
    const resultsSection = document.getElementById('resultsSection');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const previewImage = document.getElementById('previewImage');
    const imageWrapper = document.getElementById('imageWrapper');
    const uidDisplay = document.getElementById('uidDisplay');
    
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
            uidDisplay.textContent = `TYPE: ${fileExt} | DOC: ${data.uid}`;

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
        uidDisplay.textContent = item.uid;
        fileNameDisplay.textContent = item.filename;
        
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
        jsonOutput.innerHTML = highlightedBase.replace(/\n\]$/, `,\n${blocksStr}\n]`);
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
        
        const leftPct = (x1 / pageWidth) * 100;
        const topPct = (y1 / pageHeight) * 100;
        const widthPct = ((x2 - x1) / pageWidth) * 100;
        const heightPct = ((y2 - y1) / pageHeight) * 100;
        
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

    function handleSend() {
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
        
        setTimeout(() => {
            appendMessage('bot', "I'm a frontend simulation. You said: " + text);
        }, 600);
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
});
