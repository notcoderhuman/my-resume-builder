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

function buildResumeEvidenceIndexForBrowser(resume) {
  const evidence = []; const add = (path, value) => { if (value) evidence.push({ sourcePath: path, sourceText: String(value) }); };
  const personal = resume && resume.personal || {};
  ['headline', 'role'].forEach((field) => add(`resume.personal.${field}`, personal[field])); add('resume.summary', resume && resume.summary);
  (resume && resume.skills || []).forEach((value, i) => add(`resume.skills[${i}]`, value));
  (resume && resume.experience || []).forEach((entry, i) => { add(`resume.experience[${i}].role`, entry.role); (entry.bullets || []).forEach((value, j) => add(`resume.experience[${i}].bullets[${j}]`, value)); });
  (resume && resume.projects || []).forEach((entry, i) => { ['name', 'title', 'description'].forEach((field) => add(`resume.projects[${i}].${field}`, entry[field])); (entry.technologies || []).forEach((value, j) => add(`resume.projects[${i}].technologies[${j}]`, value)); (entry.bullets || []).forEach((value, j) => add(`resume.projects[${i}].bullets[${j}]`, value)); });
  return evidence;
}
function browserTerm(value) { const v = String(value || '').toLowerCase().replace(/\./g, '').trim(); return ({ js: 'javascript', node: 'node.js', nodejs: 'node.js', k8s: 'kubernetes' })[v] || v; }
function browserHasTerm(source, term) { const canonical = browserTerm(term); const aliases = canonical === 'javascript' ? ['javascript', 'js'] : canonical === 'node.js' ? ['node.js', 'nodejs', 'node'] : canonical === 'kubernetes' ? ['kubernetes', 'k8s'] : [canonical]; return aliases.some((alias) => new RegExp(`(^|[^a-z0-9+#])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9+#])`, 'i').test(source)); }
let currentMatchResult = null;
let currentSkillGapResult = null;
let currentAnalysisFingerprint = '';
let currentJobDescriptionModel = null;
let currentAIInsights = null;
function analysisFingerprint(resume, jobText) { return JSON.stringify({ resume: normalizeResume(resume || createDefaultResume()), jobText: String(jobText || '') }); }
function invalidateAnalysis(reason) {
  if (!currentMatchResult && !currentSkillGapResult) return;
  currentMatchResult = null; currentSkillGapResult = null; currentAnalysisFingerprint = ''; currentAIInsights = null;
  const result = document.getElementById('match-analysis-result');
  if (result) result.innerHTML = `<div class="empty-panel panel analysis-stale" role="status"><h3>Analysis needs to be refreshed.</h3><p>${escapeHtml(reason || 'Your source data changed. Run the deterministic baseline again.')}</p></div>`;
  const evidence = document.getElementById('evidence-records'); if (evidence) evidence.innerHTML = '<div class="evidence-empty panel"><p>Run a new analysis to refresh evidence.</p></div>';
  const gaps = document.getElementById('skill-gap-records'); if (gaps) gaps.innerHTML = '<div class="gap-empty panel">Run a new analysis to refresh skill gaps.</div>';
  const ai = document.getElementById('ai-insights-result'); if (ai) ai.innerHTML = '<div class="ai-insights-panel"><p>AI insights are stale because the source data changed.</p></div>';
}
function renderSkillGaps(result) {
  currentSkillGapResult = result; const container = document.getElementById('skill-gap-records'); if (!container) return;
  const status = document.getElementById('gap-status-filter')?.value || ''; const importance = document.getElementById('gap-importance-filter')?.value || ''; const priority = document.getElementById('gap-priority-filter')?.value || '';
  const gaps = result.gaps.filter((gap) => (!status || gap.status === status) && (!importance || gap.importance === importance) && (!priority || gap.priority === priority));
  const required = document.getElementById('gap-required-count'); const preferred = document.getElementById('gap-preferred-count'); const demonstrated = document.getElementById('gap-demonstrated-count'); if (required) required.textContent = result.summary.requiredGaps; if (preferred) preferred.textContent = result.summary.preferredGaps; if (demonstrated) demonstrated.textContent = result.summary.demonstrated;
  container.innerHTML = gaps.length ? gaps.map((gap) => `<article class="skill-gap-record panel" id="gap-${escapeHtml(gap.requirementId)}"><div class="skill-gap-header"><div><h2>${escapeHtml(gap.name)}</h2><span class="skill-gap-meta">${escapeHtml(gap.importance)} · ${escapeHtml(gap.status)}</span></div><span class="gap-priority ${escapeHtml(gap.priority)}">${escapeHtml(gap.priority)} priority</span></div><div class="gap-detail"><div><span class="eyebrow">JOB EVIDENCE</span><div class="gap-quote">“${escapeHtml(gap.jdEvidence.sourceText || gap.name)}”</div><span class="gap-path">${escapeHtml(gap.jdEvidence.sourcePath)}</span></div><div><span class="eyebrow">RESUME EVIDENCE</span>${gap.resumeEvidence.length ? gap.resumeEvidence.map((item) => `<div class="gap-quote"><span class="gap-path">${escapeHtml(item.sourcePath)}</span>“${escapeHtml(item.sourceText)}”</div>`).join('') : '<div class="gap-quote">No supporting evidence was found in your current resume.</div>'}</div></div><div class="gap-guidance"><strong>What this means</strong><p>${escapeHtml(gap.interpretation)}</p><strong>Next step</strong><p>${escapeHtml(gap.recommendation.text)}</p></div></article>`).join('') : '<div class="gap-empty panel">No skill gaps match this filter.</div>';
}

function renderEvidenceTraceability(result) {
  currentMatchResult = result;
  const records = document.getElementById('evidence-records'); const reverse = document.getElementById('reverse-evidence-records'); if (!records) return;
  const statusFilter = document.getElementById('evidence-status-filter')?.value || ''; const importanceFilter = document.getElementById('evidence-importance-filter')?.value || '';
  const matches = result.matches.filter((m) => (!statusFilter || m.status === statusFilter) && (!importanceFilter || m.importance === importanceFilter));
  const count = document.getElementById('evidence-count'); if (count) count.textContent = `${matches.length} record${matches.length === 1 ? '' : 's'}`;
  records.innerHTML = matches.length ? matches.map((match) => `<article class="evidence-record panel" id="evidence-${escapeHtml(match.requirementId)}"><div class="evidence-record-header"><div><h3>${escapeHtml(match.requirement)}</h3><span class="record-meta">${escapeHtml(match.importance)} · ${escapeHtml(match.category)} · confidence ${Math.round(match.confidence * 100)}%</span></div><span class="match-status ${escapeHtml(match.status)}">${escapeHtml(match.status)} · ${escapeHtml(match.matchType)}</span></div><div class="evidence-detail"><div><span class="eyebrow">JOB REQUIREMENT</span><div class="trace-text">“${escapeHtml(match.jdEvidence.sourceText || match.requirement)}”</div><span class="trace-path">${escapeHtml(match.jdEvidence.sourcePath)}</span></div><div><span class="eyebrow">YOUR EVIDENCE</span>${match.evidence.length ? match.evidence.map((item) => `<div class="trace-text"><span class="trace-path">${escapeHtml(item.sourcePath)}</span>“${escapeHtml(item.sourceText)}”</div>`).join('') : '<div class="trace-text">No supporting resume evidence was found in your current resume.</div>'}</div></div><p class="explanation"><strong>WHY</strong> ${escapeHtml(match.explanation.text)}</p></article>`).join('') : '<div class="evidence-empty panel"><p>No records match this filter.</p></div>';
  if (reverse) { const grouped = new Map(); result.matches.forEach((match) => match.evidence.forEach((item) => { if (!grouped.has(item.sourcePath)) grouped.set(item.sourcePath, { ...item, supports: [] }); grouped.get(item.sourcePath).supports.push(match); })); reverse.innerHTML = grouped.size ? [...grouped.values()].map((item) => `<div class="reverse-record"><strong>${escapeHtml(item.sourcePath)}</strong><div>“${escapeHtml(item.sourceText)}”</div><span>Supports: ${item.supports.map((m) => escapeHtml(m.requirement)).join(' · ')}</span></div>`).join('') : '<p class="job-result-note">No supporting mappings yet.</p>'; }
}
function renderMatchResult(result, container) {
  if (!container) return; const items = result.matches.map((match) => `<article class="match-item"><div class="match-item-top"><div><div class="match-item-name">${escapeHtml(match.requirement)}</div><div class="match-item-meta">${escapeHtml(match.importance)} · ${escapeHtml(match.category)}</div></div><span class="match-status ${escapeHtml(match.status)}">${escapeHtml(match.status)}</span></div>${match.evidence.length ? `<div class="match-evidence"><strong>Resume evidence</strong>${match.evidence.map((item) => `<div>${escapeHtml(item.sourcePath)} — ${escapeHtml(item.sourceText)}</div>`).join('')}</div>` : '<div class="match-evidence">No sufficient evidence found in the current resume.</div>'}</article>`).join('');
  renderEvidenceTraceability(result);
  const gapResult = { summary: { demonstrated: result.matches.filter((m) => m.status === 'supported').length, partial: result.matches.filter((m) => m.status === 'partial').length, notDemonstrated: result.matches.filter((m) => m.status === 'not-demonstrated').length, requiredGaps: result.matches.filter((m) => m.importance === 'required' && m.status !== 'supported').length, preferredGaps: result.matches.filter((m) => m.importance === 'preferred' && m.status !== 'supported').length }, gaps: result.matches.filter((m) => m.status !== 'supported').map((m) => ({ requirementId: m.requirementId, name: m.requirement, category: m.category, importance: m.importance, priority: m.importance === 'required' ? 'high' : 'medium', status: m.status, jdEvidence: m.jdEvidence, resumeEvidence: m.evidence, interpretation: m.status === 'partial' ? `Related evidence exists, but the current resume does not explicitly demonstrate ${m.requirement}.` : 'No supporting evidence was found in your current resume.', recommendation: { text: m.status === 'partial' ? `Add ${m.requirement}-specific evidence only if that experience is genuine.` : `Add existing ${m.requirement} evidence if you already have it, or build genuine ${m.requirement} experience before claiming it.` } })) }; renderSkillGaps(gapResult);
  const aiBox = document.getElementById('ai-insights-result'); if (aiBox) aiBox.innerHTML = '<div class="ai-insights-panel"><h3>Optional AI-enhanced insight</h3><p>AI is not configured. Deterministic baseline results remain the source of truth.</p><button type="button" class="button ghost" id="request-ai-insights">Request optional insight</button></div>';
  const aiStatus = document.getElementById('ai-status'); if (aiStatus) { aiStatus.textContent = 'Optional AI available · deterministic baseline'; const aiButton = document.getElementById('request-ai-insights'); if (aiButton) aiButton.addEventListener('click', requestAIInsights); }
  container.innerHTML = `<div class="match-result-header"><div class="match-score">${result.summary.scorePercent}%<small>deterministic baseline</small></div><div><div class="match-summary"><span><strong>${result.summary.required.supported}</strong>required supported</span><span><strong>${result.summary.required.partial}</strong>required partial</span><span><strong>${result.summary.preferred.supported}</strong>preferred supported</span><span><strong>${result.summary.required.notDemonstrated + result.summary.preferred.notDemonstrated}</strong>not demonstrated</span></div><p class="job-result-note">Based on evidence currently present in your resume. This is not an AI score or guarantee.</p></div></div><div class="match-list">${items || '<div class="empty-panel panel"><p>No requirements were found in this job description.</p></div>'}</div>`;
}
async function requestAIInsights() {
  const box = document.getElementById('ai-insights-result'); const jdText = document.getElementById('job-description')?.value || '';
  if (!box || !currentMatchResult || !jdText.trim()) return;
  box.innerHTML = '<div class="ai-insights-panel"><h3>Optional AI-enhanced insight</h3><p role="status">Requesting advisory insights…</p></div>';
  try {
    const parsedResponse = await fetch('/api/parse-job-description', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobDescription: jdText }) });
    if (!parsedResponse.ok) throw new Error('Baseline JD analysis failed.');
    const jobDescription = (await parsedResponse.json()).jobDescription;
    const matchResponse = await fetch('/api/match-resume-job', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resume: currentResume, jobDescription }) });
    if (!matchResponse.ok) throw new Error('Deterministic match could not be verified.');
    const matchResult = (await matchResponse.json()).matchResult;
    const gapResponse = await fetch('/api/skill-gaps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchResult }) });
    const skillGapResult = gapResponse.ok ? (await gapResponse.json()).skillGapResult : { gaps: [] };
    const response = await fetch('/api/ai-insights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resume: currentResume, jobDescription, matchResult, skillGapResult }) });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'AI insights unavailable.');
    currentAIInsights = payload; const improvements = payload.insights?.resumeImprovements || [];
    box.innerHTML = `<div class="ai-insights-panel"><div class="ai-panel-header"><div><h3>Optional AI-enhanced insight</h3><p>${escapeHtml(payload.quality?.notes || 'Advisory only. Deterministic baseline remains the source of truth.')}</p></div><span class="badge neutral">${escapeHtml(payload.mode || 'deterministic-fallback')}</span></div>${improvements.length ? improvements.map((item) => `<article class="ai-suggestion"><div><strong>Suggested wording</strong><p>${escapeHtml(item.suggestedText)}</p></div><div class="ai-suggestion-source"><strong>Original text</strong><p>${escapeHtml(item.originalText)}</p><span>${escapeHtml(item.originalSourcePath)}</span></div><p><strong>Rationale:</strong> ${escapeHtml(item.rationale)}</p><span class="requires-verification">Requires verification</span><div class="ai-suggestion-actions"><button type="button" class="button ghost" disabled>Accept after verification</button><button type="button" class="button ghost" data-reject-ai>Reject</button></div></article>`).join('') : '<p>No advisory suggestions were returned. Your deterministic evidence remains unchanged.</p>'}</div>`;
    box.querySelectorAll('[data-reject-ai]').forEach((button) => button.addEventListener('click', () => { button.closest('.ai-suggestion')?.remove(); }));
  } catch (error) { currentAIInsights = null; box.innerHTML = `<div class="ai-insights-panel"><h3>AI unavailable</h3><p>${escapeHtml(error.message)} Deterministic baseline results remain available.</p></div>`; }
}

function runBrowserBaselineMatch() {
  const result = document.getElementById('match-analysis-result'); const jdText = document.getElementById('job-description')?.value || ''; if (!jdText.trim()) { if (result) result.innerHTML = '<div class="empty-panel panel"><p>Paste a job description before running a match.</p></div>'; return; }
  const resume = currentResume || createDefaultResume(); const parsed = parseJobDescriptionBaseline(jdText); currentAnalysisFingerprint = analysisFingerprint(resume, jdText); const evidence = buildResumeEvidenceIndexForBrowser(resume); const matches = parsed.requirements.map((req, i) => { const terms = [req.name, req.name === 'javascript' ? 'js' : req.name, req.name === 'node.js' ? 'node' : req.name, req.name === 'kubernetes' ? 'k8s' : req.name]; const found = evidence.filter((item) => terms.some((term) => browserHasTerm(item.sourceText, term))); const sourceTerms = String(req.sourceText || '').split(/\s+/).filter(Boolean); const partial = !found.length && sourceTerms.some((term) => evidence.some((item) => browserHasTerm(item.sourceText, term))); return { id: `match_${i}`, requirementId: `req_${i}`, requirement: req.name, category: 'tool/technology', importance: req.importance, status: found.length ? 'supported' : partial ? 'partial' : 'not-demonstrated', matchType: found.length ? 'direct' : partial ? 'partial' : 'none', evidence: found.map((item) => ({ ...item, normalizedTerms: terms.map(browserTerm) })), jdEvidence: { sourcePath: `jobDescription.requirements[${i}]`, sourceText: req.sourceText || req.name }, explanation: { type: found.length ? 'direct-normalized-term' : partial ? 'partial-explicit-term' : 'no-evidence', text: found.length ? `Direct normalized term match: ${browserTerm(req.name)}` : partial ? `Partial explicit term match: ${browserTerm(req.name)}` : 'No supporting resume evidence was found.' }, confidence: found.length ? 1 : partial ? .5 : 0 }; }); const group = (importance) => { const items = matches.filter((m) => m.importance === importance); return { total: items.length, supported: items.filter((m) => m.status === 'supported').length, partial: items.filter((m) => m.status === 'partial').length, notDemonstrated: items.filter((m) => m.status === 'not-demonstrated').length }; }; const required = group('required'); const preferred = group('preferred'); const total = matches.length; const earned = matches.filter((m) => m.status === 'supported').length + matches.filter((m) => m.status === 'partial').length * .5; renderMatchResult({ summary: { scorePercent: total ? Math.round(earned / total * 100) : 0, required, preferred }, matches }, result);
}


// Browser adapter for the deterministic Phase 2 parser. The full data layer
// lives in lib/jobDescription.js for Node tests and server consumers.
function parseJobDescriptionBaseline(source) {
  const lines = String(source || '').replace(/\r/g, '').split('\n');
  const preferred = /\b(preferred|nice to have|bonus|plus|desirable|would be nice)\b/i;
  const required = /\b(required|must have|mandatory|essential|minimum)\b/i;
  const tech = ['python','javascript','js','typescript','node.js','node','react','docker','kubernetes','k8s','git','github','aws','azure','gcp','linux','sql','graphql','rest apis','siem'];
  const requirements = []; const responsibilities = []; const qualifications = []; const skills = { required: [], preferred: [] }; let section = 'general';
  const heading = (line) => { const v = line.replace(/:$/, '').trim().toLowerCase(); if (/responsibilities|what you.?ll do|duties/.test(v)) return 'responsibilities'; if (/qualifications|what you bring/.test(v)) return 'qualifications'; if (/preferred|nice to have|bonus/.test(v)) return 'preferred'; if (/requirements|skills|technologies/.test(v)) return 'requirements'; return ''; };
  lines.forEach((line) => { const raw = line.trim(); if (!raw) return; const h = heading(raw); if (h) { section = h; return; } const item = raw.replace(/^(?:[-*•]|\d+[.)])\s+/, '').trim(); const listed = item !== raw; const priority = section === 'preferred' || preferred.test(item) ? 'preferred' : 'required'; if (section === 'responsibilities' && (listed || item.length > 20)) responsibilities.push({ text: item, sourceText: item }); if (section === 'qualifications' && (listed || item.length > 15)) qualifications.push({ text: item, sourceText: item }); const matches = tech.filter((term) => new RegExp(`(^|[^a-z0-9+#])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9+#])`, 'i').test(item)); matches.forEach((term) => { const name = term === 'js' ? 'javascript' : term === 'node' ? 'node.js' : term === 'k8s' ? 'kubernetes' : term; if (!requirements.some((r) => r.name === name && r.importance === priority)) requirements.push({ name, importance: priority, sourceText: item }); const bucket = priority === 'preferred' ? skills.preferred : skills.required; if (!bucket.includes(name)) bucket.push(name); }); if (listed && !matches.length && (required.test(item) || preferred.test(item) || section === 'requirements' || section === 'qualifications')) requirements.push({ name: item, importance: priority, sourceText: item }); }); return { requirements, responsibilities, qualifications, skills }; }


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
const RESUME_VERSION = 1;
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
    version: RESUME_VERSION,
    schemaVersion: RESUME_SCHEMA_VERSION,
    personal: {
      name: '', headline: '', role: '', email: '', phone: '', location: '',
      website: '', linkedin: '', github: ''
    },
    summary: '', skills: [], experience: [], education: [], projects: [], certifications: [], achievements: []
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
  const dateParts = (entry) => {
    const range = normalizeText(entry.dateRange);
    const parts = range.split(/\s+[-–—]\s+/);
    return { startDate: normalizeText(entry.startDate || (parts.length > 1 ? parts[0] : range)), endDate: normalizeText(entry.endDate || (parts.length > 1 ? parts[1] : '')) };
  };
  return {
    version: RESUME_VERSION,
    schemaVersion: RESUME_SCHEMA_VERSION,
    personal: {
      name: normalizeText(personal.name),
      headline: normalizeText(personal.headline || personal.role),
      role: normalizeText(personal.role || personal.headline),
      email: normalizeText(personal.email), phone: normalizeText(personal.phone), location: normalizeText(personal.location),
      website: normalizeText(personal.website), linkedin: normalizeText(personal.linkedin), github: normalizeText(personal.github)
    },
    summary: normalizeText(source.summary), skills: normalizeStringList(source.skills),
    experience: normalizeEntries(source.experience, 'experience', (entry, id) => {
      const dates = dateParts(entry); return { id, company: normalizeText(entry.company), role: normalizeText(entry.role), startDate: dates.startDate, endDate: dates.endDate, current: entry.current === true, dateRange: normalizeText(entry.dateRange || [dates.startDate, dates.endDate].filter(Boolean).join(' - ')), bullets: normalizeStringList(entry.bullets) };
    }),
    education: normalizeEntries(source.education, 'education', (entry, id) => {
      const dates = dateParts(entry); const details = Array.isArray(entry.details) ? entry.details : String(entry.details || '').split(/\n/);
      return { id, institution: normalizeText(entry.institution), degree: normalizeText(entry.degree), startDate: dates.startDate, endDate: dates.endDate, dateRange: normalizeText(entry.dateRange || [dates.startDate, dates.endDate].filter(Boolean).join(' - ')), details: normalizeStringList(details) };
    }),
    projects: normalizeEntries(source.projects, 'project', (entry, id) => ({ id, name: normalizeText(entry.name || entry.title), title: normalizeText(entry.title || entry.name), description: normalizeText(entry.description), dateRange: normalizeText(entry.dateRange), technologies: normalizeStringList(entry.technologies), url: normalizeText(entry.url), bullets: normalizeStringList(entry.bullets) })),
    certifications: normalizeEntries(source.certifications, 'certification', (entry, id) => ({ id, name: normalizeText(entry.name), issuer: normalizeText(entry.issuer), date: normalizeText(entry.date), url: normalizeText(entry.url) })),
    achievements: normalizeStringList(source.achievements)
  };
}

// Return validation results without mutating the supplied resume. Normalization
// is included so callers can safely render or persist its canonical shape.
function validateStructuredResume(resume) {
  const errors = {};
  if (!resume || typeof resume !== 'object' || Array.isArray(resume)) {
    errors.schema = 'Resume must be an object.';
  } else if (!isStructuredResume(resume)) {
    errors.version = `Unsupported resume version. Expected ${RESUME_VERSION}.`;
  }
  if (resume && typeof resume === 'object') {
    ['skills', 'experience', 'education', 'projects', 'certifications', 'achievements'].forEach((field) => {
      if (resume[field] !== undefined && !Array.isArray(resume[field])) errors[field] = `${field} must be an array.`;
    });
    if (resume.personal !== undefined && (!resume.personal || typeof resume.personal !== 'object' || Array.isArray(resume.personal))) errors.personal = 'Personal details must be an object.';
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
  return Boolean(data && typeof data === 'object' && (data.version === RESUME_VERSION || data.schemaVersion === RESUME_SCHEMA_VERSION));
}

function getResumeSkills(resume) { return normalizeResume(resume).skills.slice(); }
function getExperienceBullets(resume) { return normalizeResume(resume).experience.flatMap((entry) => entry.bullets); }
function getProjectTechnologies(resume) { return normalizeResume(resume).projects.flatMap((entry) => entry.technologies); }
function getEducationDetails(resume) { return normalizeResume(resume).education.flatMap((entry) => entry.details); }
function getCertifications(resume) { return normalizeResume(resume).certifications.slice(); }

// Migrate the original flat localStorage shape into the v1 resume schema.
// This is pure: it returns a new object and never mutates `legacyData`.
function migrateLegacyResume(legacyData) {
  if (isStructuredResume(legacyData)) return normalizeResume(legacyData);
  if (!legacyData || typeof legacyData !== 'object') return createDefaultResume();

  const source = legacyData;
  const mapEntries = (text, prefix, mapper) => parseLegacySection(text)
    .map((entry, index) => mapper(entry, createDeterministicLegacyId(prefix, index, entry.raw)));

  return normalizeResume({
    version: RESUME_VERSION,
    schemaVersion: RESUME_SCHEMA_VERSION,
    personal: {
      name: source.name,
      role: source.role || source.headline,
      headline: source.headline || source.role,
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
    version: RESUME_VERSION,
    schemaVersion: RESUME_SCHEMA_VERSION,
    personal: {
      name: getFormValue('name'),
      headline: getFormValue('role'),
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
    bullets: Array.isArray(entry.details) ? entry.details : (entry.details ? String(entry.details).split('\n').filter(Boolean) : [])
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

function createEditorField(label, id, value, type = 'text') {
  const wrap = document.createElement('div'); wrap.className = 'field';
  const labelEl = document.createElement('label'); labelEl.htmlFor = id; labelEl.textContent = label;
  const input = type === 'textarea' ? document.createElement('textarea') : document.createElement('input'); input.id = id; input.name = id; input.value = value || ''; input.type = type === 'textarea' ? undefined : type; wrap.append(labelEl, input); return wrap;
}
function renderStructuredEditor(resume) {
  const form = document.getElementById('resume-form'); if (!form || document.getElementById('structured-editor')) return;
  Array.from(form.querySelectorAll('.form-section-block')).forEach((section) => section.classList.add('legacy-editor-surface'));
  const data = normalizeResume(resume); const panel = document.createElement('div'); panel.id = 'structured-editor'; panel.className = 'structured-editor';
  panel.innerHTML = '<div class="structured-editor-note"><strong>Structured editor</strong><span>Each item is stored as a separate evidence-ready record.</span></div><div class="form-section-block structured-block" data-editor-block="identity"><div class="form-section-title"><span>01</span><div><h2>Identity</h2><p>Personal information and professional positioning.</p></div></div><div class="form-grid" id="structured-identity"></div></div><div class="form-section-block structured-block" data-editor-block="profile"><div class="form-section-title"><span>02</span><div><h2>Profile</h2><p>Keep the summary grounded in your real work.</p></div></div><div class="form-grid" id="structured-profile"></div></div><div class="structured-block form-section-block" data-editor-block="experience"><div class="form-section-title"><span>03</span><div><h2>Experience</h2><p>Record roles, dates, and specific contributions.</p></div></div><div id="structured-experience" class="repeatable-list"></div><button type="button" class="button ghost add-entry" data-add-entry="experience">+ Add experience</button></div><div class="structured-block form-section-block" data-editor-block="education"><div class="form-section-title"><span>04</span><div><h2>Education</h2><p>Degrees and supporting details.</p></div></div><div id="structured-education" class="repeatable-list"></div><button type="button" class="button ghost add-entry" data-add-entry="education">+ Add education</button></div><div class="structured-block form-section-block" data-editor-block="projects"><div class="form-section-title"><span>05</span><div><h2>Projects</h2><p>Show work with verifiable technologies and links.</p></div></div><div id="structured-projects" class="repeatable-list"></div><button type="button" class="button ghost add-entry" data-add-entry="projects">+ Add project</button></div><div class="structured-block form-section-block" data-editor-block="certifications"><div class="form-section-title"><span>06</span><div><h2>Certifications & achievements</h2><p>Only include credentials and outcomes you can verify.</p></div></div><div id="structured-certifications" class="repeatable-list"></div><div class="field"><label for="structured-achievements">Achievements <small>one per line</small></label><textarea id="structured-achievements" rows="3"></textarea></div><button type="button" class="button ghost add-entry" data-add-entry="certifications">+ Add certification</button></div>';
  form.parentNode.insertBefore(panel, form); const identity = panel.querySelector('#structured-identity'); [['name','Full name'],['headline','Headline / role'],['email','Email'],['phone','Phone'],['location','Location'],['website','Website'],['linkedin','LinkedIn'],['github','GitHub']].forEach(([key,label]) => { const field = createEditorField(label, `structured-${key}`, key === 'name' ? data.personal.name : key === 'headline' ? data.personal.headline : data.personal[key]); if (key === 'name' || key === 'headline') field.classList.add('full'); identity.appendChild(field); });
  const profile = panel.querySelector('#structured-profile'); profile.appendChild(createEditorField('Summary','structured-summary',data.summary,'textarea')); profile.lastChild.classList.add('full'); profile.appendChild(createEditorField('Skills','structured-skills',data.skills.join(', ')));
  const entryTemplates = { experience: { company:'', role:'', startDate:'', endDate:'', current:false, bullets:[] }, education:{ institution:'', degree:'', startDate:'', endDate:'', details:[] }, projects:{ name:'', description:'', technologies:[], url:'', bullets:[] }, certifications:{ name:'', issuer:'', date:'', url:'' } };
  function renderEntries(type) { const holder = panel.querySelector(`#structured-${type}`); holder.innerHTML = ''; const entries = data[type].length ? data[type] : [entryTemplates[type]]; entries.forEach((entry,index) => { const card=document.createElement('div'); card.className='repeatable-entry'; card.dataset.type=type; card.dataset.index=index; const fields=document.createElement('div'); fields.className='form-grid'; const specs= type==='experience' ? [['company','Company'],['role','Role'],['startDate','Start date'],['endDate','End date']] : type==='education' ? [['institution','Institution'],['degree','Degree'],['startDate','Start date'],['endDate','End date']] : type==='projects' ? [['name','Project name'],['description','Description'],['technologies','Technologies (comma-separated)'],['url','Project URL']] : [['name','Certification'],['issuer','Issuer'],['date','Date'],['url','Certification URL']]; specs.forEach(([key,label]) => { const val=Array.isArray(entry[key]) ? entry[key].join(', ') : entry[key]; const field=createEditorField(label,`structured-${type}-${index}-${key}`,val,key==='description'?'textarea':'text'); if(key==='description') field.classList.add('full'); fields.appendChild(field); }); if(type==='experience'){ const current=document.createElement('label'); current.className='check-field'; current.innerHTML='<input type="checkbox"> Current role'; current.querySelector('input').checked=entry.current===true; fields.appendChild(current); } const longKey=type==='experience'||type==='projects'?'bullets':'details'; if(type!=='certifications'){ const field=createEditorField(type==='projects'?'Bullets':'Details',`structured-${type}-${index}-${longKey}`, (entry[longKey]||[]).join('\n'),'textarea'); field.classList.add('full'); fields.appendChild(field); } const remove=document.createElement('button'); remove.type='button'; remove.className='button ghost danger remove-entry'; remove.textContent='Remove'; remove.addEventListener('click',()=>{ data[type].splice(index,1); renderEntries(type); bindStructuredInputs(); syncStructuredEditor(); }); card.append(fields,remove); holder.appendChild(card); }); }
  ['experience','education','projects','certifications'].forEach(renderEntries); panel.querySelector('#structured-achievements').value=data.achievements.join('\n');
  panel.querySelectorAll('[data-add-entry]').forEach((button)=>button.addEventListener('click',()=>{ data[button.dataset.addEntry].push({ ...entryTemplates[button.dataset.addEntry], id:createResumeId(button.dataset.addEntry.slice(0,-1)) }); renderEntries(button.dataset.addEntry); bindStructuredInputs(); syncStructuredEditor(); }));
  function syncStructuredEditor(){ const get=(id)=>panel.querySelector(`#${id}`)?.value||''; data.personal.name=get('structured-name'); data.personal.headline=get('structured-headline'); data.personal.role=data.personal.headline; ['email','phone','location','website','linkedin','github'].forEach((key)=>data.personal[key]=get(`structured-${key}`)); data.summary=get('structured-summary'); data.skills=parseSkills(get('structured-skills')); data.achievements=get('structured-achievements').split('\n').map((v)=>v.trim()).filter(Boolean); ['experience','education','projects','certifications'].forEach((type)=>{ data[type]=Array.from(panel.querySelectorAll(`#structured-${type} .repeatable-entry`)).map((card)=>{ const index=Number(card.dataset.index); const old=data[type][index]||entryTemplates[type]; const value=(key)=>card.querySelector(`#structured-${type}-${index}-${key}`)?.value||''; const item={...old}; if(type==='experience'){item.company=value('company');item.role=value('role');item.startDate=value('startDate');item.endDate=value('endDate');item.current=card.querySelector('input[type="checkbox"]')?.checked===true;item.bullets=card.querySelector(`#structured-${type}-${index}-bullets`)?.value.split('\n').map((v)=>v.trim()).filter(Boolean)||[];} else if(type==='education'){item.institution=value('institution');item.degree=value('degree');item.startDate=value('startDate');item.endDate=value('endDate');item.details=card.querySelector(`#structured-${type}-${index}-details`)?.value.split('\n').map((v)=>v.trim()).filter(Boolean)||[];} else if(type==='projects'){item.name=value('name');item.title=item.name;item.description=value('description');item.url=value('url');item.technologies=parseSkills(value('technologies'));item.bullets=card.querySelector(`#structured-${type}-${index}-bullets`)?.value.split('\n').map((v)=>v.trim()).filter(Boolean)||[];} else {item.name=value('name');item.issuer=value('issuer');item.date=value('date');item.url=value('url');} return item; }); }); currentResume=normalizeResume(data); renderResume(currentResume); saveResume(currentResume); invalidateAnalysis('Resume changed — analysis needs to be refreshed.'); }
  function bindStructuredInputs(){ panel.querySelectorAll('input,textarea').forEach((field)=>{ field.removeEventListener('input',syncStructuredEditor); field.addEventListener('input',syncStructuredEditor); }); } bindStructuredInputs();
}

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
      Array.isArray(entry.details) ? entry.details : (entry.details ? String(entry.details).split('\n') : [])
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
  if (currentMatchResult) invalidateAnalysis('Resume changed — analysis needs to be refreshed.');
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
    invalidateAnalysis('Resume reset — analysis needs to be refreshed.');
    document.getElementById('structured-editor')?.remove();
    clearTimeout(saveResumeTimer);
    currentResume = createDefaultResume();
    populateFormFromResume(currentResume);
    removeFromStorage();
    renderResume(currentResume);
    updateValidationUI(getFormValidationData());
    renderStructuredEditor(currentResume);
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

  const views = Array.from(document.querySelectorAll('.view'));
  const navItems = Array.from(document.querySelectorAll('[data-view]'));
  const pageTitle = document.getElementById('page-title');
  const titleMap = { dashboard: 'Overview', resume: 'Resume', job: 'Job description', analysis: 'Match analysis', evidence: 'Evidence', gaps: 'Skill gaps', settings: 'Settings & privacy' };
  function showView(name) {
    views.forEach((view) => view.classList.toggle('active', view.id === 'view-' + name));
    navItems.forEach((item) => item.classList.toggle('active', item.dataset.view === name && item.classList.contains('nav-item')));
    if (pageTitle) pageTitle.textContent = titleMap[name] || 'Overview';
    document.querySelector('.sidebar')?.classList.remove('open');
    window.scrollTo(0, 0);
  }
  navItems.forEach((item) => item.addEventListener('click', () => showView(item.dataset.view)));
  document.getElementById('mobile-menu')?.addEventListener('click', () => document.querySelector('.sidebar')?.classList.toggle('open'));
  ['evidence-status-filter', 'evidence-importance-filter'].forEach((id) => document.getElementById(id)?.addEventListener('change', () => { if (currentMatchResult) renderEvidenceTraceability(currentMatchResult); }));
  ['gap-status-filter', 'gap-importance-filter', 'gap-priority-filter'].forEach((id) => document.getElementById(id)?.addEventListener('change', () => { if (currentSkillGapResult) renderSkillGaps(currentSkillGapResult); }));
  document.getElementById('run-analysis')?.addEventListener('click', runBrowserBaselineMatch);
  document.getElementById('request-ai-insights')?.addEventListener('click', requestAIInsights);
  document.querySelector('[data-reset-settings]')?.addEventListener('click', resetForm);
  const jobDescription = document.getElementById('job-description');
  const charCount = document.querySelector('.character-count');
  jobDescription?.addEventListener('input', () => { if (currentMatchResult) invalidateAnalysis('Job description changed — analysis needs to be refreshed.'); if (charCount) charCount.textContent = `${jobDescription.value.length.toLocaleString()} / 100,000`; });
  document.getElementById('analyze-job-description')?.addEventListener('click', () => {
    const result = document.getElementById('job-analysis-result');
    const source = jobDescription?.value || '';
    if (!source.trim()) { if (result) result.innerHTML = '<p class="job-result-note">Paste a job description to run a baseline analysis.</p>'; return; }
    if (source.length > 100000) { if (result) result.innerHTML = '<p class="job-result-note">This job description is too large. Keep it under 100,000 characters.</p>'; return; }
    const parsed = parseJobDescriptionBaseline(source); currentJobDescriptionModel = parsed;
    if (result) {
      const requirementItems = parsed.requirements.map((item) => `<li><span>${escapeHtml(item.name)}</span><small>${escapeHtml(item.importance)} · ${escapeHtml(item.sourceText)}</small></li>`).join('');
      result.innerHTML = `<h3>Baseline analysis <span class="badge neutral">Deterministic</span></h3><div class="job-result-grid"><div><strong>Requirements</strong><ul class="job-result-list">${requirementItems || '<li><span>No requirements found</span></li>'}</ul></div><div><strong>Sections detected</strong><ul class="job-result-list"><li><span>Responsibilities</span><small>${parsed.responsibilities.length}</small></li><li><span>Qualifications</span><small>${parsed.qualifications.length}</small></li><li><span>Required skills</span><small>${parsed.skills.required.length}</small></li><li><span>Preferred skills</span><small>${parsed.skills.preferred.length}</small></li></ul></div></div><p class="job-result-note">Source text is preserved for traceability. This is a lexical baseline, not semantic or AI analysis.</p>`;
    }
  });
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
  renderStructuredEditor(currentResume);

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
