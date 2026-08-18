document.addEventListener('DOMContentLoaded', () => {
    // API Key Elements
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveKeyBtn = document.getElementById('saveKeyBtn');
    const clearKeyBtn = document.getElementById('clearKeyBtn');

    // Default Player Elements
    const defaultAudio = document.getElementById('defaultAudio');
    const playBtn = document.getElementById('playBtn');
    const progressBar = document.getElementById('progressBar');
    const timeDisplay = document.getElementById('timeDisplay');
    const runSimBtn = document.getElementById('runSimBtn');

    // Upload Elements
    const fileInput = document.getElementById('fileInput');
    const dropzone = document.getElementById('dropzone');
    const dropzonePrompt = document.getElementById('dropzonePrompt');
    const selectedFileName = document.getElementById('selectedFileName');
    const uploadTranscribeBtn = document.getElementById('uploadTranscribeBtn');

    // TTS Elements
    const ttsTextInput = document.getElementById('ttsTextInput');
    const ttsVoiceSelect = document.getElementById('ttsVoiceSelect');
    const synthesizeBtn = document.getElementById('synthesizeBtn');

    // Feed Elements
    const resultsFeed = document.getElementById('resultsFeed');
    const feedPlaceholder = document.getElementById('feedPlaceholder');
    const clearFeedBtn = document.getElementById('clearFeedBtn');

    // Loading & Error Elements
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorContainer = document.getElementById('errorContainer');
    const errorMessage = document.getElementById('errorMessage');

    // State Variables
    let apiKey = localStorage.getItem('ilmu_api_key') || '';
    let selectedFile = null;
    let runCounter = 0;

    // Initialize API Key State
    if (apiKey) {
        apiKeyInput.value = '••••••••••••••••••••••••••••••••';
        apiKeyInput.disabled = true;
        saveKeyBtn.classList.add('hidden');
        clearKeyBtn.classList.remove('hidden');
    }

    // API Key Actions
    saveKeyBtn.addEventListener('click', () => {
        const inputVal = apiKeyInput.value.trim();
        if (inputVal) {
            apiKey = inputVal;
            localStorage.setItem('ilmu_api_key', apiKey);
            apiKeyInput.value = '••••••••••••••••••••••••••••••••';
            apiKeyInput.disabled = true;
            saveKeyBtn.classList.add('hidden');
            clearKeyBtn.classList.remove('hidden');
            hideError();
        }
    });

    clearKeyBtn.addEventListener('click', () => {
        apiKey = '';
        localStorage.removeItem('ilmu_api_key');
        apiKeyInput.value = '';
        apiKeyInput.disabled = false;
        saveKeyBtn.classList.remove('hidden');
        clearKeyBtn.classList.add('hidden');
    });

    // Custom Player Logic (Default Kelate.mp3)
    let isPlaying = false;

    playBtn.addEventListener('click', () => {
        if (isPlaying) {
            defaultAudio.pause();
        } else {
            defaultAudio.play();
        }
    });

    defaultAudio.addEventListener('play', () => {
        isPlaying = true;
        playBtn.querySelector('.play-icon').classList.add('hidden');
        playBtn.querySelector('.pause-icon').classList.remove('hidden');
    });

    defaultAudio.addEventListener('pause', () => {
        isPlaying = false;
        playBtn.querySelector('.play-icon').classList.remove('hidden');
        playBtn.querySelector('.pause-icon').classList.add('hidden');
    });

    defaultAudio.addEventListener('timeupdate', () => {
        if (defaultAudio.duration) {
            const progress = (defaultAudio.currentTime / defaultAudio.duration) * 100;
            progressBar.value = progress;
            updateTimeDisplay(defaultAudio.currentTime, defaultAudio.duration);
        }
    });

    progressBar.addEventListener('input', () => {
        if (defaultAudio.duration) {
            const newTime = (progressBar.value / 100) * defaultAudio.duration;
            defaultAudio.currentTime = newTime;
        }
    });

    defaultAudio.addEventListener('loadedmetadata', () => {
        updateTimeDisplay(0, defaultAudio.duration);
    });

    function updateTimeDisplay(current, duration) {
        timeDisplay.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    }

    function formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // Drag and Drop Upload Handlers
    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    function handleFileSelect(file) {
        if (!file.type.startsWith('audio/')) {
            showError('Fail yang dipilih mestilah fail audio sahaja.');
            return;
        }
        selectedFile = file;
        selectedFileName.textContent = file.name;
        selectedFileName.classList.remove('hidden');
        dropzonePrompt.querySelector('.prompt-text').classList.add('hidden');
        dropzonePrompt.querySelector('.upload-icon').style.fill = 'var(--text-primary)';
        hideError();
    }

    function clearUploadSelection() {
        selectedFile = null;
        fileInput.value = '';
        selectedFileName.textContent = '';
        selectedFileName.classList.add('hidden');
        dropzonePrompt.querySelector('.prompt-text').classList.remove('hidden');
        dropzonePrompt.querySelector('.upload-icon').style.fill = 'var(--text-secondary)';
    }

    // Run Simulation Handlers
    runSimBtn.addEventListener('click', () => {
        runASRFlow(null); // Passing null indicates default audio Kelate.mp3
    });

    uploadTranscribeBtn.addEventListener('click', () => {
        if (!selectedFile) {
            showError('Sila pilih atau seret fail audio terlebih dahulu.');
            return;
        }
        runASRFlow(selectedFile);
    });

    synthesizeBtn.addEventListener('click', () => {
        const text = ttsTextInput.value.trim();
        if (!text) {
            showError('Sila masukkan teks dialek Kelantan terlebih dahulu.');
            return;
        }
        runTTSFlow(text, ttsVoiceSelect.value);
    });

    clearFeedBtn.addEventListener('click', () => {
        resultsFeed.innerHTML = '';
        resultsFeed.appendChild(feedPlaceholder);
        clearFeedBtn.classList.add('hidden');
        runCounter = 0;
    });

    // Unified ASR + Translation Flow
    async function runASRFlow(fileObj) {
        hideError();
        showLoading(true);

        const formData = new FormData();
        if (fileObj) {
            formData.append('file', fileObj);
        }

        try {
            const headers = {};
            if (apiKey) {
                headers['X-ILMU-API-KEY'] = apiKey;
            }

            const response = await fetch('/api/transcribe', {
                method: 'POST',
                headers: headers,
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Gagal menyambung ke API pelayan.');
            }

            // Create and append result card
            appendResultToFeed(data, fileObj, false);
            clearUploadSelection();

        } catch (err) {
            showError(err.message);
        } finally {
            showLoading(false);
        }
    }

    async function runTTSFlow(text, voice) {
        hideError();
        showLoading(true);

        try {
            const headers = {
                'Content-Type': 'application/json'
            };
            if (apiKey) {
                headers['X-ILMU-API-KEY'] = apiKey;
            }

            const response = await fetch('/api/synthesize', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ text, voice })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Gagal menyambung ke API pelayan.');
            }

            // Convert base64 audio string to a Blob
            const binaryString = atob(data.audio);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const audioBlob = new Blob([bytes.buffer], { type: 'audio/mpeg' });

            // Create and append result card for TTS
            appendResultToFeed(data, audioBlob, true);
            ttsTextInput.value = '';

        } catch (err) {
            showError(err.message);
        } finally {
            showLoading(false);
        }
    }

    function appendResultToFeed(data, fileOrBlob, isTTS = false) {
        // Remove empty feed placeholder if it exists
        if (feedPlaceholder.parentElement) {
            feedPlaceholder.remove();
        }

        runCounter++;
        const rowId = `run-${runCounter}`;
        const runCard = document.createElement('article');
        runCard.className = 'result-row';
        runCard.id = rowId;

        // Build Metadata Row Header
        const timestamp = new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        let displayName = '';
        if (isTTS) {
            const voiceLabel = data.voice === 'voice_1' ? 'Perempuan (Voice 1)' : (data.voice === 'voice_2' ? 'Lelaki (Voice 2)' : 'Lelaki Alt (Voice 3)');
            displayName = `Speech Synthesis (${voiceLabel})`;
        } else {
            displayName = !fileOrBlob ? 'Kelate.mp3 (Simulasi)' : data.filename;
        }

        let metaDetails = '';
        if (isTTS) {
            metaDetails = `Masa: ${timestamp} | Model TTS: ilmu-tts-v2 | Model Terjemahan: ilmu-mini-v3.3`;
        } else {
            metaDetails = `Masa: ${timestamp} | Model ASR: ilmu-asr-v4.2 | Model Terjemahan: ilmu-mini-v3.3`;
        }

        // If custom audio or generated TTS audio, we can generate a local blob URL for playback
        let localAudioPlayerHtml = '';
        let audioBlobUrl = '';
        if (fileOrBlob) {
            audioBlobUrl = URL.createObjectURL(fileOrBlob);
            localAudioPlayerHtml = `
                <div class="player-container" style="max-width: 500px; margin-top: 0.5rem; margin-bottom: 0;">
                    <audio id="${rowId}-audio" src="${audioBlobUrl}" preload="metadata"></audio>
                    <div class="player-controls">
                        <button id="${rowId}-playBtn" class="player-btn" aria-label="Play">
                            <svg class="play-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            <svg class="pause-icon hidden" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                        </button>
                        <div class="player-timeline-wrapper">
                            <input type="range" id="${rowId}-progressBar" class="player-progress" min="0" max="100" value="0">
                        </div>
                        <span id="${rowId}-timeDisplay" class="player-time">0:00 / 0:00</span>
                    </div>
                </div>
            `;
        }

        // Generate Glossary HTML if present
        let glossaryHtml = '';
        const glossaryList = data.analysis.glossary || [];
        if (glossaryList.length > 0) {
            glossaryHtml = `
                <div style="margin-top: 1.5rem;">
                    <h4 class="glossary-title">Daftar Istilah Dialek</h4>
                    <table class="glossary-table">
                        <thead>
                            <tr>
                                <th>Kata Dialek</th>
                                <th>Maksud BM Standard</th>
                                <th>Meaning in English</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${glossaryList.map(item => `
                                <tr>
                                    <td class="dialect-term">${escapeHtml(item.word)}</td>
                                    <td>${escapeHtml(item.standard_malay_meaning)}</td>
                                    <td>${escapeHtml(item.english_meaning)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            glossaryHtml = `
                <div style="margin-top: 1.5rem;">
                    <h4 class="glossary-title">Daftar Istilah Dialek</h4>
                    <p class="helper-text font-normal" style="font-style: italic;">Tiada perkataan dialek khusus dikesan.</p>
                </div>
            `;
        }

        runCard.innerHTML = `
            <div class="run-meta">
                <div class="run-title-wrapper">
                    <span class="run-number">Larian #${runCounter}</span>
                    <h3 class="run-filename">${escapeHtml(displayName)}</h3>
                </div>
                <div class="run-details">
                    ${metaDetails}
                </div>
            </div>
            ${localAudioPlayerHtml}
            <div class="run-split-grid">
                <!-- Pure ASR Dialect Column or TTS Input Text -->
                <div class="run-column">
                    <h4 class="column-header">${isTTS ? 'Input Text (Kelantan Dialect)' : 'Pure ASR Transcript (ilmu-asr-v4.2)'}</h4>
                    <div class="transcript-card">
                        <blockquote class="transcript-quote">"${escapeHtml(isTTS ? data.text : data.transcript)}"</blockquote>
                    </div>
                </div>

                <!-- Explanation / Translation Column -->
                <div class="run-column">
                    <h4 class="column-header">Dialect Explainer & Translation (ilmu-mini-v3.3)</h4>
                    
                    <div class="translation-section">
                        <div class="translation-label">Terjemahan Bahasa Malaysia Standard</div>
                        <p class="translation-text">${escapeHtml(data.analysis.standard_malay)}</p>
                    </div>

                    <div class="translation-section">
                        <div class="translation-label">English Translation</div>
                        <p class="translation-text" style="font-style: italic;">${escapeHtml(data.analysis.english)}</p>
                    </div>

                    <div class="translation-section" style="margin-bottom: 0;">
                        <div class="translation-label">Konteks & Nada Perbualan</div>
                        <p class="explanation-text" style="margin-bottom: 0;">${escapeHtml(data.analysis.explanation)}</p>
                    </div>
                    
                    ${glossaryHtml}
                </div>
            </div>
        `;

        // Prepend result so newest run is at the top of the feed
        resultsFeed.insertBefore(runCard, resultsFeed.firstChild);
        clearFeedBtn.classList.remove('hidden');

        // Hook up the local custom audio player if created
        if (fileOrBlob) {
            setupLocalPlayer(rowId);
        }
    }

    function setupLocalPlayer(rowId) {
        const audioEl = document.getElementById(`${rowId}-audio`);
        const rowPlayBtn = document.getElementById(`${rowId}-playBtn`);
        const rowProgressBar = document.getElementById(`${rowId}-progressBar`);
        const rowTimeDisplay = document.getElementById(`${rowId}-timeDisplay`);

        let rowIsPlaying = false;

        rowPlayBtn.addEventListener('click', () => {
            if (rowIsPlaying) {
                audioEl.pause();
            } else {
                audioEl.play();
            }
        });

        audioEl.addEventListener('play', () => {
            rowIsPlaying = true;
            rowPlayBtn.querySelector('.play-icon').classList.add('hidden');
            rowPlayBtn.querySelector('.pause-icon').classList.remove('hidden');
        });

        audioEl.addEventListener('pause', () => {
            rowIsPlaying = false;
            rowPlayBtn.querySelector('.play-icon').classList.remove('hidden');
            rowPlayBtn.querySelector('.pause-icon').classList.add('hidden');
        });

        audioEl.addEventListener('timeupdate', () => {
            if (audioEl.duration) {
                const progress = (audioEl.currentTime / audioEl.duration) * 100;
                rowProgressBar.value = progress;
                rowTimeDisplay.textContent = `${formatTime(audioEl.currentTime)} / ${formatTime(audioEl.duration)}`;
            }
        });

        rowProgressBar.addEventListener('input', () => {
            if (audioEl.duration) {
                const newTime = (rowProgressBar.value / 100) * audioEl.duration;
                audioEl.currentTime = newTime;
            }
        });

        audioEl.addEventListener('loadedmetadata', () => {
            rowTimeDisplay.textContent = `0:00 / ${formatTime(audioEl.duration)}`;
        });
    }

    // Helper functions
    function showLoading(show) {
        if (show) {
            loadingIndicator.classList.remove('hidden');
        } else {
            loadingIndicator.classList.add('hidden');
        }
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        errorContainer.classList.remove('hidden');
        window.scrollTo({ top: errorContainer.offsetTop - 40, behavior: 'smooth' });
    }

    function hideError() {
        errorContainer.classList.add('hidden');
    }

    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    // ==========================================
    // TAB SWITCHING LOGIC
    // ==========================================
    const tabBtns = document.querySelectorAll('.tab-btn');
    const labTabContent = document.getElementById('labTabContent');
    const agentTabContent = document.getElementById('agentTabContent');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const tab = btn.dataset.tab;
            if (tab === 'lab') {
                labTabContent.classList.remove('hidden');
                agentTabContent.classList.add('hidden');
            } else {
                labTabContent.classList.add('hidden');
                agentTabContent.classList.remove('hidden');
                // Stop any running agent audio if switching tabs
                if (currentAgentAudio) {
                    currentAgentAudio.pause();
                }
            }
        });
    });

    // ==========================================
    // REAL-TIME VOICE AGENT LOGIC
    // ==========================================
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;
    let agentChatHistory = [];
    let currentAgentAudio = null;

    const micButton = document.getElementById('micButton');
    const micStatusText = document.getElementById('micStatusText');
    const micHelperText = document.getElementById('micHelperText');
    const agentSystemPrompt = document.getElementById('agentSystemPrompt');
    const agentVoiceSelect = document.getElementById('agentVoiceSelect');
    const agentChatLog = document.getElementById('agentChatLog');
    const clearAgentChatBtn = document.getElementById('clearAgentChatBtn');

    async function toggleRecording() {
        if (isRecording) {
            stopRecording();
        } else {
            await startRecording();
        }
    }

    async function startRecording() {
        audioChunks = [];
        hideError();
        
        if (currentAgentAudio) {
            currentAgentAudio.pause();
            currentAgentAudio = null;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            let options = { mimeType: 'audio/webm' };
            if (!MediaRecorder.isTypeSupported('audio/webm')) {
                options = { mimeType: 'audio/ogg' };
                if (!MediaRecorder.isTypeSupported('audio/ogg')) {
                    options = {}; // fallback to default
                }
            }

            mediaRecorder = new MediaRecorder(stream, options);
            
            mediaRecorder.addEventListener('dataavailable', event => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            });

            mediaRecorder.addEventListener('stop', () => {
                const mimeType = mediaRecorder.mimeType || 'audio/webm';
                const audioBlob = new Blob(audioChunks, { type: mimeType });
                
                // Close streams immediately to release microphone
                stream.getTracks().forEach(track => track.stop());
                
                sendVoiceToAgent(audioBlob);
            });

            mediaRecorder.start();
            isRecording = true;
            
            micButton.className = 'mic-button recording';
            micStatusText.textContent = 'Sedang Merakam...';
            micHelperText.textContent = 'Klik mikrofon sekali lagi apabila anda selesai bercakap.';

        } catch (err) {
            console.error('Microphone access denied:', err);
            showError('Gagal mengakses mikrofon. Sila benarkan akses mikrofon di pelayar anda.');
            resetMicButton();
        }
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            isRecording = false;
        }
    }

    function resetMicButton() {
        isRecording = false;
        micButton.className = 'mic-button idle';
        micStatusText.textContent = 'Klik Mikrofon Untuk Mula Bercakap';
        micHelperText.textContent = 'Pastikan anda membenarkan akses mikrofon di pelayar anda.';
    }

    async function sendVoiceToAgent(audioBlob) {
        const currentKey = localStorage.getItem('ilmu_api_key') || '';
        
        micButton.className = 'mic-button processing';
        micStatusText.textContent = 'Memproses...';
        micHelperText.textContent = 'Ejen sedang mendengar (STT) & merangka jawapan (LLM)...';

        const formData = new FormData();
        const ext = audioBlob.type.includes('webm') ? 'webm' : audioBlob.type.includes('ogg') ? 'ogg' : 'wav';
        formData.append('file', audioBlob, `recording.${ext}`);
        formData.append('system_prompt', agentSystemPrompt.value);
        formData.append('voice', agentVoiceSelect.value);
        formData.append('history', JSON.stringify(agentChatHistory));

        try {
            const response = await fetch('/api/voice-agent', {
                method: 'POST',
                headers: {
                    'X-ILMU-API-KEY': currentKey
                },
                body: formData
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Gagal memproses perbualan dengan ejen.');
            }

            const data = await response.json();
            
            // Remove default chat placeholder
            const placeholder = agentChatLog.querySelector('.chat-placeholder');
            if (placeholder) {
                placeholder.remove();
            }

            // Append messages
            appendChatBubble('user', data.user_transcript);
            appendChatBubble('assistant', data.ai_response, data.latency);

            // Add messages to conversation context history
            agentChatHistory.push({ role: 'user', content: data.user_transcript });
            agentChatHistory.push({ role: 'assistant', content: data.ai_response });

            if (data.audio) {
                micButton.className = 'mic-button speaking';
                micStatusText.textContent = 'Ejen Sedang Bertutur...';
                micHelperText.textContent = 'Dengar jawapan perkakasan komputer daripada ejen.';

                playAgentAudio(data.audio);
            } else {
                resetMicButton();
            }

        } catch (err) {
            console.error('Voice Agent connection error:', err);
            showError(err.message);
            resetMicButton();
        }
    }

    function playAgentAudio(base64Audio) {
        try {
            const audioBytes = atob(base64Audio);
            const arrayBuffer = new ArrayBuffer(audioBytes.length);
            const ia = new Uint8Array(arrayBuffer);
            for (let i = 0; i < audioBytes.length; i++) {
                ia[i] = audioBytes.charCodeAt(i);
            }
            const blob = new Blob([arrayBuffer], { type: 'audio/mp3' });
            const url = URL.createObjectURL(blob);
            
            currentAgentAudio = new Audio(url);
            currentAgentAudio.addEventListener('ended', () => {
                resetMicButton();
                currentAgentAudio = null;
            });
            currentAgentAudio.addEventListener('error', (e) => {
                console.error('Audio playback error:', e);
                resetMicButton();
                currentAgentAudio = null;
            });
            currentAgentAudio.play().catch(err => {
                console.warn('Playback blocked by browser auto-play policy:', err);
                micStatusText.textContent = 'Audio Disekat oleh Pelayar';
                micHelperText.textContent = 'Klik butang mikrofon untuk meneruskan perbualan.';
                setTimeout(resetMicButton, 3000);
            });
        } catch (e) {
            console.error('Failed to parse base64 audio:', e);
            resetMicButton();
        }
    }

    function appendChatBubble(role, text, latency = null) {
        const row = document.createElement('div');
        row.className = `chat-row ${role}`;
        
        const sender = document.createElement('div');
        sender.className = 'chat-sender';
        sender.textContent = role === 'user' ? 'Pelanggan' : 'Ejen AI (RiaTech)';
        
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';
        bubble.textContent = text;

        row.appendChild(sender);
        row.appendChild(bubble);

        if (role === 'assistant' && latency) {
            const latencyBadge = document.createElement('div');
            latencyBadge.className = 'latency-badge';
            latencyBadge.innerHTML = `⏱️ ASR: <strong>${latency.asr}s</strong> | LLM: <strong>${latency.llm}s</strong> | TTS: <strong>${latency.tts}s</strong> | Total: <strong>${latency.total}s</strong>`;
            row.appendChild(latencyBadge);
        }

        agentChatLog.appendChild(row);
        agentChatLog.scrollTop = agentChatLog.scrollHeight;
    }

    function clearAgentChat() {
        if (currentAgentAudio) {
            currentAgentAudio.pause();
            currentAgentAudio = null;
        }
        agentChatHistory = [];
        agentChatLog.innerHTML = `
            <div class="chat-placeholder">
                Perbualan anda telah diset semula. Klik mikrofon untuk memulakan perbualan baru.
            </div>
        `;
        resetMicButton();
        hideError();
    }

    micButton.addEventListener('click', toggleRecording);
    clearAgentChatBtn.addEventListener('click', clearAgentChat);
});
