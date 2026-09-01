/* ============================================================
   My Resume Builder — vanilla JS
   ------------------------------------------------------------
   Section index:
   1.  Helpers (escaping, URLs, parsing)
   2.  Validation
   3.  Storage (localStorage with in-memory fallback)
   4.  Preview rendering
   5.  Form data
   6.  Actions (Copy HTML, Print/PDF, Reset)
   7.  Error banner / toasts
   8.  Initialization
   ============================================================ */

/* ------------------------------------------------------------
   1. HELPERS
   ------------------------------------------------------------ */

// Escape a string so it can be safely inserted into innerHTML.
// User-controlled text must NEVER be inserted raw.
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Convert a newline-containing plain text to safe HTML with <br>.
function escapeHtmlMultiline(text) {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

// Sanitize a URL for use in an href attribute.
// Only http:// and https:// are allowed. Returns '' for anything unsafe.
function sanitizeUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  // Only safe, explicit protocols are allowed.
  if (lower.startsWith('https://') || lower.startsWith('http://')) {
    // Double-check there is no scheme obfuscation (e.g. "https://javascript:...").
    return trimmed;
  }
  return '';
}

// Parse one of the pipe-delimited resume sections (experience, education,
// projects, certifications). Lines are split on '|'.
// Returns an array of { main, meta, bullets } objects.
function parseSection(text) {
  if (!text) return [];
  return String(text)
    .split('\n')
    .filter((line) => line && line.trim())
    .map((line) => {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length < 2) {
        // Not enough structure — treat whole line as a plain entry.
        return { main: line.trim(), meta: '', bullets: [] };
      }
      return {
        main: parts[0],
        meta: parts[1],
        bullets: parts.slice(2).filter((b) => b)
      };
    })
    .filter((entry) => entry.main || entry.meta || entry.bullets.length);
}

// Parse a comma-separated skill string into a cleaned array.
function parseSkills(skills) {
  if (!skills) return [];
  return String(skills)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s);
}

/* ------------------------------------------------------------
   2. VALIDATION
   ------------------------------------------------------------ */

// Field validators. Each returns an error message string or '' when valid.
const VALIDATORS = {
  name: (value) => {
    if (!value.trim()) return 'Name is required.';
    if (value.trim().length > 100) return 'Name must be under 100 characters.';
    return '';
  },
  role: (value) => {
    if (!value.trim()) return 'Role / headline is required.';
    if (value.trim().length > 100) return 'Role must be under 100 characters.';
    return '';
  },
  email: (value) => {
    if (!value.trim()) return '';
    // Simple, user-friendly email check.
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRe.test(value.trim())) return 'Email looks invalid (e.g. you@example.com).';
    return '';
  },
  website: (value) => validateHttpUrl(value, 'Website'),
  linkedin: (value) => validateHttpUrl(value, 'LinkedIn'),
  github: (value) => validateHttpUrl(value, 'GitHub'),
  skills: (value) => {
    if (!value.trim()) return '';
    if (!parseSkills(value).length) return 'Enter at least one skill.';
    return '';
  },
  experience: (value) => validateSection(value, 'Experience'),
  education: (value) => validateSection(value, 'Education'),
  projects: (value) => validateSection(value, 'Projects'),
  certifications: (value) => validateSection(value, 'Certifications'),
  phone: (value) => {
    if (!value.trim()) return '';
    // Keep it light: just strip spaces/dashes and check digits exist.
    const digits = value.replace(/[^\d+]/g, '');
    if (!digits || digits.replace(/\D/g, '').length < 5) return 'Phone number looks too short.';
    return '';
  },
  location: (value) => {
    if (value.trim().length > 100) return 'Location must be under 100 characters.';
    return '';
  },
  summary: (value) => {
    if (value.trim().length > 2000) return 'Summary must be under 2000 characters.';
    return '';
  }
};

function validateHttpUrl(value, label) {
  if (!value.trim()) return '';
  if (value.trim().length > 300) return `${label} URL is too long.`;
  const safe = sanitizeUrl(value);
  if (!safe) {
    return `${label} must start with http:// or https:// (e.g. https://example.com).`;
  }
  return '';
}

function validateSection(value, label) {
  if (!value.trim()) return '';
  const entries = parseSection(value);
  if (!entries.length) return `${label} needs at least one entry.`;
  return '';
}

// Validate a single field. Returns error string or ''.
function validateField(id, value) {
  const validator = VALIDATORS[id];
  if (!validator) return '';
  return validator(value || '');
}

// Validate the whole data object. Returns { fieldId: errorMessage }.
function validateForm(data) {
  const errors = {};
  Object.keys(data).forEach((key) => {
    const message = validateField(key, data[key]);
    if (message) errors[key] = message;
  });
  return errors;
}

/* ------------------------------------------------------------
   3. STORAGE
   ------------------------------------------------------------ */

let storageAvailable = null; // null = unknown, true/false after check
let memoryData = {}; // fallback store when localStorage is unavailable

function isStorageAvailable() {
  if (storageAvailable !== null) return storageAvailable;
  try {
    const testKey = '__ds_resume_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    storageAvailable = true;
  } catch (e) {
    storageAvailable = false;
  }
  return storageAvailable;
}

function saveToStorage(data) {
  memoryData = data;
  if (!isStorageAvailable()) return false;
  try {
    window.localStorage.setItem('resumeData', JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

function loadFromStorage() {
  if (!isStorageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem('resumeData');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    return null;
  }
}

function removeFromStorage() {
  memoryData = {};
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.removeItem('resumeData');
  } catch (e) {
    /* ignore */
  }
}

/* ------------------------------------------------------------
   4. PREVIEW RENDERING
   ------------------------------------------------------------ */

function buildSkillsHtml(skills) {
  const list = parseSkills(skills);
  if (!list.length) return '';
  return list
    .map((s) => `<span class="skill">${escapeHtml(s)}</span>`)
    .join('');
}

function buildSectionHtml(text) {
  const entries = parseSection(text);
  if (!entries.length) return '';
  return entries
    .map((entry) => {
      const bullets = entry.bullets
        .map((b) => `<p>• ${escapeHtml(b)}</p>`)
        .join('');
      return `
        <div class="experience-entry">
          <div class="experience-role">${escapeHtml(entry.main)}</div>
          ${entry.meta ? `<div class="experience-date">${escapeHtml(entry.meta)}</div>` : ''}
          ${bullets}
        </div>
      `;
    })
    .join('');
}

function buildLinks(data) {
  const parts = [];
  if (data.phone) parts.push(`Phone: ${escapeHtml(data.phone)}`);
  if (data.location) parts.push(`Location: ${escapeHtml(data.location)}`);
  const linkParts = [];
  if (sanitizeUrl(data.website)) linkParts.push(`Website: <a href="${escapeHtml(sanitizeUrl(data.website))}" target="_blank" rel="noopener noreferrer">${escapeHtml(data.website.trim())}</a>`);
  if (sanitizeUrl(data.linkedin)) linkParts.push(`LinkedIn: <a href="${escapeHtml(sanitizeUrl(data.linkedin))}" target="_blank" rel="noopener noreferrer">${escapeHtml(data.linkedin.trim())}</a>`);
  if (sanitizeUrl(data.github)) linkParts.push(`GitHub: <a href="${escapeHtml(sanitizeUrl(data.github))}" target="_blank" rel="noopener noreferrer">${escapeHtml(data.github.trim())}</a>`);

  const line1 = parts.join(' | ');
  const line2 = linkParts.join(' | ');
  return (line1 ? `<p>${line1}</p>` : '') + (line2 ? `<p>${line2}</p>` : '');
}

function updatePreview() {
  const data = getFormData();
  const saved = saveToStorage(data);
  if (saved) showAutosave();

  const skillsHtml = buildSkillsHtml(data.skills);

  const previewHtml = `
    <h1>${escapeHtml(data.name || 'Your Name')}</h1>
    <p>${escapeHtml(data.role || 'Role / Headline (e.g., Full-Stack Developer)')}</p>
    ${data.summary ? `<p>${escapeHtmlMultiline(data.summary)}</p>` : ''}
    ${skillsHtml ? `<h2>Skills</h2><p>${skillsHtml}</p>` : ''}
    ${buildSectionHtml(data.experience) ? `<h2>Experience</h2>${buildSectionHtml(data.experience)}` : ''}
    ${buildSectionHtml(data.education) ? `<h2>Education</h2>${buildSectionHtml(data.education)}` : ''}
    ${buildSectionHtml(data.projects) ? `<h2>Projects</h2>${buildSectionHtml(data.projects)}` : ''}
    ${buildSectionHtml(data.certifications) ? `<h2>Certifications</h2>${buildSectionHtml(data.certifications)}` : ''}
    ${buildLinks(data)}
  `;

  document.getElementById('preview').innerHTML = previewHtml;
  updateValidationUI(data);
}

/* ------------------------------------------------------------
   5. FORM DATA
   ------------------------------------------------------------ */

function getFormData() {
  const ids = [
    'name', 'role', 'summary', 'skills', 'experience', 'education',
    'phone', 'location', 'website', 'linkedin', 'github',
    'projects', 'certifications'
  ];
  const data = {};
  ids.forEach((id) => {
    const el = document.getElementById(id);
    data[id] = el ? el.value || '' : '';
  });
  return data;
}

/* ------------------------------------------------------------
   VALIDATION UI (inline field errors + summary)
   ------------------------------------------------------------ */

function getFieldLabel(id) {
  const labels = {
    name: 'Name',
    role: 'Role',
    summary: 'Summary',
    skills: 'Skills',
    experience: 'Experience',
    education: 'Education',
    phone: 'Phone',
    location: 'Location',
    website: 'Website',
    linkedin: 'LinkedIn',
    github: 'GitHub',
    projects: 'Projects',
    certifications: 'Certifications'
  };
  return labels[id] || id;
}

function showFieldError(id, message) {
  const field = document.getElementById(id);
  if (!field) return;
  field.classList.add('input-error');
  let errEl = document.getElementById('err-' + id);
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.id = 'err-' + id;
    errEl.className = 'field-error';
    field.parentNode.insertBefore(errEl, field.nextSibling);
  }
  errEl.textContent = message;
}

function clearFieldError(id) {
  const field = document.getElementById(id);
  if (field) field.classList.remove('input-error');
  const errEl = document.getElementById('err-' + id);
  if (errEl) errEl.textContent = '';
}

function updateValidationUI(data) {
  const errors = validateForm(data);
  Object.keys(VALIDATORS).forEach((key) => {
    if (errors[key]) {
      showFieldError(key, errors[key]);
    } else {
      clearFieldError(key);
    }
  });
}

/* ------------------------------------------------------------
   6. ACTIONS
   ------------------------------------------------------------ */

// Self-contained CSS embedded in the copied HTML. Keep in sync with style.css.
function getEmbeddedCss() {
  return `
body {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 0;
  background-color: #0d1117;
  color: #c9d1d9;
}
.preview-card {
  background-color: #161b22;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
  max-width: 600px;
  width: 100%;
}
h1 { font-size: 1.5em; }
#preview h1 { font-size: 1.8em; color: #58a6ff; }
#preview p { margin: 5px 0; font-size: 0.9em; }
#preview h2 { font-size: 1.2em; margin-top: 15px; color: #c9d1d9; }
.skill {
  background-color: #21262d;
  padding: 4px 8px;
  border-radius: 4px;
  margin-right: 5px;
  color: #c9d1d9;
}
.experience-entry { margin-bottom: 10px; }
.experience-role { font-weight: bold; }
.experience-date { color: #8b949e; font-style: italic; }
a { color: #58a6ff; }
  `.trim();
}

async function copyHTML() {
  try {
    const previewEl = document.getElementById('preview');
    if (!previewEl) throw new Error('Preview element not found.');

    // Try to embed the live stylesheet so the copy always matches the app.
    let cssText = null;
    try {
      const res = await fetch('style.css', { cache: 'no-cache' });
      if (res.ok) cssText = await res.text();
    } catch (e) {
      cssText = null;
    }
    if (!cssText) cssText = getEmbeddedCss();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Resume</title>
<style>${cssText}</style>
</head>
<body>
${previewEl.outerHTML}
</body>
</html>`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(html);
    } else {
      // Fallback for older browsers / non-secure contexts.
      const ta = document.createElement('textarea');
      ta.value = html;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (!ok) throw new Error('Clipboard write failed. Copy the HTML manually.');
    }
    showToast('HTML copied to clipboard with embedded CSS.');
  } catch (err) {
    showError(`Copy HTML failed: ${err.message}`);
  }
}

// Load a script dynamically and resolve when it is ready.
// Includes a timeout so a hung/blocked CDN request fails cleanly instead of
// leaving the user with a permanently "Preparing PDF…" button.
function loadScript(src, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out loading ' + src));
    }, timeoutMs || 15000);

    const done = (err) => {
      clearTimeout(timeout);
      if (err) reject(err);
      else resolve();
    };

    const existing = document.querySelector('script[src="' + src + '"]');
    if (existing) {
      // Already requested; wait for it to finish loading.
      if (existing.dataset.loaded === '1') return done();
      existing.addEventListener('load', () => {
        existing.dataset.loaded = '1';
        done();
      });
      existing.addEventListener('error', () => done(new Error('Failed to load ' + src)));
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => {
      script.dataset.loaded = '1';
      done();
    };
    script.onerror = () => done(new Error('Failed to load ' + src));
    document.head.appendChild(script);
  });
}

async function printPDF() {
  const pdfBtn = document.getElementById('pdf-btn');
  const originalLabel = pdfBtn ? pdfBtn.textContent : '';
  if (pdfBtn) {
    pdfBtn.disabled = true;
    pdfBtn.textContent = 'Preparing PDF…';
  }
  try {
    const previewEl = document.getElementById('preview');
    if (!previewEl) throw new Error('Preview element not found.');

    // jsPDF is loaded via the <script> tag in index.html; html2canvas is loaded
    // on demand. Load both if missing so PDF export works out of the box.
    if (typeof window.jspdf === 'undefined') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    }
    if (typeof window.html2canvas === 'undefined') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    }
    if (typeof window.jspdf === 'undefined' || typeof window.html2canvas === 'undefined') {
      throw new Error('PDF libraries failed to load (network may be blocked).');
    }

    const { jsPDF } = window.jspdf;
    const canvas = await window.html2canvas(previewEl, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 20; // 10mm margins each side
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 10;

    doc.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
    heightLeft -= (pageHeight - 20);

    // Split into multiple pages if the resume is taller than one page.
    while (heightLeft > 0) {
      position = heightLeft - imgHeight + 10;
      doc.addPage();
      doc.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= (pageHeight - 20);
    }

    doc.save('resume.pdf');
    showToast('PDF saved as resume.pdf');
  } catch (err) {
    showError(
      'PDF export failed: ' + err.message +
      '. You can still use your browser\u2019s Print dialog (Ctrl/Cmd+P) and choose "Save as PDF".'
    );
  } finally {
    if (pdfBtn) {
      pdfBtn.disabled = false;
      pdfBtn.textContent = originalLabel;
    }
  }
}

function resetForm() {
  if (confirm('Reset all fields?')) {
    document.getElementById('resume-form').reset();
    removeFromStorage();
    updatePreview();
    showToast('Form reset.');
  }
}

/* ------------------------------------------------------------
   7. ERROR BANNER / TOASTS
   ------------------------------------------------------------ */

function showError(message) {
  let banner = document.getElementById('error-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'error-banner';
    banner.className = 'error-banner';
    document.querySelector('.form-section').prepend(banner);
  }
  banner.textContent = message;
  banner.style.display = 'block';
}

function hideError() {
  const banner = document.getElementById('error-banner');
  if (banner) banner.style.display = 'none';
}

function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('toast-show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove('toast-show');
  }, 2500);
}

function showAutosave() {
  const el = document.querySelector('.autosave');
  if (!el) return;
  el.style.display = 'block';
  clearTimeout(showAutosave._timer);
  showAutosave._timer = setTimeout(() => {
    el.style.display = 'none';
  }, 1500);
}

/* ------------------------------------------------------------
   8. INITIALIZATION
   ------------------------------------------------------------ */

function init() {
  const form = document.getElementById('resume-form');
  const previewEl = document.getElementById('preview');
  if (!form || !previewEl) return; // e.g. test page without the app DOM

  // Inline error handling: guard the whole app so one bad field never
  // breaks the editor.
  form.addEventListener('input', () => {
    try {
      updatePreview();
    } catch (e) {
      showError('Something went wrong while updating the preview: ' + e.message);
    }
  });

  // Periodically refresh the preview / autosave.
  setInterval(() => {
    try {
      updatePreview();
    } catch (e) {
      /* non-fatal */
    }
  }, 10000);

  // Warn (non-blocking) if localStorage is unavailable.
  if (!isStorageAvailable()) {
    showToast('Local storage unavailable \u2014 your data will only stay in memory for this session.');
  }

  // Restore saved data.
  const data = loadFromStorage();
  if (data) {
    Object.keys(data).forEach((key) => {
      const el = document.getElementById(key);
      if (el && typeof data[key] === 'string') el.value = data[key];
    });
  }

  // Bind action buttons.
  const copyBtn = document.getElementById('copy-btn');
  const pdfBtn = document.getElementById('pdf-btn');
  const resetBtn = document.getElementById('reset-btn');
  if (copyBtn) copyBtn.addEventListener('click', copyHTML);
  if (pdfBtn) pdfBtn.addEventListener('click', printPDF);
  if (resetBtn) resetBtn.addEventListener('click', resetForm);

  updatePreview();
}

document.addEventListener('DOMContentLoaded', init);
