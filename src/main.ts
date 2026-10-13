import './style.css';
import {
  createIcons,
  UploadCloud,
  FolderDown,
  Download,
  Play,
  CheckCircle2,
  FileText,
  Search,
  Copy,
  Eye,
  X,
  Sparkles,
  Folder,
  Layers,
  Euro,
  Building2,
  ArrowRight,
} from 'lucide';
import { convertCsvToXap, type ConverterResult, type XapFile } from './converter';
import {
  createZipBlob,
  triggerDownload,
  downloadSingleXap,
  saveDirectlyToFolder,
  isFileSystemAccessSupported,
} from './exportUtils';

function refreshIcons() {
  createIcons({
    icons: {
      UploadCloud,
      FolderDown,
      Download,
      Play,
      CheckCircle2,
      FileText,
      Search,
      Copy,
      Eye,
      X,
      Sparkles,
      Folder,
      Layers,
      Euro,
      Building2,
      ArrowRight,
    },
  });
}

// App State
let selectedFile: { name: string; content: string; size: number } | null = null;
let currentResult: ConverterResult | null = null;
let activeModalFile: XapFile | null = null;

const appEl = document.querySelector<HTMLDivElement>('#app')!;

appEl.innerHTML = `
  <div class="app-container">
    <!-- Header -->
    <header class="app-header">
      <div class="brand-badge">
        <span class="pulse-dot"></span>
        Enterprise Renewal Package Generator
      </div>
      <h1 class="app-title">CSV to XAP Package Converter</h1>
      <p class="app-subtitle">
        Drop renewal detail CSV reports to automatically parse, group by quote, and generate complete
        Exchange Arrow Proposal (.xap) folder packages.
      </p>
    </header>

    <!-- Upload & Configuration Card -->
    <main class="glass-card">
      <!-- Drag & Drop Zone -->
      <div class="dropzone-container" id="drop-zone" role="region" aria-label="CSV Upload Zone">
        <input type="file" id="file-input" accept=".csv" style="display: none;" />
        
        <div class="dropzone-icon-wrapper">
          <i data-lucide="upload-cloud" style="width: 36px; height: 36px;"></i>
        </div>

        <h3 class="dropzone-title" id="dropzone-text">Drop your renewal CSV file here</h3>
        <p class="dropzone-desc">Accepts .csv files (e.g. RenQuotedetailRpt.csv)</p>

        <div class="dropzone-actions">
          <button type="button" class="btn-browse" id="btn-browse">
            <i data-lucide="file-text" style="width: 16px; height: 16px;"></i>
            Browse Local File
          </button>
          <button type="button" class="btn-sample" id="btn-sample" title="Test immediately with RenQuotedetailRpt (3).csv">
            <i data-lucide="sparkles" style="width: 16px; height: 16px;"></i>
            Test with Sample File
          </button>
        </div>

        <div id="file-selected-info" style="display: none;"></div>
      </div>

      <!-- Conversion Settings -->
      <div class="options-bar">
        <div class="form-group">
          <label class="form-label" for="header-row">
            CSV Header Row
            <span class="form-label-tip">Row 8 is standard for IBM reports</span>
          </label>
          <input type="number" id="header-row" class="form-input" value="8" min="1" max="50" />
        </div>

        <div class="form-group">
          <label class="form-label" for="conversion-mode">
            Processing Engine
            <span class="form-label-tip">Algorithm mode</span>
          </label>
          <select id="conversion-mode" class="form-select">
            <option value="legacy" selected>Exact Legacy Mode (39 XAP files 100% bit-for-bit)</option>
            <option value="strict">Strict RFC-4180 Mode (Robust Quoted Parser)</option>
          </select>
        </div>
      </div>

      <!-- Action Button -->
      <button class="btn-primary-action" id="btn-process" disabled>
        <i data-lucide="play" style="width: 20px; height: 20px;"></i>
        Generate XAP Package
      </button>

      <!-- Progress Section -->
      <div class="progress-section" id="progress-section">
        <div class="progress-track">
          <div class="progress-fill" id="progress-fill"></div>
        </div>
        <div class="progress-info">
          <span id="progress-status-text">Processing...</span>
          <span id="progress-percent-text">0%</span>
        </div>
      </div>

      <!-- Log Console -->
      <div class="log-console" id="log-console" style="display: none;"></div>
    </main>

    <!-- Results Section (Visible after generation) -->
    <section class="results-container" id="results-section">
      <!-- Package Header & Export CTAs -->
      <div class="package-header-card">
        <div class="package-title-meta">
          <div class="folder-icon-large">
            <i data-lucide="folder" style="width: 32px; height: 32px;"></i>
          </div>
          <div>
            <div class="package-name" id="result-folder-name">RenQuotedetailRpt_xap_package</div>
            <div class="package-subtitle">Ready to export as a real folder or download as ZIP</div>
          </div>
        </div>

        <div class="package-export-actions">
          <button type="button" class="btn-export-folder" id="btn-export-folder">
            <i data-lucide="folder-down" style="width: 18px; height: 18px;"></i>
            Save to Local Folder
          </button>
          <button type="button" class="btn-export-zip" id="btn-export-zip">
            <i data-lucide="download" style="width: 18px; height: 18px;"></i>
            Download ZIP (.zip)
          </button>
        </div>
      </div>

      <!-- Summary Stats Grid -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon purple">
            <i data-lucide="layers" style="width: 24px; height: 24px;"></i>
          </div>
          <div>
            <div class="stat-val" id="stat-quotes-count">0</div>
            <div class="stat-label">Generated XAP Files</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon blue">
            <i data-lucide="file-text" style="width: 24px; height: 24px;"></i>
          </div>
          <div>
            <div class="stat-val" id="stat-lines-count">0</div>
            <div class="stat-label">Renewal Line Items</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon green">
            <i data-lucide="euro" style="width: 24px; height: 24px;"></i>
          </div>
          <div>
            <div class="stat-val" id="stat-total-amount">€0.00</div>
            <div class="stat-label">Total Volume Value</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon cyan">
            <i data-lucide="building-2" style="width: 24px; height: 24px;"></i>
          </div>
          <div>
            <div class="stat-val" id="stat-customers-count">0</div>
            <div class="stat-label">Unique Organizations</div>
          </div>
        </div>
      </div>

      <!-- File Explorer Card -->
      <div class="glass-card">
        <div class="explorer-header">
          <h2 class="explorer-title">
            <i data-lucide="folder" style="width: 20px; height: 20px; color: #818cf8;"></i>
            Package Files Explorer
          </h2>
          <div class="search-box">
            <i data-lucide="search" style="width: 16px; height: 16px;"></i>
            <input type="text" id="file-search-input" placeholder="Search by Quote ID, company or file..." />
          </div>
        </div>

        <div class="table-wrapper">
          <table class="files-table">
            <thead>
              <tr>
                <th>File Name (.xap)</th>
                <th>Quote Number</th>
                <th>Customer / End User</th>
                <th>Lines</th>
                <th>Total Sum</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody id="files-table-body">
              <!-- Dynamically populated rows -->
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Code Preview Modal -->
    <div class="modal-overlay" id="preview-modal">
      <div class="modal-content">
        <div class="modal-header">
          <span class="modal-title" id="modal-file-title">File Preview</span>
          <button type="button" class="btn-icon-action" id="modal-close-btn" aria-label="Close modal">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>
        <div class="modal-body">
          <pre class="code-viewer" id="modal-code-viewer"></pre>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-browse" id="modal-copy-btn">
            <i data-lucide="copy" style="width: 16px; height: 16px;"></i>
            Copy Content
          </button>
          <button type="button" class="btn-browse" id="modal-download-btn">
            <i data-lucide="download" style="width: 16px; height: 16px;"></i>
            Download File
          </button>
        </div>
      </div>
    </div>

    <!-- Toast Notifications Container -->
    <div class="toast-container" id="toast-container"></div>
  </div>
`;

refreshIcons();

// Elements
const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const btnBrowse = document.getElementById('btn-browse') as HTMLButtonElement;
const btnSample = document.getElementById('btn-sample') as HTMLButtonElement;
const fileSelectedInfo = document.getElementById('file-selected-info') as HTMLDivElement;
const headerRowInput = document.getElementById('header-row') as HTMLInputElement;
const modeSelect = document.getElementById('conversion-mode') as HTMLSelectElement;
const btnProcess = document.getElementById('btn-process') as HTMLButtonElement;
const progressSection = document.getElementById('progress-section') as HTMLDivElement;
const progressFill = document.getElementById('progress-fill') as HTMLDivElement;
const progressStatusText = document.getElementById('progress-status-text') as HTMLSpanElement;
const progressPercentText = document.getElementById('progress-percent-text') as HTMLSpanElement;
const logConsole = document.getElementById('log-console') as HTMLDivElement;
const resultsSection = document.getElementById('results-section') as HTMLElement;
const resultFolderName = document.getElementById('result-folder-name') as HTMLDivElement;
const btnExportFolder = document.getElementById('btn-export-folder') as HTMLButtonElement;
const btnExportZip = document.getElementById('btn-export-zip') as HTMLButtonElement;
const statQuotesCount = document.getElementById('stat-quotes-count') as HTMLDivElement;
const statLinesCount = document.getElementById('stat-lines-count') as HTMLDivElement;
const statTotalAmount = document.getElementById('stat-total-amount') as HTMLDivElement;
const statCustomersCount = document.getElementById('stat-customers-count') as HTMLDivElement;
const fileSearchInput = document.getElementById('file-search-input') as HTMLInputElement;
const filesTableBody = document.getElementById('files-table-body') as HTMLTableSectionElement;
const previewModal = document.getElementById('preview-modal') as HTMLDivElement;
const modalFileTitle = document.getElementById('modal-file-title') as HTMLSpanElement;
const modalCodeViewer = document.getElementById('modal-code-viewer') as HTMLElement;
const modalCloseBtn = document.getElementById('modal-close-btn') as HTMLButtonElement;
const modalCopyBtn = document.getElementById('modal-copy-btn') as HTMLButtonElement;
const modalDownloadBtn = document.getElementById('modal-download-btn') as HTMLButtonElement;
const toastContainer = document.getElementById('toast-container') as HTMLDivElement;

// Toast Helper
function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${message}</span>
  `;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Log Helper
function addLog(text: string, type: 'info' | 'success' | 'error' = 'info') {
  logConsole.style.display = 'flex';
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  const now = new Date().toLocaleTimeString();
  line.innerHTML = `<span class="log-time">[${now}]</span> <span>${text}</span>`;
  logConsole.appendChild(line);
  logConsole.scrollTop = logConsole.scrollHeight;
}

// Update Selected File
function setFile(name: string, content: string, size: number) {
  selectedFile = { name, content, size };
  const sizeFormatted = (size / 1024).toFixed(1) + ' KB';
  fileSelectedInfo.style.display = 'inline-flex';
  fileSelectedInfo.className = 'file-selected-badge';
  fileSelectedInfo.innerHTML = `
    <i data-lucide="check-circle-2" style="width: 18px; height: 18px; color: #34d399;"></i>
    <span><strong>${name}</strong> (${sizeFormatted}) loaded</span>
  `;
  btnProcess.disabled = false;
  refreshIcons();
  addLog(`Loaded file: ${name} (${sizeFormatted})`, 'info');
}

// Browse Button
btnBrowse.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      setFile(file.name, reader.result as string, file.size);
    };
    reader.readAsText(file);
  }
});

// Drag and drop events
dropZone.addEventListener('click', () => {
  fileInput.click();
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('is-dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('is-dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('is-dragover');
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
    const file = e.dataTransfer.files[0];
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      showToast('Please upload a .csv file', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFile(file.name, reader.result as string, file.size);
    };
    reader.readAsText(file);
  }
});

// Test with sample file button
btnSample.addEventListener('click', async (e) => {
  e.stopPropagation();
  try {
    addLog('Fetching sample RenQuotedetailRpt (3).csv...', 'info');
    const resp = await fetch('/sample.csv');
    if (!resp.ok) {
      throw new Error(`Failed to load sample CSV: ${resp.statusText}`);
    }
    const text = await resp.text();
    setFile('RenQuotedetailRpt (3).csv', text, text.length);
    showToast('Loaded sample RenQuotedetailRpt (3).csv successfully!', 'success');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`Error loading sample: ${msg}`, 'error');
    addLog(`Error: ${msg}`, 'error');
  }
});

// Process Button
btnProcess.addEventListener('click', async () => {
  if (!selectedFile) return;

  btnProcess.disabled = true;
  progressSection.style.display = 'block';
  progressFill.style.width = '15%';
  progressPercentText.textContent = '15%';
  progressStatusText.textContent = 'Parsing CSV header and records...';

  addLog('Starting conversion process...', 'info');

  try {
    const headerRow = parseInt(headerRowInput.value, 10) || 8;
    const metadataRows = Math.max(0, headerRow - 1);
    const mode = (modeSelect.value as 'legacy' | 'strict') || 'legacy';

    await new Promise((r) => setTimeout(r, 200));
    progressFill.style.width = '45%';
    progressPercentText.textContent = '45%';
    progressStatusText.textContent = 'Transforming line items to Exchange Arrow Proposal format...';

    const result = convertCsvToXap(selectedFile.content, selectedFile.name, {
      metadataRows,
      mode,
    });

    await new Promise((r) => setTimeout(r, 250));
    progressFill.style.width = '85%';
    progressPercentText.textContent = '85%';
    progressStatusText.textContent = 'Structuring folder package...';

    currentResult = result;

    await new Promise((r) => setTimeout(r, 200));
    progressFill.style.width = '100%';
    progressPercentText.textContent = '100%';
    progressStatusText.textContent = 'Completed successfully!';

    addLog(
      `Conversion complete: ${result.files.length} XAP files generated for folder "${result.folderName}"`,
      'success'
    );
    showToast(`Successfully generated ${result.files.length} .xap files!`, 'success');

    renderResults(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    addLog(`Conversion error: ${msg}`, 'error');
    showToast(`Error: ${msg}`, 'error');
    progressFill.style.background = '#ef4444';
    progressStatusText.textContent = `Failed: ${msg}`;
  } finally {
    btnProcess.disabled = false;
  }
});

// Render Results View
function renderResults(res: ConverterResult) {
  resultsSection.style.display = 'flex';
  resultFolderName.textContent = res.folderName;

  statQuotesCount.textContent = String(res.summary.totalQuotes);
  statLinesCount.textContent = String(res.summary.totalLineItems);
  statTotalAmount.textContent = `${res.summary.currency} ${res.summary.totalAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  const uniqueCustomers = new Set(res.files.map((f) => f.customer));
  statCustomersCount.textContent = String(uniqueCustomers.size);

  renderFilesTable(res.files);
  refreshIcons();

  // Scroll smoothly to results
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Render Files Table
function renderFilesTable(files: XapFile[]) {
  filesTableBody.innerHTML = '';

  if (files.length === 0) {
    filesTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-dim); padding: 2rem;">
          No matching .xap files found.
        </td>
      </tr>
    `;
    return;
  }

  files.forEach((file) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <span class="file-name-cell">
          <i data-lucide="file-text" style="width: 15px; height: 15px; color: #818cf8;"></i>
          ${file.name}
        </span>
      </td>
      <td>
        <span class="quote-tag">${file.quoteNumber}</span>
      </td>
      <td>
        <strong style="color: #f1f5f9;">${file.customer}</strong>
        ${
          file.endUserAddress && file.endUserAddress !== file.customer
            ? `<div style="font-size: 0.75rem; color: var(--text-dim);">${file.endUserAddress}</div>`
            : ''
        }
      </td>
      <td>${file.lineCount} item${file.lineCount === 1 ? '' : 's'}</td>
      <td>
        <span class="badge-amount">${file.currency} ${file.totalSum.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}</span>
      </td>
      <td style="text-align: right;">
        <div class="row-actions" style="justify-content: flex-end;">
          <button type="button" class="btn-icon-action btn-preview-row" title="Preview file content">
            <i data-lucide="eye" style="width: 16px; height: 16px;"></i>
          </button>
          <button type="button" class="btn-icon-action btn-copy-row" title="Copy file content">
            <i data-lucide="copy" style="width: 16px; height: 16px;"></i>
          </button>
          <button type="button" class="btn-icon-action btn-download-row" title="Download single .xap file">
            <i data-lucide="download" style="width: 16px; height: 16px;"></i>
          </button>
        </div>
      </td>
    `;

    // Row preview button
    tr.querySelector('.btn-preview-row')?.addEventListener('click', () => {
      openPreviewModal(file);
    });

    // Row copy button
    tr.querySelector('.btn-copy-row')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(file.content);
      showToast(`Copied ${file.name} to clipboard!`, 'success');
    });

    // Row download button
    tr.querySelector('.btn-download-row')?.addEventListener('click', () => {
      downloadSingleXap(file);
      showToast(`Downloaded ${file.name}`, 'info');
    });

    filesTableBody.appendChild(tr);
  });

  refreshIcons();
}

// Search Filter
fileSearchInput.addEventListener('input', () => {
  if (!currentResult) return;
  const q = fileSearchInput.value.toLowerCase().trim();
  if (!q) {
    renderFilesTable(currentResult.files);
    return;
  }
  const filtered = currentResult.files.filter((f) => {
    return (
      f.name.toLowerCase().includes(q) ||
      f.quoteNumber.toLowerCase().includes(q) ||
      f.customer.toLowerCase().includes(q) ||
      f.endUserAddress.toLowerCase().includes(q)
    );
  });
  renderFilesTable(filtered);
});

// Native Folder Export Button (File System Access API)
btnExportFolder.addEventListener('click', async () => {
  if (!currentResult) return;

  if (!isFileSystemAccessSupported()) {
    showToast(
      'Your browser does not support the File System Access API. Downloading ZIP instead...',
      'info'
    );
    await triggerZipDownload();
    return;
  }

  btnExportFolder.disabled = true;
  btnExportFolder.innerHTML = `<i data-lucide="folder-down" style="width: 18px; height: 18px;"></i> Exporting...`;
  refreshIcons();

  try {
    const outcome = await saveDirectlyToFolder(
      currentResult.files,
      currentResult.folderName,
      (current, total) => {
        btnExportFolder.innerHTML = `<i data-lucide="folder-down" style="width: 18px; height: 18px;"></i> Writing ${current}/${total}...`;
        refreshIcons();
      }
    );

    if (outcome.success) {
      addLog(`Created folder "${outcome.savedPath}" with ${outcome.filesWritten} files!`, 'success');
      showToast(`Folder "${currentResult.folderName}" saved with all ${outcome.filesWritten} files!`, 'success');
    } else if (outcome.error && !outcome.error.includes('cancelled')) {
      showToast(`Folder export failed: ${outcome.error}`, 'error');
      addLog(`Folder export error: ${outcome.error}`, 'error');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`Error: ${msg}`, 'error');
    addLog(`Export folder error: ${msg}`, 'error');
  } finally {
    btnExportFolder.disabled = false;
    btnExportFolder.innerHTML = `<i data-lucide="folder-down" style="width: 18px; height: 18px;"></i> Save to Local Folder`;
    refreshIcons();
  }
});

// ZIP Download Button
async function triggerZipDownload() {
  if (!currentResult) return;

  btnExportZip.disabled = true;
  btnExportZip.innerHTML = `<i data-lucide="download" style="width: 18px; height: 18px;"></i> Compressing...`;
  refreshIcons();

  try {
    addLog('Generating ZIP package...', 'info');
    const zipBlob = await createZipBlob(currentResult.files, currentResult.folderName);
    triggerDownload(zipBlob, `${currentResult.folderName}.zip`);
    addLog(`Downloaded ${currentResult.folderName}.zip`, 'success');
    showToast(`Downloaded ${currentResult.folderName}.zip!`, 'success');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`ZIP generation error: ${msg}`, 'error');
    addLog(`ZIP error: ${msg}`, 'error');
  } finally {
    btnExportZip.disabled = false;
    btnExportZip.innerHTML = `<i data-lucide="download" style="width: 18px; height: 18px;"></i> Download ZIP (.zip)`;
    refreshIcons();
  }
}

btnExportZip.addEventListener('click', triggerZipDownload);

// Modal Preview Handlers
function openPreviewModal(file: XapFile) {
  activeModalFile = file;
  modalFileTitle.textContent = `${file.name} (${file.lineCount} lines)`;
  modalCodeViewer.textContent = file.content;
  previewModal.style.display = 'flex';
  refreshIcons();
}

function closePreviewModal() {
  previewModal.style.display = 'none';
  activeModalFile = null;
}

modalCloseBtn.addEventListener('click', closePreviewModal);

previewModal.addEventListener('click', (e) => {
  if (e.target === previewModal) {
    closePreviewModal();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && previewModal.style.display === 'flex') {
    closePreviewModal();
  }
});

modalCopyBtn.addEventListener('click', async () => {
  if (activeModalFile) {
    await navigator.clipboard.writeText(activeModalFile.content);
    showToast(`Copied ${activeModalFile.name} content!`, 'success');
  }
});

modalDownloadBtn.addEventListener('click', () => {
  if (activeModalFile) {
    downloadSingleXap(activeModalFile);
    showToast(`Downloaded ${activeModalFile.name}`, 'info');
  }
});
