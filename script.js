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
   1B. STRUCTURED RESUME MODEL
   ------------------------------------------------------------ */

const RESUME_SCHEMA_VERSION = 1;
let resumeIdCounter = 0;
let currentResume = null;

// Create an ID once and retain it when an entry is normalized or edited.
// crypto.randomUUID is used where available; the fallback keeps the model
// usable in older browsers and in the lightweight Node test environment.
function createResumeId(prefix) {
  const safePrefix = String(prefix || 'entry').replace(/[^a-z0-9_-]/gi, '') || 'entry';
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${safePrefix}-${crypto.randomUUID()}`;
  }
  resumeIdCounter += 1;
  return `${safePrefix}-${Date.now().toString(36)}-${resumeIdCounter.toString(36)}`;
}

// The single canonical factory for a new resume document.
function createDefaultResume() {
  return {
    schemaVersion: RESUME_SCHEMA_VERSION,
    personal: {
      name: '',
      role: '',
      email: '',
      phone: '',
      location: '',
      website: '',
      linkedin: '',
      github: ''
    },
    summary: '',
    skills: [],
    experience: [],
    education: [],
    projects: [],
    certifications: []
  };
}

function normalizeText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function normalizeStringList(values) {
  const source = Array.isArray(values) ? values : [];
  return source
    .map(normalizeText)
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

function normalizeEntryId(value, prefix) {
  return normalizeText(value) || createResumeId(prefix);
}

function normalizeResume(resume) {
  const source = resume && typeof resume === 'object' ? resume : {};
  const personal = source.personal && typeof source.personal === 'object' ? source.personal : {};
  const usedEntryIds = new Set();
  const uniqueEntryId = (value, prefix) => {
    let id = normalizeEntryId(value, prefix);
    while (usedEntryIds.has(id)) id = createResumeId(prefix);
    usedEntryIds.add(id);
    return id;
  };
  const normalizeEntries = (entries, prefix, mapper) => (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => mapper(entry, uniqueEntryId(entry.id, prefix)));

  return {
    schemaVersion: RESUME_SCHEMA_VERSION,
    personal: {
      name: normalizeText(personal.name),
      role: normalizeText(personal.role),
      email: normalizeText(personal.email),
      phone: normalizeText(personal.phone),
      location: normalizeText(personal.location),
      website: normalizeText(personal.website),
      linkedin: normalizeText(personal.linkedin),
      github: normalizeText(personal.github)
    },
    summary: normalizeText(source.summary),
    skills: normalizeStringList(source.skills),
    experience: normalizeEntries(source.experience, 'experience', (entry, id) => ({
      id,
      company: normalizeText(entry.company),
      role: normalizeText(entry.role),
      dateRange: normalizeText(entry.dateRange),
      bullets: normalizeStringList(entry.bullets)
    })),
    education: normalizeEntries(source.education, 'education', (entry, id) => ({
      id,
      institution: normalizeText(entry.institution),
      degree: normalizeText(entry.degree),
      dateRange: normalizeText(entry.dateRange),
      details: normalizeText(entry.details)
    })),
    projects: normalizeEntries(source.projects, 'project', (entry, id) => ({
      id,
      title: normalizeText(entry.title),
      dateRange: normalizeText(entry.dateRange),
      technologies: normalizeStringList(entry.technologies),
      bullets: normalizeStringList(entry.bullets)
    })),
    certifications: normalizeEntries(source.certifications, 'certification', (entry, id) => ({
      id,
      name: normalizeText(entry.name),
      issuer: normalizeText(entry.issuer),
      date: normalizeText(entry.date)
    }))
  };
}

// Return validation results without mutating the supplied resume. Normalization
// is included so callers can safely render or persist its canonical shape.
function validateStructuredResume(resume) {
  const errors = {};
  if (!resume || typeof resume !== 'object') {
    errors.schema = 'Resume must be an object.';
  } else if (resume.schemaVersion !== RESUME_SCHEMA_VERSION) {
    errors.schemaVersion = `Unsupported schema version. Expected ${RESUME_SCHEMA_VERSION}.`;
  }

  const normalized = normalizeResume(resume);
  const personal = normalized.personal;
  if (!personal.name) errors['personal.name'] = 'Name is required.';
  if (!personal.role) errors['personal.role'] = 'Role / headline is required.';
  ['website', 'linkedin', 'github'].forEach((field) => {
    const message = validateHttpUrl(personal[field], field === 'linkedin' ? 'LinkedIn' : field === 'github' ? 'GitHub' : 'Website');
    if (message) errors[`personal.${field}`] = message;
  });
  if (personal.email) {
    const message = VALIDATORS.email(personal.email);
    if (message) errors['personal.email'] = message;
  }
  if (personal.phone) {
    const message = VALIDATORS.phone(personal.phone);
    if (message) errors['personal.phone'] = message;
  }

  return { valid: Object.keys(errors).length === 0, errors, resume: normalized };
}

function splitLegacyTitle(value) {
  const parts = normalizeText(value).split(/\s+-\s+/, 2);
  return { primary: parts[0] || '', secondary: parts[1] || '' };
}

function createDeterministicLegacyId(prefix, index, rawText) {
  // A deterministic content hash makes migration repeatable without relying on
  // runtime UUID support. The index disambiguates identical legacy lines.
  let hash = 2166136261;
  const source = `${prefix}:${index}:${rawText}`;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-legacy-${(hash >>> 0).toString(36)}-${index}`;
}

function parseLegacySection(text) {
  if (text === null || text === undefined || text === '') return [];
  return String(text)
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => ({
      raw: line,
      parts: line.split('|').map((part) => part.trim())
    }));
}

function legacyMainOrRaw(entry) {
  return entry.parts[0] || entry.raw.trim();
}

function isStructuredResume(data) {
  return Boolean(data && typeof data === 'object' && data.schemaVersion === RESUME_SCHEMA_VERSION);
}

// Migrate the original flat localStorage shape into the v1 resume schema.
// This is pure: it returns a new object and never mutates `legacyData`.
function migrateLegacyResume(legacyData) {
  if (isStructuredResume(legacyData)) return normalizeResume(legacyData);
  if (!legacyData || typeof legacyData !== 'object') return createDefaultResume();

  const source = legacyData;
  const mapEntries = (text, prefix, mapper) => parseLegacySection(text)
    .map((entry, index) => mapper(entry, createDeterministicLegacyId(prefix, index, entry.raw)));

  return normalizeResume({
    schemaVersion: RESUME_SCHEMA_VERSION,
    personal: {
      name: source.name,
      role: source.role,
      email: source.email,
      phone: source.phone,
      location: source.location,
      website: source.website,
      linkedin: source.linkedin,
      github: source.github
    },
    summary: source.summary,
    skills: parseSkills(source.skills),
    experience: mapEntries(source.experience, 'experience', (entry, id) => {
      if (!entry.parts[0]) {
        return { id, company: entry.raw.trim(), role: '', dateRange: '', bullets: [] };
      }
      const title = splitLegacyTitle(legacyMainOrRaw(entry));
      return {
        id,
        company: title.primary || entry.raw.trim(),
        role: title.secondary,
        dateRange: entry.parts.length > 1 ? entry.parts[1] : '',
        bullets: entry.parts.slice(2).filter(Boolean)
      };
    }),
    education: mapEntries(source.education, 'education', (entry, id) => {
      if (!entry.parts[0]) {
        return { id, institution: entry.raw.trim(), degree: '', dateRange: '', details: '' };
      }
      const title = splitLegacyTitle(legacyMainOrRaw(entry));
      return {
        id,
        institution: title.primary || entry.raw.trim(),
        degree: title.secondary,
        dateRange: entry.parts.length > 1 ? entry.parts[1] : '',
        details: entry.parts.slice(2).filter(Boolean).join('\n')
      };
    }),
    projects: mapEntries(source.projects, 'project', (entry, id) => {
      if (!entry.parts[0]) {
        return { id, title: entry.raw.trim(), dateRange: '', technologies: [], bullets: [] };
      }
      return {
        id,
        title: legacyMainOrRaw(entry),
        dateRange: entry.parts.length > 1 ? entry.parts[1] : '',
        technologies: entry.parts.length > 2 ? parseSkills(entry.parts[2]) : [],
        bullets: entry.parts.slice(3).filter(Boolean)
      };
    }),
    certifications: mapEntries(source.certifications, 'certification', (entry, id) => {
      if (!entry.parts[0]) {
        return { id, name: entry.raw.trim(), issuer: '', date: '' };
      }
      const title = splitLegacyTitle(legacyMainOrRaw(entry));
      return {
        id,
        name: title.primary || entry.raw.trim(),
        issuer: title.secondary,
        date: entry.parts.length > 1 ? entry.parts[1] : ''
      };
    })
  });
}

function getFormValue(id) {
  const field = document.getElementById(id);
  return field ? field.value || '' : '';
}

// Read the existing form controls directly into the canonical structured
// document. The pipe-delimited textareas remain a temporary editing surface,
// not application state or a second persisted representation.
function readFormIntoResume(previousResume) {
  const previous = normalizeResume(previousResume || createDefaultResume());
  const toEntries = (fieldId, previousEntries, prefix, mapper) => parseSection(getFormValue(fieldId))
    .map((entry, index) => mapper(entry, previousEntries[index] && previousEntries[index].id || createResumeId(prefix)));

  return normalizeResume({
    schemaVersion: RESUME_SCHEMA_VERSION,
    personal: {
      name: getFormValue('name'),
      role: getFormValue('role'),
      email: previous.personal.email,
      phone: getFormValue('phone'),
      location: getFormValue('location'),
      website: getFormValue('website'),
      linkedin: getFormValue('linkedin'),
      github: getFormValue('github')
    },
    summary: getFormValue('summary'),
    skills: parseSkills(getFormValue('skills')),
    experience: toEntries('experience', previous.experience, 'experience', (entry, id) => {
      const title = splitLegacyTitle(entry.main || [entry.meta].concat(entry.bullets).join(' | '));
      return { id, company: title.primary, role: title.secondary, dateRange: entry.meta, bullets: entry.bullets };
    }),
    education: toEntries('education', previous.education, 'education', (entry, id) => {
      const title = splitLegacyTitle(entry.main || [entry.meta].concat(entry.bullets).join(' | '));
      return { id, institution: title.primary, degree: title.secondary, dateRange: entry.meta, details: entry.bullets.join('\n') };
    }),
    projects: toEntries('projects', previous.projects, 'project', (entry, id) => ({
      id,
      title: entry.main || [entry.meta].concat(entry.bullets).join(' | '),
      dateRange: entry.meta,
      technologies: entry.bullets.length ? parseSkills(entry.bullets[0]) : [],
      bullets: entry.bullets.slice(1)
    })),
    certifications: toEntries('certifications', previous.certifications, 'certification', (entry, id) => {
      const title = splitLegacyTitle(entry.main || [entry.meta].concat(entry.bullets).join(' | '));
      return { id, name: title.primary, issuer: title.secondary, date: entry.meta };
    })
  });
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
  const structured = normalizeResume(data);
  memoryData = structured;
  if (!isStorageAvailable()) return false;
  try {
    window.localStorage.setItem('resumeData', JSON.stringify(structured));
    return true;
  } catch (e) {
    return false;
  }
}

function loadFromStorage() {
  if (!isStorageAvailable()) return createDefaultResume();
  try {
    const raw = window.localStorage.getItem('resumeData');
    if (!raw) return createDefaultResume();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return createDefaultResume();

    if (isStructuredResume(parsed)) return normalizeResume(parsed);

    const migrated = migrateLegacyResume(parsed);
    // Store the canonical document under the existing key. This replaces the
    // former flat source of truth rather than maintaining parallel records.
    saveToStorage(migrated);
    return migrated;
  } catch (e) {
    return createDefaultResume();
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
  const list = Array.isArray(skills) ? normalizeStringList(skills) : parseSkills(skills);
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

function buildStructuredEntriesHtml(entries) {
  return entries.map((entry) => {
    const bullets = entry.bullets.map((bullet) => `<p>• ${escapeHtml(bullet)}</p>`).join('');
    return `
      <div class="experience-entry">
        <div class="experience-role">${escapeHtml(entry.main)}</div>
        ${entry.meta ? `<div class="experience-date">${escapeHtml(entry.meta)}</div>` : ''}
        ${bullets}
      </div>
    `;
  }).join('');
}

function buildExperienceHtml(entries) {
  return buildStructuredEntriesHtml(entries.map((entry) => ({
    main: [entry.company, entry.role].filter(Boolean).join(' - '),
    meta: entry.dateRange,
    bullets: entry.bullets
  })));
}

function buildEducationHtml(entries) {
  return buildStructuredEntriesHtml(entries.map((entry) => ({
    main: [entry.institution, entry.degree].filter(Boolean).join(' - '),
    meta: entry.dateRange,
    bullets: entry.details ? entry.details.split('\n').filter(Boolean) : []
  })));
}

function buildProjectsHtml(entries) {
  return buildStructuredEntriesHtml(entries.map((entry) => ({
    main: entry.title,
    meta: entry.dateRange,
    bullets: entry.bullets.length ? entry.bullets : (entry.technologies.length ? [entry.technologies.join(', ')] : [])
  })));
}

function buildCertificationsHtml(entries) {
  return buildStructuredEntriesHtml(entries.map((entry) => ({
    main: [entry.name, entry.issuer].filter(Boolean).join(' - '),
    meta: entry.date,
    bullets: []
  })));
}

function renderResume(resume) {
  const data = normalizeResume(resume);

  const skillsHtml = buildSkillsHtml(data.skills);
  const experienceHtml = buildExperienceHtml(data.experience);
  const educationHtml = buildEducationHtml(data.education);
  const projectsHtml = buildProjectsHtml(data.projects);
  const certificationsHtml = buildCertificationsHtml(data.certifications);

  const previewHtml = `
    <h1>${escapeHtml(data.personal.name || 'Your Name')}</h1>
    <p>${escapeHtml(data.personal.role || 'Role / Headline (e.g., Full-Stack Developer)')}</p>
    ${data.summary ? `<p>${escapeHtmlMultiline(data.summary)}</p>` : ''}
    ${skillsHtml ? `<h2>Skills</h2><p>${skillsHtml}</p>` : ''}
    ${experienceHtml ? `<h2>Experience</h2>${experienceHtml}` : ''}
    ${educationHtml ? `<h2>Education</h2>${educationHtml}` : ''}
    ${projectsHtml ? `<h2>Projects</h2>${projectsHtml}` : ''}
    ${certificationsHtml ? `<h2>Certifications</h2>${certificationsHtml}` : ''}
    ${buildLinks(data.personal)}
  `;

  const preview = document.getElementById('preview');
  if (preview) preview.innerHTML = previewHtml;
}

/* ------------------------------------------------------------
   5. FORM DATA
   ------------------------------------------------------------ */

function getFormValidationData() {
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

function resumeToFormValues(resume) {
  const data = normalizeResume(resume);
  const joinEntry = (main, meta, trailing) => [main, meta].concat(trailing || [])
    .filter((part, index) => index < 2 || part !== '')
    .join(' | ');

  return {
    name: data.personal.name,
    role: data.personal.role,
    summary: data.summary,
    skills: data.skills.join(', '),
    experience: data.experience.map((entry) => joinEntry(
      [entry.company, entry.role].filter(Boolean).join(' - '), entry.dateRange, entry.bullets
    )).join('\n'),
    education: data.education.map((entry) => joinEntry(
      [entry.institution, entry.degree].filter(Boolean).join(' - '), entry.dateRange,
      entry.details ? entry.details.split('\n') : []
    )).join('\n'),
    phone: data.personal.phone,
    location: data.personal.location,
    website: data.personal.website,
    linkedin: data.personal.linkedin,
    github: data.personal.github,
    projects: data.projects.map((entry) => joinEntry(
      entry.title, entry.dateRange, [entry.technologies.join(', ')].concat(entry.bullets)
    )).join('\n'),
    certifications: data.certifications.map((entry) => joinEntry(
      [entry.name, entry.issuer].filter(Boolean).join(' - '), entry.date, []
    )).join('\n')
  };
}

function populateFormFromResume(resume) {
  const values = resumeToFormValues(resume);
  Object.keys(values).forEach((key) => {
    const field = document.getElementById(key);
    if (field) field.value = values[key];
  });
}

function saveResume(resume) {
  currentResume = normalizeResume(resume);
  return saveToStorage(currentResume);
}

function loadResume() {
  const loaded = loadFromStorage();
  return validateStructuredResume(loaded).resume;
}

let saveResumeTimer = null;

function scheduleResumeSave() {
  clearTimeout(saveResumeTimer);
  saveResumeTimer = setTimeout(() => {
    if (saveResume(currentResume)) showAutosave();
  }, 300);
}

function syncResumeFromForm() {
  currentResume = readFormIntoResume(currentResume);
  renderResume(currentResume);
  updateValidationUI(getFormValidationData());
  scheduleResumeSave();
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
    clearTimeout(saveResumeTimer);
    currentResume = createDefaultResume();
    populateFormFromResume(currentResume);
    removeFromStorage();
    renderResume(currentResume);
    updateValidationUI(getFormValidationData());
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
      syncResumeFromForm();
    } catch (e) {
      showError('Something went wrong while updating the preview: ' + e.message);
    }
  });

  // Warn (non-blocking) if localStorage is unavailable.
  if (!isStorageAvailable()) {
    showToast('Local storage unavailable \u2014 your data will only stay in memory for this session.');
  }

  // Load a v1 resume or migrate the old flat localStorage record once.
  currentResume = loadResume();
  populateFormFromResume(currentResume);

  // Bind action buttons.
  const copyBtn = document.getElementById('copy-btn');
  const pdfBtn = document.getElementById('pdf-btn');
  const resetBtn = document.getElementById('reset-btn');
  if (copyBtn) copyBtn.addEventListener('click', copyHTML);
  if (pdfBtn) pdfBtn.addEventListener('click', printPDF);
  if (resetBtn) resetBtn.addEventListener('click', resetForm);

  renderResume(currentResume);
  updateValidationUI(getFormValidationData());
}

document.addEventListener('DOMContentLoaded', init);
