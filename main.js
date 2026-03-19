import { AudioProcessor } from './audio-processor.js';
import { Storage } from './storage.js';

class CorpusBuilder {
    constructor() {
        this.storage = new Storage();
        this.audioProcessor = null;
        this.currentTab = 'listen';
        this.materials = []; // all collected materials (audio + video)
        this.isRecording = false;
        this.recordingStartTime = 0;
        this.currentMaterial = null; // temp storage for current recording
        this.currentAudio = null;
        this.activeAudios = new Set();
        this.APP_VERSION = 'v1.0.0';
        this.projectName = '';
        
        // Film recording
        this.filmStream = null;
        this.filmMediaRecorder = null;
        this.filmChunks = [];
        this.isFilmRecording = false;
        this.filmRecordingStartTime = 0;
        this.whiteBalance = 0;
        
        // Corpus filter
        this.corpusFilter = 'all';
        
        this.init();
        const vEl = document.getElementById('appVersion');
        if (vEl) vEl.textContent = this.APP_VERSION;
    }

    async init() {
        await this.loadSettings();
        await this.loadMaterials();
        this.setupEventListeners();
        await this.initAudioProcessor();
    }

    async initAudioProcessor() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
            });
            this.audioProcessor = new AudioProcessor();
            await this.audioProcessor.init(stream);
            this.audioProcessor.startVisualization();
        } catch (error) {
            console.error('Could not access microphone:', error);
        }
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Pause all playback
        const pauseAllBtn = document.getElementById('pauseAllBtn');
        if (pauseAllBtn) {
            pauseAllBtn.addEventListener('click', () => this.pauseAllPlayback());
        }

        // Listen tab - audio recording
        document.getElementById('recordBtn').addEventListener('click', () => {
            if (this.isRecording) {
                this.stopAudioRecording();
            } else {
                this.startAudioRecording();
            }
        });

        document.getElementById('gainSlider').addEventListener('input', (e) => {
            if (this.audioProcessor) {
                this.audioProcessor.setGain(e.target.value);
            }
            const valueDisplay = document.getElementById('gainValue');
            if (valueDisplay) {
                valueDisplay.textContent = `${e.target.value}x`;
            }
        });

        // Film tab - video recording
        document.getElementById('filmRecordBtn').addEventListener('click', async () => {
            if (this.isFilmRecording) {
                await this.stopFilmRecording();
            } else {
                await this.startFilmRecording();
            }
        });

        // White balance slider
        const whiteBalanceSlider = document.getElementById('whiteBalanceSlider');
        const whiteBalanceValue = document.getElementById('whiteBalanceValue');
        if (whiteBalanceSlider && whiteBalanceValue) {
            whiteBalanceSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value) || 0;
                this.whiteBalance = value;
                whiteBalanceValue.textContent = value.toString();
                this.applyWhiteBalanceToPreview();
            });
        }

        // Material modal
        document.getElementById('saveMaterial').addEventListener('click', () => this.saveMaterial());
        document.getElementById('cancelMaterial').addEventListener('click', () => this.closeMaterialModal());

        document.querySelectorAll('#materialTagPicker .tag-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // Toggle tag on/off with no limit to how many can be active
                btn.classList.toggle('active');
            });
        });

        // Corpus tab
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.corpusFilter = btn.dataset.filter;
                this.renderCorpus();
            });
        });

        document.getElementById('sendToCorpusBtn').addEventListener('click', () => this.showSendCorpusModal());
        document.getElementById('confirmSendCorpus').addEventListener('click', () => this.sendToCorpus());
        document.getElementById('cancelSendCorpus').addEventListener('click', () => {
            document.getElementById('sendCorpusModal').classList.add('hidden');
        });

        // Settings
        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
        document.getElementById('closeSettings').addEventListener('click', () => this.closeSettings());
        
        document.getElementById('projectName').addEventListener('change', async (e) => {
            this.projectName = e.target.value;
            try {
                await this.storage.set('projectName', this.projectName);
            } catch (err) {
                console.error('Failed to save project name:', err);
            }
        });

        document.getElementById('exportDataBtn').addEventListener('click', () => this.exportCorpusData());
        document.getElementById('clearDataBtn').addEventListener('click', () => this.confirmClearData());

        // Confirm modal
        document.getElementById('confirmCancel').addEventListener('click', () => {
            document.getElementById('confirmModal').classList.add('hidden');
        });
    }



    async switchTab(tab) {
        this.currentTab = tab;
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tab}Tab`);
        });

        if (tab === 'corpus') {
            this.renderCorpus();
        } else if (tab === 'film') {
            // Initialize camera when switching to film tab
            if (!this.filmStream) {
                await this.initFilmCamera();
            } else {
                this.applyWhiteBalanceToPreview();
            }
        }
    }

    async startAudioRecording() {
        if (!this.audioProcessor) {
            alert('Microphone not ready. Please refresh the page.');
            return;
        }

        this.isRecording = true;
        this.recordingStartTime = Date.now();

        const recordBtn = document.getElementById('recordBtn');
        const timer = document.getElementById('recordingTimer');

        recordBtn.querySelector('.record-text').textContent = 'STOP RECORDING';
        recordBtn.classList.add('recording');
        timer.classList.remove('hidden');

        // Update timer
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.recordingStartTime;
            const seconds = Math.floor(elapsed / 1000);
            const ms = Math.floor((elapsed % 1000) / 100);
            document.getElementById('timerText').textContent = `${seconds}:${ms < 10 ? '0' : ''}${ms}`;
        }, 100);

        await this.audioProcessor.startRecording();
    }

    async stopAudioRecording() {
        this.isRecording = false;
        clearInterval(this.timerInterval);

        const recordBtn = document.getElementById('recordBtn');
        const timer = document.getElementById('recordingTimer');

        recordBtn.querySelector('.record-text').textContent = 'START RECORDING';
        recordBtn.classList.remove('recording');
        timer.classList.add('hidden');

        const audioBlob = await this.audioProcessor.stopRecording();
        const thumbnail = this.audioProcessor.getCanvasThumbnail();

        this.currentMaterial = {
            type: 'audio',
            blob: audioBlob,
            thumbnail,
            timestamp: Date.now(),
            duration: Date.now() - this.recordingStartTime
        };

        // Auto-save and show modal
        this.showMaterialModal('audio');
    }



    async startFilmRecording() {
        if (!this.filmStream) {
            // Initialize camera if not already running
            await this.initFilmCamera();
        }

        this.isFilmRecording = true;
        this.filmRecordingStartTime = Date.now();
        this.filmChunks = [];

        const recordBtn = document.getElementById('filmRecordBtn');
        const timer = document.getElementById('filmRecordingTimer');

        recordBtn.querySelector('.record-text').textContent = 'STOP RECORDING';
        recordBtn.classList.add('recording');
        timer.classList.remove('hidden');

        this.filmTimerInterval = setInterval(() => {
            const elapsed = Date.now() - this.filmRecordingStartTime;
            const seconds = Math.floor(elapsed / 1000);
            const ms = Math.floor((elapsed % 1000) / 100);
            document.getElementById('filmTimerText').textContent = `${seconds}:${ms < 10 ? '0' : ''}${ms}`;
        }, 100);

        const options = { mimeType: 'video/webm' };
        try {
            this.filmMediaRecorder = new MediaRecorder(this.filmStream, options);
        } catch (e) {
            console.error('Failed to create MediaRecorder with options, trying without:', e);
            this.filmMediaRecorder = new MediaRecorder(this.filmStream);
        }

        this.filmMediaRecorder.ondataavailable = (e) => {
            console.log('Data chunk received:', e.data.size, 'bytes');
            if (e.data && e.data.size > 0) {
                this.filmChunks.push(e.data);
            }
        };

        this.filmMediaRecorder.onstart = () => {
            console.log('MediaRecorder started');
        };

        this.filmMediaRecorder.start(100); // Collect data every 100ms for better reliability
        console.log('Recording started');
    }

    async initFilmCamera() {
        try {
            this.filmStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false // Silent video
            });

            const preview = document.getElementById('filmPreview');
            
            preview.srcObject = this.filmStream;
            preview.classList.remove('hidden');
            this.applyWhiteBalanceToPreview();
            await preview.play();
        } catch (error) {
            console.error('Error accessing camera:', error);
            alert('Could not access camera. Please check permissions.');
        }
    }

    getWhiteBalanceFilter() {
        // Treat control as exposure: -50 = darker, +50 = brighter
        const v = this.whiteBalance || 0;
        if (v === 0) {
            return 'none';
        }

        // Map -50..50 to roughly 0.5x..1.5x brightness
        const brightness = 1 + (v / 100); // -0.5 .. +0.5
        // Small contrast tweak so it feels a bit punchier at higher "exposure"
        const contrast = 1 + (v / 200);   // -0.25 .. +0.25

        return `brightness(${brightness}) contrast(${contrast})`;
    }

    applyWhiteBalanceToPreview() {
        const preview = document.getElementById('filmPreview');
        if (preview) {
            const filter = this.getWhiteBalanceFilter();
            // Use 'none' or a filter string
            preview.style.filter = filter === 'none' ? 'none' : filter;
        }
    }

    async stopFilmRecording() {
        this.isFilmRecording = false;
        clearInterval(this.filmTimerInterval);

        const recordBtn = document.getElementById('filmRecordBtn');
        const timer = document.getElementById('filmRecordingTimer');

        recordBtn.querySelector('.record-text').textContent = 'START RECORDING';
        recordBtn.classList.remove('recording');
        timer.classList.add('hidden');

        if (!this.filmMediaRecorder) {
            console.error('MediaRecorder not initialized');
            return;
        }

        if (this.filmMediaRecorder.state === 'inactive') {
            console.error('MediaRecorder already inactive');
            return;
        }

        return new Promise((resolve) => {
            this.filmMediaRecorder.onstop = async () => {
                try {
                    if (this.filmChunks.length === 0) {
                        console.error('No video data recorded');
                        alert('No video data was captured. Please try again.');
                        resolve();
                        return;
                    }

                    const videoBlob = new Blob(this.filmChunks, { type: 'video/webm' });
                    console.log('Video blob created:', videoBlob.size, 'bytes');

                    // Create thumbnail
                    const thumbnail = await this.createVideoThumbnail(videoBlob);
                    
                    this.currentMaterial = {
                        type: 'video',
                        blob: videoBlob,
                        thumbnail,
                        timestamp: Date.now(),
                        duration: Date.now() - this.filmRecordingStartTime
                    };
                    
                    // Auto-show modal
                    this.showMaterialModal('video');
                    resolve();
                } catch (error) {
                    console.error('Error processing video:', error);
                    alert('Error processing video: ' + error.message);
                    resolve();
                }
            };

            this.filmMediaRecorder.onerror = (e) => {
                console.error('MediaRecorder error:', e);
                alert('Recording error occurred');
                resolve();
            };

            this.filmMediaRecorder.stop();
        });
    }

    async createVideoThumbnail(videoBlob) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(videoBlob);
            video.onloadeddata = () => {
                video.currentTime = 0;
            };
            video.onseeked = () => {
                const canvas = document.getElementById('filmCanvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0);
                resolve(canvas.toDataURL('image/png'));
                URL.revokeObjectURL(video.src);
            };
        });
    }



    showMaterialModal(type) {
        const modal = document.getElementById('materialModal');
        const title = document.getElementById('materialModalTitle');
        
        title.textContent = type === 'audio' ? 'Name Your Audio' : 'Name Your Video';
        modal.classList.remove('hidden');
        
        document.getElementById('materialInput').value = '';
        document.querySelectorAll('#materialTagPicker .tag-btn').forEach(btn => {
            btn.classList.remove('active');
        });
    }

    closeMaterialModal() {
        document.getElementById('materialModal').classList.add('hidden');
    }

    async saveMaterial() {
        const name = document.getElementById('materialInput').value.trim();
        if (!name) {
            alert('Please give your material a name!');
            return;
        }

        const tags = Array.from(document.querySelectorAll('#materialTagPicker .tag-btn.active'))
            .map(btn => btn.dataset.tag);

        const material = {
            ...this.currentMaterial,
            name,
            tags,
            id: Date.now().toString(),
            selected: false
        };

        try {
            await this.storage.saveRecording(material);
            this.materials.push(material);

            this.closeMaterialModal();
            this.currentMaterial = null;
            this.switchTab('corpus');
        } catch (e) {
            console.error('Failed to save material:', e);
            alert('Failed to save material. See console for details.');
        }
    }

    async loadMaterials() {
        try {
            this.materials = await this.storage.getAllRecordings() || [];
        } catch (e) {
            console.error('Failed to load materials:', e);
            this.materials = [];
        }
    }

    async loadSettings() {
        try {
            this.projectName = await this.storage.get('projectName') || '';
            const input = document.getElementById('projectName');
            if (input) input.value = this.projectName;
        } catch (e) {
            console.error('Failed to load settings:', e);
            this.projectName = '';
        }
    }

    renderCorpus() {
        const grid = document.getElementById('corpusGrid');
        const totalEl = document.getElementById('totalItems');
        const selectedEl = document.getElementById('selectedItems');

        if (this.materials.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <p>No materials collected yet!</p>
                    <p>Record audio and video to build your corpus.</p>
                </div>
            `;
            totalEl.textContent = '0 items';
            selectedEl.textContent = '0 selected';
            return;
        }

        // Filter materials
        let filtered = this.materials;
        if (this.corpusFilter === 'audio') {
            filtered = this.materials.filter(m => m.type === 'audio');
        } else if (this.corpusFilter === 'video') {
            filtered = this.materials.filter(m => m.type === 'video');
        } else if (this.corpusFilter === 'selected') {
            filtered = this.materials.filter(m => m.selected);
        }

        grid.innerHTML = filtered.map(mat => {
            return `
            <div class="corpus-item ${mat.selected ? 'selected' : ''}" data-id="${mat.id}">
                ${mat.type === 'audio' ? `
                    <img src="${mat.thumbnail || ''}" alt="${mat.name}" class="corpus-item-media">
                ` : `
                    <img src="${mat.thumbnail || ''}" alt="${mat.name}" class="corpus-item-media">
                `}
                <span class="corpus-item-type">${mat.type === 'audio' ? '🎵 Audio' : '🎬 Video'}</span>
                <div class="corpus-item-content">
                    <h3 class="corpus-item-name">${mat.name}</h3>
                    <div class="corpus-item-tags">
                        ${mat.tags.map(tag => `<span class="tag-chip">${tag}</span>`).join('')}
                    </div>
                    <div class="corpus-item-controls">
                        <button class="btn-play" data-id="${mat.id}">Play</button>
                        <button class="btn-select ${mat.selected ? 'selected' : ''}" data-id="${mat.id}">
                            ${mat.selected ? 'Selected ✓' : 'Select'}
                        </button>
                        <button class="btn-secondary" data-id="${mat.id}" onclick="app.deleteMaterial('${mat.id}')">Delete</button>
                    </div>
                </div>
            </div>
        `;
        }).join('');

        // Update stats
        totalEl.textContent = `${this.materials.length} items`;
        selectedEl.textContent = `${this.materials.filter(m => m.selected).length} selected`;

        // Add event listeners
        grid.querySelectorAll('.btn-play').forEach(btn => {
            btn.addEventListener('click', () => this.playMaterial(btn.dataset.id));
        });

        grid.querySelectorAll('.btn-select').forEach(btn => {
            btn.addEventListener('click', () => this.toggleSelect(btn.dataset.id));
        });
    }

    async playMaterial(id) {
        const material = this.materials.find(m => m.id === id);
        if (!material) return;

        if (this.currentAudio) {
            this.currentAudio.pause();
            URL.revokeObjectURL(this.currentAudio.src);
            this.currentAudio = null;
        }

        const btn = document.querySelector(`.btn-play[data-id="${id}"]`);
        
        if (material.type === 'audio') {
            const url = URL.createObjectURL(material.blob);
            const audio = new Audio(url);
            this.currentAudio = audio;
            this.activeAudios.add(audio);
            if (btn) btn.textContent = 'Playing...';
            
            audio.onended = () => {
                this.activeAudios.delete(audio);
                if (btn) btn.textContent = 'Play';
                this.currentAudio = null;
                URL.revokeObjectURL(url);
            };
            
            audio.onerror = () => {
                console.error('Audio playback error');
                if (btn) btn.textContent = 'Play';
                this.currentAudio = null;
                URL.revokeObjectURL(url);
            };
            
            try {
                await audio.play();
            } catch (error) {
                console.error('Failed to play audio:', error);
                if (btn) btn.textContent = 'Play';
                URL.revokeObjectURL(url);
            }
        } else {
            // For video, create a modal playback
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <h2>${material.name}</h2>
                    <video src="${URL.createObjectURL(material.blob)}" controls autoplay style="width: 100%; max-height: 60vh; border-radius: 12px; background: #000;"></video>
                    <div class="modal-actions">
                        <button class="btn-primary" id="closeVideoModal">Close</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            const closeBtn = modal.querySelector('#closeVideoModal');
            const video = modal.querySelector('video');
            
            const closeModal = () => {
                video.pause();
                URL.revokeObjectURL(video.src);
                modal.remove();
            };
            
            closeBtn.addEventListener('click', closeModal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
            
            video.onended = closeModal;
        }
    }

    pauseAllPlayback() {
        // Pause and clean up all active audio elements
        this.activeAudios.forEach(audio => {
            try {
                audio.pause();
            } catch (e) {
                console.error('Error pausing audio:', e);
            }
        });
        this.activeAudios.clear();

        // Clear currentAudio reference
        if (this.currentAudio) {
            try {
                this.currentAudio.pause();
            } catch (e) {
                console.error('Error pausing current audio:', e);
            }
            this.currentAudio = null;
        }

        // Reset all play buttons back to "Play"
        document.querySelectorAll('.btn-play').forEach(btn => {
            btn.textContent = 'Play';
        });
    }

    async toggleSelect(id) {
        const material = this.materials.find(m => m.id === id);
        if (!material) return;

        material.selected = !material.selected;
        try {
            await this.storage.saveRecording(material);
            this.renderCorpus();
        } catch (e) {
            console.error('Failed to toggle selection:', e);
            material.selected = !material.selected; // Revert
        }
    }

    async deleteMaterial(id) {
        const material = this.materials.find(m => m.id === id);
        if (!material) return;

        document.getElementById('confirmMessage').textContent = `Delete "${material.name}"? This cannot be undone.`;
        const modal = document.getElementById('confirmModal');
        modal.classList.remove('hidden');
        
        document.getElementById('confirmOk').onclick = async () => {
            try {
                await this.storage.deleteRecording(id);
                this.materials = this.materials.filter(m => m.id !== id);
                modal.classList.add('hidden');
                this.renderCorpus();
            } catch (e) {
                console.error('Failed to delete material:', e);
                alert('Failed to delete material.');
            }
        };
    }

    showSendCorpusModal() {
        const selectedMaterials = this.materials.filter(m => m.selected);
        
        if (selectedMaterials.length === 0) {
            alert('Please select at least one material to send to the corpus!');
            return;
        }

        document.getElementById('sendCount').textContent = selectedMaterials.length;
        document.getElementById('sendCorpusModal').classList.remove('hidden');
    }

    async sendToCorpus() {
        const selectedMaterials = this.materials.filter(m => m.selected);
        const progressFill = document.getElementById('progressFill');
        const uploadStatus = document.getElementById('uploadStatus');
        const uploadProgress = document.getElementById('uploadProgress');
        
        uploadProgress.classList.remove('hidden');
        document.getElementById('confirmSendCorpus').disabled = true;

        // Placeholder for future backend integration
        // This is where you would:
        // 1. Upload files to Supabase storage
        // 2. Create metadata records in database
        // 3. Associate with project ID

        for (let i = 0; i < selectedMaterials.length; i++) {
            const material = selectedMaterials[i];
            const progress = ((i + 1) / selectedMaterials.length) * 100;
            
            progressFill.style.width = `${progress}%`;
            uploadStatus.textContent = `Uploading ${material.name} (${i + 1}/${selectedMaterials.length})...`;
            
            // Simulated upload delay
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Future implementation would be something like:
            // const fileUrl = await this.uploadToStorage(material.blob, material.type, material.id);
            // await this.saveMetadata({
            //     projectId: this.projectName,
            //     materialId: material.id,
            //     name: material.name,
            //     type: material.type,
            //     tags: material.tags,
            //     fileUrl: fileUrl,
            //     timestamp: material.timestamp
            // });
        }

        uploadStatus.textContent = 'Upload complete!';
        progressFill.style.width = '100%';
        
        setTimeout(() => {
            document.getElementById('sendCorpusModal').classList.add('hidden');
            uploadProgress.classList.add('hidden');
            document.getElementById('confirmSendCorpus').disabled = false;
            alert(`Successfully sent ${selectedMaterials.length} materials to the corpus!`);
        }, 1000);
    }

    // Placeholder for future Supabase integration
    async uploadToStorage(blob, type, id) {
        // Example structure for Supabase:
        // const { data, error } = await supabase.storage
        //     .from('corpus-materials')
        //     .upload(`${this.projectName}/${type}/${id}.${type === 'audio' ? 'webm' : 'mp4'}`, blob);
        // return data?.path;
        console.log('Upload placeholder:', { type, id, size: blob.size });
        return `placeholder-url-${id}`;
    }

    async saveMetadata(metadata) {
        // Example structure for Supabase:
        // const { data, error } = await supabase
        //     .from('corpus_materials')
        //     .insert([metadata]);
        console.log('Metadata save placeholder:', metadata);
    }

    openSettings() {
        document.getElementById('settingsModal').classList.remove('hidden');
    }

    closeSettings() {
        document.getElementById('settingsModal').classList.add('hidden');
    }

    async exportCorpusData() {
        const selectedMaterials = this.materials.filter(m => m.selected);
        
        if (selectedMaterials.length === 0) {
            alert('No materials selected to export. Please select materials in the Corpus tab first.');
            return;
        }

        const btn = document.getElementById('exportDataBtn');
        const originalText = btn.textContent;
        btn.textContent = 'Generating ZIP...';
        btn.disabled = true;

        try {
            const zip = new JSZip();

            // Create CSV data
            const csvRows = [
                ['Filename', 'Original Name', 'Type', 'Tags', 'Duration (seconds)', 'Date Recorded']
            ];

            // Add all media files and populate CSV
            for (let i = 0; i < selectedMaterials.length; i++) {
                const m = selectedMaterials[i];
                btn.textContent = `Processing ${i + 1}/${selectedMaterials.length}...`;
                
                const safeName = m.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                
                let finalBlob = m.blob;
                let ext = 'webm';
                
                if (m.type === 'audio') {
                    // Convert audio to WAV
                    ext = 'wav';
                    finalBlob = await this.convertToWav(m.blob);
                } else if (m.type === 'video') {
                    // Export video as MP4
                    ext = 'mp4';
                    finalBlob = await this.convertToMp4(m.blob);
                }

                const filename = `${safeName}_${m.id}.${ext}`;
                
                // Add the actual media blob (not thumbnail)
                zip.file(filename, finalBlob);
                
                // Add row to CSV
                csvRows.push([
                    filename,
                    m.name,
                    m.type,
                    (m.tags || []).join('; '),
                    Math.round((m.duration || 0) / 1000),
                    new Date(m.timestamp).toLocaleString()
                ]);
            }

            // Convert CSV rows to CSV string
            const csvContent = csvRows.map(row => 
                row.map(cell => {
                    // Escape quotes and wrap in quotes if contains comma
                    const cellStr = String(cell);
                    if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                        return `"${cellStr.replace(/"/g, '""')}"`;
                    }
                    return cellStr;
                }).join(',')
            ).join('\n');

            // Add CSV to zip
            zip.file('corpus_materials.csv', csvContent);

            btn.textContent = 'Creating ZIP file...';
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `corpus-export-${Date.now()}.zip`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error generating zip:', err);
            alert('Failed to generate zip file: ' + err.message);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    confirmClearData() {
        const modal = document.getElementById('confirmModal');
        document.getElementById('confirmMessage').textContent = 
            'This will delete ALL your materials and settings. This cannot be undone!';
        
        modal.classList.remove('hidden');
        
        document.getElementById('confirmOk').onclick = async () => {
            try {
                await this.storage.clear();
                this.materials = [];
                this.renderCorpus();
                modal.classList.add('hidden');
                alert('All data cleared!');
            } catch (e) {
                console.error('Failed to clear data:', e);
                alert('Failed to clear data.');
            }
        };
    }

    async convertToWav(blob) {
        try {
            const arrayBuffer = await blob.arrayBuffer();
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            const sampleRate = audioBuffer.sampleRate;
            const length = audioBuffer.length;
            const channels = audioBuffer.numberOfChannels;
            
            // Mix down to mono
            const samples = new Float32Array(length);
            for (let c = 0; c < channels; c++) {
                const channelData = audioBuffer.getChannelData(c);
                for (let i = 0; i < length; i++) {
                    samples[i] += channelData[i] / channels;
                }
            }
            
            // Create WAV file
            const buffer = new ArrayBuffer(44 + length * 2);
            const view = new DataView(buffer);
            
            const writeString = (offset, string) => {
                for (let i = 0; i < string.length; i++) {
                    view.setUint8(offset + i, string.charCodeAt(i));
                }
            };
            
            writeString(0, 'RIFF');
            view.setUint32(4, 36 + length * 2, true);
            writeString(8, 'WAVE');
            writeString(12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, sampleRate * 2, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            writeString(36, 'data');
            view.setUint32(40, length * 2, true);
            
            let offset = 44;
            for (let i = 0; i < length; i++) {
                const s = Math.max(-1, Math.min(1, samples[i]));
                view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                offset += 2;
            }
            
            return new Blob([view], { type: 'audio/wav' });
        } catch (error) {
            console.error('Error converting to WAV:', error);
            return blob; // Fallback to original blob
        }
    }

    async convertToMp4(webmBlob) {
        try {
            // Create a video element to re-encode
            const video = document.createElement('video');
            const url = URL.createObjectURL(webmBlob);
            video.src = url;
            
            await new Promise((resolve, reject) => {
                video.onloadedmetadata = resolve;
                video.onerror = reject;
            });

            // Create canvas to capture frames
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');

            // Use MediaRecorder with MP4 if supported
            const stream = canvas.captureStream(30);
            
            // Try MP4 first, fallback to WebM with .mp4 extension as compromise
            let mimeType = 'video/mp4';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                // Most browsers support H.264 in MP4 container via this mime
                mimeType = 'video/webm;codecs=h264';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    // Final fallback - at least it plays everywhere
                    mimeType = 'video/webm;codecs=vp8';
                }
            }

            const recorder = new MediaRecorder(stream, { mimeType });
            const chunks = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            const recordingDone = new Promise((resolve) => {
                recorder.onstop = () => resolve();
            });

            recorder.start();
            video.play();

            // Capture frames
            const filter = this.getWhiteBalanceFilter();
            if (filter && filter !== 'none') {
                ctx.filter = filter;
            } else {
                ctx.filter = 'none';
            }

            const captureFrame = () => {
                if (!video.paused && !video.ended) {
                    ctx.drawImage(video, 0, 0);
                    requestAnimationFrame(captureFrame);
                }
            };
            captureFrame();

            // Wait for video to finish
            await new Promise((resolve) => {
                video.onended = resolve;
            });

            recorder.stop();
            await recordingDone;

            URL.revokeObjectURL(url);

            // Return blob with MP4 mime type regardless of actual codec
            // This ensures better compatibility with desktop players
            return new Blob(chunks, { type: 'video/mp4' });
        } catch (error) {
            console.error('Error converting to MP4:', error);
            // Fallback: just change the mime type and hope for the best
            return new Blob([webmBlob], { type: 'video/mp4' });
        }
    }
}

// Initialize app
const app = new CorpusBuilder();
window.app = app; // Make available globally for inline onclick handlers