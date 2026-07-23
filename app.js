let allData = [];
let filteredData = [];
let modelsList = [];
const itemsPerPage = 24;
let currentPage = 1;

let accuracyChartInstance = null;
let activeItemIndex = null;
let activeItem = null;

function formatClass(className) {
    if (!className) return '';
    return className.replace(/^\d+_/g, '').replace(/_/g, ' ');
}

const AVAILABLE_TAGS = [
    "kartun",
    "buram",
    "salah kategori",
    "ambigu",
    "tidak jelas/keluar konteks",
    "model salah prediksi"
];

document.addEventListener('DOMContentLoaded', () => {
    init();
});

async function init() {
    await Promise.all([
        loadChartData(),
        loadGalleryData()
    ]);
    setupEventListeners();
}

async function loadChartData() {
    try {
        const res = await fetch('/api/chart_data');
        const data = await res.json();
        
        const ctx = document.getElementById('accuracyChart');
        if (!ctx) return;
        
        const accuracyTraces = data.filter(trace => trace.name === 'Akurasi' || trace.legendgroup === 'Akurasi');
        if (accuracyTraces.length === 0) return;

        const models = ['MobileNetV4', 'ResNet18', 'EfficientNet', 'EfficientFormerV2'];
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
        const isMobile = window.innerWidth <= 600;
        
        const datasets = accuracyTraces.map((trace, index) => {
            return {
                label: models[index] || `Model ${index + 1}`,
                data: trace.y,
                borderColor: colors[index % colors.length],
                backgroundColor: colors[index % colors.length],
                tension: 0.3,
                borderWidth: isMobile ? 2 : 3,
                pointRadius: isMobile ? 4 : 6,
                pointHoverRadius: isMobile ? 6 : 8
            };
        });
        
        const labels = accuracyTraces[0].x.map((_, i) => isMobile ? `${i + 1}` : `Iterasi ${i + 1}`);

        Chart.defaults.color = '#94a3b8';
        Chart.defaults.font.family = "'Outfit', sans-serif";

        accuracyChartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'nearest', axis: 'xy', intersect: true },
                plugins: {
                    legend: { labels: { color: '#f8fafc' } },
                    tooltip: { mode: 'nearest', intersect: true }
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' } }
                },
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const element = elements[0];
                        const chunkIndex = element.index + 1;
                        const datasetIndex = element.datasetIndex;
                        const modelName = models[datasetIndex];
                        
                        document.getElementById('chunkFilter').value = chunkIndex;
                        document.getElementById('modelFilter').value = modelName;
                        applyFilters();
                        
                        document.querySelector('.filters-section').scrollIntoView({ behavior: 'smooth' });
                    }
                }
            }
        });
    } catch (e) {
        console.error("Error loading chart data", e);
    }
}

async function loadGalleryData() {
    try {
        const res = await fetch('/api/gallery_data');
        const json = await res.json();
        
        allData = json.data;
        modelsList = json.models;
        filteredData = [...allData];
        
        populateFilters();
        renderGallery();
        
    } catch (e) {
        console.error("Error loading gallery data", e);
        document.getElementById('image-gallery').innerHTML = `<div class="loading-state">Gagal memuat data.</div>`;
    }
}

function populateFilters() {
    const chunkSelect = document.getElementById('chunkFilter');
    const chunks = new Set();
    allData.forEach(d => d.chunks.forEach(c => chunks.add(c)));
    Array.from(chunks).sort((a,b)=>a-b).forEach(c => {
        chunkSelect.add(new Option(`Iterasi ${c}`, c));
    });

    const modelSelect = document.getElementById('modelFilter');
    modelsList.forEach(m => {
        modelSelect.add(new Option(m, m));
    });

    const catSelect = document.getElementById('categoryFilter');
    const wpSelect = document.getElementById('wrongPredictionFilter');
    const categories = new Set();
    allData.forEach(d => categories.add(d.true_class));
    catSelect.add(new Option('Semua Kategori', 'all'));
    Array.from(categories).sort().forEach(c => {
        catSelect.add(new Option(formatClass(c), c));
        wpSelect.add(new Option(formatClass(c), c));
    });
    
    const skSelect = document.getElementById('salah-kategori-select');
    skSelect.innerHTML = '<option value="">-- Pilih --</option>';
    Array.from(categories).sort().forEach(c => {
        skSelect.add(new Option(formatClass(c), c));
    });
    
    const specificTagSelect = document.getElementById('specificTagFilter');
    AVAILABLE_TAGS.forEach(t => {
        specificTagSelect.add(new Option(t, t));
    });
}

function setupEventListeners() {
    const filters = ['searchFilter', 'modelFilter', 'chunkFilter', 'categoryFilter', 'statusFilter', 'errorCountFilter', 'wrongPredictionFilter', 'tagFilter', 'specificTagFilter', 'sortFilter'];
    filters.forEach(id => {
        document.getElementById(id).addEventListener(id === 'searchFilter' ? 'input' : 'change', applyFilters);
    });
    
    document.getElementById('statusFilter').addEventListener('change', (e) => {
        const isWrong = e.target.value === 'wrong';
        document.getElementById('errorCountGroup').style.display = isWrong ? 'flex' : 'none';
        document.getElementById('wrongPredictionGroup').style.display = isWrong ? 'flex' : 'none';
    });
    
    document.getElementById('tagFilter').addEventListener('change', (e) => {
        document.getElementById('specificTagGroup').style.display = (e.target.value === 'tagged') ? 'flex' : 'none';
    });

    document.getElementById('prevBtn').addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; renderGallery(); window.scrollTo({top: 0}); }
    });
    document.getElementById('nextBtn').addEventListener('click', () => {
        if (currentPage * itemsPerPage < filteredData.length) { currentPage++; renderGallery(); window.scrollTo({top: 0}); }
    });
    
    document.querySelector('.close-modal').addEventListener('click', () => document.getElementById('image-modal').classList.remove('active'));
    
    document.getElementById('modal-prev-btn').addEventListener('click', prevImage);
    document.getElementById('modal-next-btn').addEventListener('click', nextImage);
    
    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('image-modal');
        if (modal.classList.contains('active')) {
            if (e.key === 'ArrowRight') nextImage();
            if (e.key === 'ArrowLeft') prevImage();
            if (e.key === 'Escape') modal.classList.remove('active');
        }
    });

    document.getElementById('image-modal').addEventListener('click', (e) => {
        if (e.target.id === 'image-modal') {
            e.target.classList.remove('active');
        }
    });
}

function nextImage() {
    if (activeItemIndex !== null && activeItemIndex < filteredData.length - 1) {
        openModal(filteredData[activeItemIndex + 1]);
    }
}

function prevImage() {
    if (activeItemIndex !== null && activeItemIndex > 0) {
        openModal(filteredData[activeItemIndex - 1]);
    }
}

function applyFilters() {
    const search = document.getElementById('searchFilter').value.toLowerCase();
    const model = document.getElementById('modelFilter').value;
    const chunk = document.getElementById('chunkFilter').value;
    const cat = document.getElementById('categoryFilter').value;
    const status = document.getElementById('statusFilter').value;
    const minErr = document.getElementById('errorCountFilter').value;
    const wpFilter = document.getElementById('wrongPredictionFilter').value;
    const tag = document.getElementById('tagFilter').value;
    const specificTag = document.getElementById('specificTagFilter').value;
    const sortVal = document.getElementById('sortFilter').value;
    
    filteredData = allData.filter(d => {
        if (search && !d.file_path.toLowerCase().includes(search)) return false;
        if (cat !== 'all' && d.true_class !== cat) return false;
        if (chunk !== 'all' && !d.chunks.includes(parseInt(chunk))) return false;
        if (tag === 'tagged' && d.tags.length === 0) return false;
        if (tag === 'untagged' && d.tags.length > 0) return false;
        if (tag === 'tagged' && specificTag !== 'all' && !d.tags.includes(specificTag)) return false;
        if (status === 'wrong' && minErr !== 'all' && d.error_count < parseInt(minErr)) return false;

        let isModelWrong = false;
        let isModelEvaluated = false;
        let hasSelectedWrongPrediction = false;
        
        if (model !== 'all') {
            const preds = d.predictions[model] || [];
            const relevantPreds = chunk === 'all' ? preds : preds.filter(p => p.chunk === parseInt(chunk));
            if (relevantPreds.length > 0) isModelEvaluated = true;
            if (relevantPreds.some(p => p.status === 'wrong')) isModelWrong = true;
            
            if (wpFilter !== 'all') {
                if (relevantPreds.some(p => p.status === 'wrong' && p.predicted_class === wpFilter)) {
                    hasSelectedWrongPrediction = true;
                }
            } else {
                hasSelectedWrongPrediction = true;
            }
        } else {
            isModelEvaluated = true;
            isModelWrong = d.error_count > 0;
            
            if (wpFilter !== 'all') {
                for (const m in d.predictions) {
                    const preds = d.predictions[m];
                    const relevantPreds = chunk === 'all' ? preds : preds.filter(p => p.chunk === parseInt(chunk));
                    if (relevantPreds.some(p => p.status === 'wrong' && p.predicted_class === wpFilter)) {
                        hasSelectedWrongPrediction = true;
                        break;
                    }
                }
            } else {
                hasSelectedWrongPrediction = true;
            }
        }
        
        if (status === 'wrong' && !isModelWrong) return false;
        if (status === 'correct' && isModelWrong) return false;
        if (status === 'wrong' && !hasSelectedWrongPrediction) return false;
        
        return true;
    });

    filteredData.sort((a, b) => {
        if (sortVal === 'name_asc') {
            return a.file_path.localeCompare(b.file_path);
        } else if (sortVal === 'name_desc') {
            return b.file_path.localeCompare(a.file_path);
        } else if (sortVal === 'errors_desc') {
            if (b.error_count === a.error_count) return a.file_path.localeCompare(b.file_path);
            return b.error_count - a.error_count;
        } else if (sortVal === 'errors_asc') {
            if (b.error_count === a.error_count) return a.file_path.localeCompare(b.file_path);
            return a.error_count - b.error_count;
        }
        return 0;
    });
    
    currentPage = 1;
    renderGallery();
}

function renderGallery() {
    const gallery = document.getElementById('image-gallery');
    gallery.innerHTML = '';
    
    document.getElementById('statsDisplay').textContent = `Menampilkan ${filteredData.length} file`;
    
    if (filteredData.length === 0) {
        gallery.innerHTML = '<div class="loading-state">Tidak ada gambar yang cocok dengan filter Anda.</div>';
        updatePagination();
        return;
    }
    
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageData = filteredData.slice(start, end);
    
    pageData.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        
        let modelsHtml = '';
        const selectedModel = document.getElementById('modelFilter').value;
        const selectedChunk = document.getElementById('chunkFilter').value;
        const isMobile = window.innerWidth <= 600;
        
        modelsList.forEach(m => {
            const preds = item.predictions[m] || [];
            // If the user filtered by chunk, show prediction for that chunk, else summarize all chunks
            const relevantPreds = selectedChunk === 'all' ? preds : preds.filter(p => p.chunk === parseInt(selectedChunk));
            
            const isWrong = relevantPreds.some(p => p.status === 'wrong');
            
            if (isMobile) {
                // Ultra-compact abbreviations for the card view
                const shortName = m.replace('EfficientFormerV2', 'EF2')
                                   .replace('EfficientNet', 'EN')
                                   .replace('MobileNetV4', 'MN4')
                                   .replace('ResNet18', 'RN18');
                
                if (isWrong) {
                    modelsHtml += `<span style="font-size:0.65rem; padding: 2px 4px; border-radius: 4px; background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); white-space: nowrap;">${shortName} ❌</span>`;
                } else if (preds.length > 0) {
                    modelsHtml += `<span style="font-size:0.65rem; padding: 2px 4px; border-radius: 4px; background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); white-space: nowrap;">${shortName} ✅</span>`;
                }
            } else {
                // Detailed view for desktop
                const wrongPreds = relevantPreds.filter(p => p.status === 'wrong');
                if (isWrong) {
                    const uniqueWrongs = [...new Set(wrongPreds.map(p => formatClass(p.predicted_class)))].join(', ');
                    modelsHtml += `
                        <li class="model-item">
                            <span>${m}</span>
                            <span class="pred-wrong">❌ ${uniqueWrongs}</span>
                        </li>
                    `;
                } else if (preds.length > 0) {
                    modelsHtml += `
                        <li class="model-item">
                            <span>${m}</span>
                            <span class="pred-right">✅ ${formatClass(item.true_class)}</span>
                        </li>
                    `;
                }
            }
        });
        
        let tagsHtml = item.tags.map(t => `<span class="badge badge-tag">${t}</span>`).join('');

        let catColor = '#94a3b8'; // default
        let catBg = 'rgba(148, 163, 184, 0.2)';
        const lowerCat = item.true_class.toLowerCase();
        if (lowerCat.includes('recyclable')) {
            catColor = '#f59e0b'; // yellow
            catBg = 'rgba(245, 158, 11, 0.2)';
        } else if (lowerCat.includes('organic')) {
            catColor = '#10b981'; // green
            catBg = 'rgba(16, 185, 129, 0.2)';
        } else if (lowerCat.includes('electronic')) {
            catColor = '#3b82f6'; // blue
            catBg = 'rgba(59, 130, 246, 0.2)';
        }

        const fileName = item.file_path.split('/').pop();

        card.innerHTML = `
            <img src="../${item.display_path}" class="card-img" alt="Image" loading="lazy">
            <div class="card-content">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem; flex-wrap:wrap; gap:5px;">
                    <div style="display:flex; gap:5px; flex-wrap:wrap;">
                        <span class="badge" style="background:${catBg}; color:${catColor}; border:1px solid ${catBg}">${formatClass(item.true_class)}</span>
                        <span class="badge badge-error">${item.error_count} Kesalahan</span>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 5px;">Iterasi: ${item.chunks.join(', ')}</div>
                </div>
                <h3 class="true-class" style="word-break: break-all; margin: 5px 0;">${fileName}</h3>
                ${isMobile ? `
                <div style="display:flex; gap: 4px; flex-wrap:wrap; margin-top: 10px;">
                    ${modelsHtml}
                </div>` : `
                <ul class="model-list">
                    ${modelsHtml}
                </ul>`}
                <div id="tags-${CSS.escape(item.file_path)}" style="margin-top: 0.5rem; display:flex; flex-wrap:wrap;">
                    ${tagsHtml}
                </div>
            </div>
        `;
        
        card.addEventListener('click', () => openModal(item));
        gallery.appendChild(card);
    });
    
    updatePagination();
}

function updatePagination() {
    const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
    document.getElementById('page-info').textContent = `Halaman ${currentPage} dari ${totalPages}`;
    document.getElementById('prevBtn').disabled = currentPage === 1;
    document.getElementById('nextBtn').disabled = currentPage === totalPages;
}

function openModal(item) {
    activeItem = item;
    activeItemIndex = filteredData.findIndex(d => d.file_path === item.file_path);
    
    const modal = document.getElementById('image-modal');
    document.getElementById('modal-image').src = '../' + item.display_path;
    
    let modelsHtml = '';
    modelsList.forEach(m => {
        const preds = item.predictions[m] || [];
        const isWrong = preds.some(p => p.status === 'wrong');
        const wrongPreds = preds.filter(p => p.status === 'wrong');
        
        // Shorten long model names for compactness
        const shortName = m.replace('Efficient', 'Eff').replace('MobileNet', 'MobNet');
        
        if (isWrong) {
            const uniqueWrongs = [...new Set(wrongPreds.map(p => formatClass(p.predicted_class)))].join(', ');
            modelsHtml += `
                <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 4px; padding: 4px 8px; font-size: 0.8rem; white-space: nowrap;">
                    <strong style="color: #cbd5e1;">${shortName}:</strong> <span class="pred-wrong">❌ ${uniqueWrongs}</span>
                </div>
            `;
        } else if (preds.length > 0) {
            modelsHtml += `
                <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 4px; padding: 4px 8px; font-size: 0.8rem; white-space: nowrap;">
                    <strong style="color: #cbd5e1;">${shortName}:</strong> <span class="pred-right">✅ Benar</span>
                </div>
            `;
        }
    });

    let catColor = '#94a3b8'; // default
    let catBg = 'rgba(148, 163, 184, 0.2)';
    const lowerCat = item.true_class.toLowerCase();
    if (lowerCat.includes('recyclable')) {
        catColor = '#f59e0b'; catBg = 'rgba(245, 158, 11, 0.2)';
    } else if (lowerCat.includes('organic')) {
        catColor = '#10b981'; catBg = 'rgba(16, 185, 129, 0.2)';
    } else if (lowerCat.includes('electronic')) {
        catColor = '#3b82f6'; catBg = 'rgba(59, 130, 246, 0.2)';
    }

    document.getElementById('modal-info').innerHTML = `
        <h2 style="margin:0 0 0.5rem 0; font-size: 1.5rem; word-break: break-all;">${item.file_path.split('/').pop()}</h2>
        <div style="display:flex; gap:5px; flex-wrap:wrap; margin-bottom: 10px;">
            <span class="badge" style="background:${catBg}; color:${catColor}; border:1px solid ${catBg}">${formatClass(item.true_class)}</span>
            <span class="badge badge-error">${item.error_count} Kesalahan</span>
        </div>
        <div style="color:var(--text-muted); font-size:0.9rem; margin-bottom:0.5rem;">Path: ${item.file_path}</div>
        <div style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1rem;">Dievaluasi pada Iterasi: ${item.chunks.join(', ')}</div>
        <div style="margin-bottom: 15px; width: 100%;">
            <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                ${modelsHtml}
            </div>
        </div>
    `;
    
    // Update navigation buttons
    document.getElementById('modal-prev-btn').style.opacity = (activeItemIndex > 0) ? '1' : '0.2';
    document.getElementById('modal-prev-btn').style.cursor = (activeItemIndex > 0) ? 'pointer' : 'not-allowed';
    
    document.getElementById('modal-next-btn').style.opacity = (activeItemIndex < filteredData.length - 1) ? '1' : '0.2';
    document.getElementById('modal-next-btn').style.cursor = (activeItemIndex < filteredData.length - 1) ? 'pointer' : 'not-allowed';

    renderModalTags();
    modal.classList.add('active');
}

function renderModalTags() {
    const container = document.getElementById('modal-tags');
    container.innerHTML = '';
    
    const skContainer = document.getElementById('salah-kategori-container');
    skContainer.style.display = 'none';
    
    AVAILABLE_TAGS.forEach(tag => {
        const btn = document.createElement('button');
        const hasTag = activeItem.tags.some(t => t === tag || t.startsWith(tag + ':'));
        
        btn.className = `tag-btn ${hasTag ? 'active' : ''}`;
        btn.textContent = tag;
        
        btn.onclick = async () => {
            if (tag === 'salah kategori' && !hasTag) {
                skContainer.style.display = 'block';
                document.getElementById('salah-kategori-save').onclick = async () => {
                    const sel = document.getElementById('salah-kategori-select').value;
                    if (!sel) return;
                    await toggleTag(activeItem, `salah kategori: ${sel}`, true);
                    skContainer.style.display = 'none';
                    renderModalTags();
                };
            } else {
                const exactTag = activeItem.tags.find(t => t === tag || t.startsWith(tag + ':')) || tag;
                await toggleTag(activeItem, exactTag, !hasTag);
                renderModalTags();
            }
        };
        container.appendChild(btn);
    });
}

async function toggleTag(item, tag, isAdding) {
    try {
        const res = await fetch('/api/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_path: item.file_path,
                tag: tag,
                action: isAdding ? 'add' : 'remove'
            })
        });
        
        const json = await res.json();
        if (json.success) {
            item.tags = json.tags;
            item.display_path = json.display_path;
            
            document.getElementById('modal-image').src = '../' + item.display_path;
            
            const cardTags = document.getElementById(`tags-${CSS.escape(item.file_path)}`);
            if (cardTags) {
                cardTags.innerHTML = item.tags.map(t => `<span class="badge badge-tag">${t}</span>`).join('');
                cardTags.parentElement.previousElementSibling.src = '../' + item.display_path;
            }
        } else {
             alert('Kesalahan: ' + json.error);
        }
    } catch (e) {
        console.error(e);
        alert('Gagal memperbarui tag');
    }
}
