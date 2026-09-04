/* ============================================================
   tests.js — Node.js test runner
   ------------------------------------------------------------
   Loads the pure functions from script.js with minimal DOM
   stubs and runs the test suite with Node's built-in assert.
   ============================================================ */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── Minimal DOM stubs (enough for the pure functions to load) ──

class StubNode {
  addEventListener() {}
  appendChild() {}
  removeChild() {}
  prepend() {}
  select() {}
  focus() {}
  blur() {}
  getAttribute() { return null; }
  setAttribute() {}
  removeAttribute() {}
  closest() { return null; }
  matches() { return false; }
  contains() { return false; }
  cloneNode() { return this; }
  insertBefore() { return null; }
  dispatchEvent() {}
}

class StubElement extends StubNode {
  constructor(tag) {
    super();
    this.tagName = (tag || 'div').toUpperCase();
    this.classList = { add() {}, remove() {}, contains() { return false; }, toggle() {} };
    this.style = {};
    this.dataset = {};
    this.parentNode = { insertBefore() {}, appendChild() {}, removeChild() {}, prepend() {} };
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.outerHTML = '';
    this.id = '';
    this.className = '';
    this.src = '';
    this.disabled = false;
    this.checked = false;
    this.type = '';
    this.children = [];
    this.childNodes = [];
    this.firstChild = null;
    this.lastChild = null;
    this.nextSibling = null;
    this.previousSibling = null;
    this.offsetWidth = 0;
    this.offsetHeight = 0;
    this.scrollTop = 0;
    this.scrollLeft = 0;
  }
}

// ── Global stubs ──

const localStorage = (() => {
  const store = {};
  return {
    getItem: (k) => (store[k] !== undefined ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] || null
  };
})();

const document = {
  addEventListener: () => {},
  removeEventListener: () => {},
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (tag) => new StubElement(tag),
  createTextNode: () => ({}),
  body: new StubElement('body'),
  head: new StubElement('head'),
  documentElement: new StubElement('html'),
  location: { href: 'http://localhost/', origin: 'http://localhost' },
  cookie: ''
};

// ── Set up globals ──

global.document = document;
global.window = global;
if (!Object.getOwnPropertyDescriptor(global, 'navigator')) {
  Object.defineProperty(global, 'navigator', {
    value: { clipboard: { writeText: () => Promise.resolve() } },
    writable: true,
    configurable: true
  });
}
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;
global.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve('') });
global.confirm = () => false;
global.alert = () => {};
global.location = { href: '', origin: '' };
global.localStorage = localStorage;
global.console = console;
global.DOMException = Error;
global.HTMLDocument = function HTMLDocument() {};

// ── Load script.js (the pure functions become available) ──

const scriptPath = path.join(__dirname, 'script.js');
const scriptCode = fs.readFileSync(scriptPath, 'utf8');

// Run the script in the current global context so its top-level function
// declarations (escapeHtml, sanitizeUrl, parseSection, ...) become global
// and can be exercised by the tests below. The DOM stubs above prevent the
// app's init() wiring from crashing in a Node environment.
vm.runInThisContext(scriptCode, { filename: scriptPath });

// ── Test runner ──

let passed = 0;
let failed = 0;
const testCases = [];

function test(label, fn) {
  testCases.push({ label, fn });
}

function assertSimilar(actual, expected) {
  // Deep equality with loose array comparison.
  assert.deepStrictEqual(actual, expected);
}

// ── Tests ──

console.log('\n  escapeHtml\n');

test('escapes <, >, &, ", \'', () => {
  assert.strictEqual(
    escapeHtml('<script>alert("xss")</script>'),
    '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
  );
  assert.strictEqual(escapeHtml("it's a test"), 'it&#39;s a test');
  assert.strictEqual(escapeHtml('a & b < c > d'), 'a &amp; b &lt; c &gt; d');
});

test('handles null / undefined / 0', () => {
  assert.strictEqual(escapeHtml(''), '');
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(undefined), '');
  assert.strictEqual(escapeHtml(0), '0');
  assert.strictEqual(escapeHtml('plain text'), 'plain text');
});

console.log('\n  escapeHtmlMultiline\n');

test('converts newlines to <br>', () => {
  assert.strictEqual(escapeHtmlMultiline('hello\nworld'), 'hello<br>world');
  assert.strictEqual(escapeHtmlMultiline('no newline'), 'no newline');
  assert.strictEqual(escapeHtmlMultiline('<script>\nalert(1)\n</script>'),
    '&lt;script&gt;<br>alert(1)<br>&lt;/script&gt;');
});

console.log('\n  sanitizeUrl\n');

test('allows https:// and http:// URLs', () => {
  assert.strictEqual(sanitizeUrl('https://example.com'), 'https://example.com');
  assert.strictEqual(sanitizeUrl('http://example.com'), 'http://example.com');
  assert.strictEqual(sanitizeUrl('https://linkedin.com/in/user'), 'https://linkedin.com/in/user');
});

test('rejects dangerous URL schemes', () => {
  assert.strictEqual(sanitizeUrl('javascript:alert(1)'), '');
  assert.strictEqual(sanitizeUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.strictEqual(sanitizeUrl('vbscript:msgbox(1)'), '');
  assert.strictEqual(sanitizeUrl('file:///etc/passwd'), '');
  assert.strictEqual(sanitizeUrl('JAVASCRIPT:alert(1)'), '');
});

test('rejects missing protocol', () => {
  assert.strictEqual(sanitizeUrl('www.example.com'), '');
  assert.strictEqual(sanitizeUrl('example.com'), '');
});

test('rejects empty / falsy input', () => {
  assert.strictEqual(sanitizeUrl(''), '');
  assert.strictEqual(sanitizeUrl(null), '');
  assert.strictEqual(sanitizeUrl(undefined), '');
  assert.strictEqual(sanitizeUrl('  '), '');
});

console.log('\n  validateField\n');

test('name is required and respects length limit', () => {
  assert.strictEqual(validateField('name', ''), 'Name is required.');
  assert.strictEqual(validateField('name', '  '), 'Name is required.');
  assert.strictEqual(validateField('name', 'John'), '');
  assert.strictEqual(validateField('name', 'A'.repeat(101)), 'Name must be under 100 characters.');
  assert.strictEqual(validateField('name', 'A'.repeat(100)), '');
});

test('role is required', () => {
  assert.strictEqual(validateField('role', ''), 'Role / headline is required.');
  assert.strictEqual(validateField('role', '  '), 'Role / headline is required.');
  assert.strictEqual(validateField('role', 'Developer'), '');
});

test('website URL validation', () => {
  assert.strictEqual(validateField('website', ''), '');
  assert.strictEqual(validateField('website', 'https://example.com'), '');
  assert.strictEqual(
    validateField('website', 'javascript:void(0)'),
    'Website must start with http:// or https:// (e.g. https://example.com).'
  );
  assert.strictEqual(
    validateField('website', 'not-a-url'),
    'Website must start with http:// or https:// (e.g. https://example.com).'
  );
});

test('skills validation', () => {
  assert.strictEqual(validateField('skills', ''), '');
  assert.strictEqual(validateField('skills', 'JavaScript'), '');
  assert.strictEqual(validateField('skills', '  '), '');
});

test('section validation (experience/education)', () => {
  assert.strictEqual(validateField('experience', ''), '');
  assert.strictEqual(validateField('experience', 'Company | Role | Did stuff'), '');
  assert.strictEqual(validateField('education', 'Uni | Degree | Studied CS'), '');
});

test('phone validation', () => {
  assert.strictEqual(validateField('phone', ''), '');
  assert.strictEqual(validateField('phone', '+1-555-1234'), '');
  assert.strictEqual(validateField('phone', '12'), 'Phone number looks too short.');
  assert.strictEqual(validateField('phone', '555-1234'), '');
});

console.log('\n  parseSection\n');

test('parses pipe-delimited entries', () => {
  const text = 'Company - Role | Jun 2025 | Did A | Did B\nOrg - Title | 2023 | Did C';
  const result = parseSection(text);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].main, 'Company - Role');
  assert.strictEqual(result[0].meta, 'Jun 2025');
  assert.deepStrictEqual(result[0].bullets, ['Did A', 'Did B']);
  assert.strictEqual(result[1].main, 'Org - Title');
  assert.strictEqual(result[1].meta, '2023');
  assert.deepStrictEqual(result[1].bullets, ['Did C']);
});

test('handles empty input', () => {
  assert.deepStrictEqual(parseSection(''), []);
  assert.deepStrictEqual(parseSection(null), []);
  assert.deepStrictEqual(parseSection(undefined), []);
});

test('handles minimum-format entries (no bullets)', () => {
  const text = 'Company - Role | Jun 2025';
  const result = parseSection(text);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].main, 'Company - Role');
  assert.strictEqual(result[0].meta, 'Jun 2025');
  assert.deepStrictEqual(result[0].bullets, []);
});

test('handles plain text fallback (no pipes)', () => {
  const text = 'Some plain text entry';
  const result = parseSection(text);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].main, 'Some plain text entry');
  assert.strictEqual(result[0].meta, '');
  assert.deepStrictEqual(result[0].bullets, []);
});

test('handles single pipe (minimum 2 parts required)', () => {
  const text = 'Only one | pipe';
  const result = parseSection(text);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].main, 'Only one');
  assert.strictEqual(result[0].meta, 'pipe');
  assert.deepStrictEqual(result[0].bullets, []);
});

console.log('\n  parseSkills\n');

test('parses comma-separated skills', () => {
  assert.deepStrictEqual(parseSkills('JavaScript, React, Node.js'), ['JavaScript', 'React', 'Node.js']);
  assert.deepStrictEqual(parseSkills('  CSS  ,  HTML  '), ['CSS', 'HTML']);
});

test('handles empty input', () => {
  assert.deepStrictEqual(parseSkills(''), []);
  assert.deepStrictEqual(parseSkills(null), []);
  assert.deepStrictEqual(parseSkills(undefined), []);
});

test('filters empty entries', () => {
  assert.deepStrictEqual(parseSkills('a, , b,'), ['a', 'b']);
});

console.log('\n  isStorageAvailable & storage\n');

test('isStorageAvailable returns true when localStorage works', () => {
  // localStorage stub always works.
  assert.strictEqual(isStorageAvailable(), true);
});

test('saveToStorage and loadFromStorage round-trip', () => {
  const data = {
    schemaVersion: 1,
    personal: { name: 'Test', role: 'Dev' }
  };
  saveToStorage(data);
  const loaded = loadFromStorage();
  assert.strictEqual(loaded.personal.name, 'Test');
  assert.strictEqual(loaded.personal.role, 'Dev');
});

test('removeFromStorage leaves a default structured resume', () => {
  saveToStorage({ schemaVersion: 1, personal: { name: 'Temp' } });
  removeFromStorage();
  const loaded = loadFromStorage();
  assert.strictEqual(loaded.schemaVersion, 1);
  assert.strictEqual(loaded.personal.name, '');
});

console.log('\n  structured resume model\n');

test('createDefaultResume returns the complete v1 resume shape', () => {
  const resume = createDefaultResume();
  assert.strictEqual(resume.schemaVersion, 1);
  assert.deepStrictEqual(resume.personal, {
    name: '', role: '', email: '', phone: '', location: '', website: '', linkedin: '', github: ''
  });
  assert.strictEqual(resume.summary, '');
  assert.deepStrictEqual(resume.skills, []);
  assert.deepStrictEqual(resume.experience, []);
  assert.deepStrictEqual(resume.education, []);
  assert.deepStrictEqual(resume.projects, []);
  assert.deepStrictEqual(resume.certifications, []);
});

test('validateStructuredResume validates required and protected fields', () => {
  const invalid = validateStructuredResume({
    schemaVersion: 1,
    personal: { name: '', role: '', website: 'javascript:alert(1)' }
  });
  assert.strictEqual(invalid.valid, false);
  assert.strictEqual(invalid.errors['personal.name'], 'Name is required.');
  assert.strictEqual(invalid.errors['personal.role'], 'Role / headline is required.');
  assert.ok(invalid.errors['personal.website']);

  const valid = validateStructuredResume({
    schemaVersion: 1,
    personal: { name: 'Ada Lovelace', role: 'Engineer', website: 'https://example.com' }
  });
  assert.strictEqual(valid.valid, true);
});

test('normalization assigns unique IDs and retains existing stable IDs', () => {
  const normalized = normalizeResume({
    experience: [
      { company: 'One' },
      { id: 'experience-kept', company: 'Two' }
    ]
  });
  assert.ok(normalized.experience[0].id);
  assert.notStrictEqual(normalized.experience[0].id, normalized.experience[1].id);
  assert.strictEqual(normalized.experience[1].id, 'experience-kept');

  const renormalized = normalizeResume(normalized);
  assert.strictEqual(renormalized.experience[0].id, normalized.experience[0].id);
  assert.strictEqual(renormalized.experience[1].id, 'experience-kept');

  const deduplicated = normalizeResume({ projects: [{ id: 'duplicate' }, { id: 'duplicate' }] });
  assert.notStrictEqual(deduplicated.projects[0].id, deduplicated.projects[1].id);
});

test('normalizeResume trims text and canonicalizes structured lists', () => {
  const resume = normalizeResume({
    schemaVersion: 99,
    personal: { name: '  Ada  ', role: '  Developer ' },
    summary: '  Builds things.  ',
    skills: [' JavaScript ', '', 'JavaScript', ' CSS '],
    projects: [{ title: '  Portfolio ', technologies: [' React ', '', 'React'], bullets: [' Shipped ' ] }]
  });
  assert.strictEqual(resume.schemaVersion, 1);
  assert.strictEqual(resume.personal.name, 'Ada');
  assert.strictEqual(resume.summary, 'Builds things.');
  assert.deepStrictEqual(resume.skills, ['JavaScript', 'CSS']);
  assert.strictEqual(resume.projects[0].title, 'Portfolio');
  assert.deepStrictEqual(resume.projects[0].technologies, ['React']);
  assert.deepStrictEqual(resume.projects[0].bullets, ['Shipped']);
});

function withFormFields(values, callback) {
  const originalGetElementById = document.getElementById;
  const fields = {};
  Object.keys(values).forEach((id) => {
    fields[id] = { value: values[id] };
  });
  document.getElementById = (id) => fields[id] || null;
  try {
    return callback(fields);
  } finally {
    document.getElementById = originalGetElementById;
  }
}

console.log('\n  structured editor state\n');

test('readFormIntoResume updates the structured model without a flat state object', () => {
  const previous = normalizeResume({
    personal: { email: 'ada@example.com' },
    experience: [{ id: 'experience-stable', company: 'Old', role: 'Role', dateRange: '', bullets: [] }]
  });
  const resume = withFormFields({
    name: 'Ada Lovelace', role: 'Engineer', summary: 'Builds systems.', skills: 'JavaScript, CSS',
    experience: 'Analytical Engines - Programmer | 1843 | Wrote an algorithm', education: '',
    phone: '+44 555 12345', location: 'London', website: 'https://ada.example.com',
    linkedin: 'https://linkedin.com/in/ada', github: 'https://github.com/ada', projects: '', certifications: ''
  }, () => readFormIntoResume(previous));

  assert.strictEqual(resume.personal.name, 'Ada Lovelace');
  assert.strictEqual(resume.personal.email, 'ada@example.com');
  assert.deepStrictEqual(resume.skills, ['JavaScript', 'CSS']);
  assert.strictEqual(resume.experience[0].id, 'experience-stable');
  assert.strictEqual(resume.experience[0].company, 'Analytical Engines');
  assert.deepStrictEqual(resume.experience[0].bullets, ['Wrote an algorithm']);
});

test('resumeToFormValues and populateFormFromResume preserve the current form UX', () => {
  const resume = normalizeResume({
    personal: { name: 'Grace Hopper', role: 'Engineer', phone: '555-1234' },
    skills: ['COBOL', 'Compilers'],
    education: [{ id: 'education-grace', institution: 'Yale', degree: 'PhD', dateRange: '1934', details: 'Mathematics' }],
    projects: [{ id: 'project-grace', title: 'Compiler', dateRange: '1952', technologies: ['COBOL'], bullets: ['Shipped'] }]
  });
  const values = resumeToFormValues(resume);
  assert.strictEqual(values.skills, 'COBOL, Compilers');
  assert.strictEqual(values.education, 'Yale - PhD | 1934 | Mathematics');
  assert.strictEqual(values.projects, 'Compiler | 1952 | COBOL | Shipped');

  withFormFields({ name: '', skills: '', education: '', projects: '' }, (fields) => {
    populateFormFromResume(resume);
    assert.strictEqual(fields.name.value, 'Grace Hopper');
    assert.strictEqual(fields.skills.value, 'COBOL, Compilers');
    assert.strictEqual(fields.projects.value, 'Compiler | 1952 | COBOL | Shipped');
  });
});

test('repeatable form entries retain IDs when their text is edited', () => {
  const previous = normalizeResume({
    experience: [{ id: 'experience-a', company: 'Acme', role: 'Developer', dateRange: '2024', bullets: [] }],
    certifications: [{ id: 'certification-a', name: 'Cert', issuer: 'Issuer', date: '2024' }]
  });
  const edited = withFormFields({
    name: '', role: '', summary: '', skills: '', education: '', phone: '', location: '', website: '', linkedin: '', github: '', projects: '',
    experience: 'Acme - Senior Developer | 2024 | Led delivery', certifications: 'Cert - Issuer | 2025'
  }, () => readFormIntoResume(previous));
  assert.strictEqual(edited.experience[0].id, 'experience-a');
  assert.strictEqual(edited.certifications[0].id, 'certification-a');
});

test('renderResume renders structured content and continues escaping user text', () => {
  const originalGetElementById = document.getElementById;
  const preview = { innerHTML: '' };
  document.getElementById = (id) => id === 'preview' ? preview : null;
  try {
    renderResume({
      personal: { name: '<img src=x onerror=alert(1)>', role: 'Engineer', website: 'javascript:alert(1)' },
      summary: 'Safe <b>text</b>', skills: ['JavaScript'],
      experience: [{ id: 'experience-safe', company: 'Acme', role: 'Developer', dateRange: '', bullets: ['Used <script>'] }]
    });
  } finally {
    document.getElementById = originalGetElementById;
  }
  assert.ok(preview.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(preview.innerHTML.includes('Safe &lt;b&gt;text&lt;/b&gt;'));
  assert.ok(preview.innerHTML.includes('Used &lt;script&gt;'));
  assert.ok(!preview.innerHTML.includes('href="javascript:'));
});

console.log('\n  legacy localStorage migration\n');

const legacyResumeFixture = {
  name: 'Ada Lovelace',
  role: 'Software Engineer',
  email: 'ada@example.com',
  summary: 'Writes reliable software.',
  skills: 'JavaScript, React, JavaScript, CSS',
  experience: 'Analytical Engines - Programmer | 1843 - 1844 | Wrote an algorithm | Documented the approach',
  education: 'University of London - Mathematics | 1832 - 1835 | Advanced mathematics',
  projects: 'Notes Engine | 1843 | JavaScript, HTML | Published documentation',
  certifications: 'Computing Certificate - Royal Society | 1844',
  phone: '+44 555 12345',
  location: 'London, UK',
  website: 'https://ada.example.com',
  linkedin: 'https://linkedin.com/in/ada',
  github: 'https://github.com/ada'
};

test('migrateLegacyResume preserves all major legacy fields and sets schema v1', () => {
  const original = JSON.parse(JSON.stringify(legacyResumeFixture));
  const migrated = migrateLegacyResume(legacyResumeFixture);
  assert.deepStrictEqual(legacyResumeFixture, original);
  assert.strictEqual(migrated.schemaVersion, 1);
  assert.deepStrictEqual(migrated.personal, {
    name: 'Ada Lovelace', role: 'Software Engineer', email: 'ada@example.com',
    phone: '+44 555 12345', location: 'London, UK', website: 'https://ada.example.com',
    linkedin: 'https://linkedin.com/in/ada', github: 'https://github.com/ada'
  });
  assert.strictEqual(migrated.summary, 'Writes reliable software.');
});

test('migration parses comma-separated skills without duplicates', () => {
  assert.deepStrictEqual(migrateLegacyResume(legacyResumeFixture).skills, ['JavaScript', 'React', 'CSS']);
});

test('migration parses legacy experience entries', () => {
  const entry = migrateLegacyResume(legacyResumeFixture).experience[0];
  assert.ok(entry.id);
  assert.strictEqual(entry.company, 'Analytical Engines');
  assert.strictEqual(entry.role, 'Programmer');
  assert.strictEqual(entry.dateRange, '1843 - 1844');
  assert.deepStrictEqual(entry.bullets, ['Wrote an algorithm', 'Documented the approach']);
});

test('migration parses legacy education entries', () => {
  const entry = migrateLegacyResume(legacyResumeFixture).education[0];
  assert.strictEqual(entry.institution, 'University of London');
  assert.strictEqual(entry.degree, 'Mathematics');
  assert.strictEqual(entry.dateRange, '1832 - 1835');
  assert.strictEqual(entry.details, 'Advanced mathematics');
});

test('migration parses legacy project entries', () => {
  const entry = migrateLegacyResume(legacyResumeFixture).projects[0];
  assert.strictEqual(entry.title, 'Notes Engine');
  assert.strictEqual(entry.dateRange, '1843');
  assert.deepStrictEqual(entry.technologies, ['JavaScript', 'HTML']);
  assert.deepStrictEqual(entry.bullets, ['Published documentation']);
});

test('migration parses legacy certification entries', () => {
  const entry = migrateLegacyResume(legacyResumeFixture).certifications[0];
  assert.strictEqual(entry.name, 'Computing Certificate');
  assert.strictEqual(entry.issuer, 'Royal Society');
  assert.strictEqual(entry.date, '1844');
});

test('migration preserves malformed legacy text in a safe structured field', () => {
  const malformed = {
    experience: 'Free-form experience note',
    education: 'Unstructured education note',
    projects: '| Unlabelled project note | Rust',
    certifications: 'Unstructured certification note'
  };
  const migrated = migrateLegacyResume(malformed);
  const serialized = JSON.stringify(migrated);
  assert.ok(serialized.includes('Free-form experience note'));
  assert.ok(serialized.includes('Unstructured education note'));
  assert.ok(serialized.includes('Unlabelled project note'));
  assert.ok(serialized.includes('Unstructured certification note'));
});

test('migration is deterministic and idempotent', () => {
  const migrated = migrateLegacyResume(legacyResumeFixture);
  const rerun = migrateLegacyResume(migrated);
  assert.deepStrictEqual(rerun, migrated);
});

test('already structured resumes are normalized but not migrated again', () => {
  const structured = createDefaultResume();
  structured.personal.name = 'Grace Hopper';
  structured.personal.role = 'Engineer';
  structured.experience.push({ id: 'experience-grace', company: 'Navy', role: 'Officer', dateRange: '', bullets: [] });
  const result = migrateLegacyResume(structured);
  assert.deepStrictEqual(result, normalizeResume(structured));
  assert.strictEqual(result.experience[0].id, 'experience-grace');
});

test('loadFromStorage migrates legacy data once and empty storage returns a default', () => {
  localStorage.clear();
  const empty = loadFromStorage();
  assert.strictEqual(empty.schemaVersion, 1);
  assert.deepStrictEqual(empty.experience, []);

  localStorage.setItem('resumeData', JSON.stringify(legacyResumeFixture));
  const migrated = loadFromStorage();
  const stored = JSON.parse(localStorage.getItem('resumeData'));
  assert.deepStrictEqual(stored, migrated);
  assert.deepStrictEqual(loadFromStorage(), migrated);
});

console.log('\n  evidence matching\n');

const { matchRequirement } = require('./lib/matching');

function requirement(text, id = 'req_001') {
  return { id, text };
}

function evidenceItem(overrides = {}) {
  return {
    id: 'ev_001', title: 'Python service', description: 'Built a Python API.', skills: ['Python'],
    ...overrides
  };
}

test('exact skill evidence supports the requirement', () => {
  const result = matchRequirement(requirement('Python'), [evidenceItem({ title: 'API service', description: 'Built a web API.' })]);
  assert.strictEqual(result.status, 'supported');
  assert.strictEqual(result.score, 0.6);
  assert.deepStrictEqual(result.evidenceIds, ['ev_001']);
});

test('matching checks a skill that is not first in the skills array', () => {
  const result = matchRequirement(requirement('Python'), [evidenceItem({ skills: ['JavaScript', 'Node.js', 'Python'] })]);
  assert.strictEqual(result.status, 'supported');
  assert.ok(result.reasons.some((reason) => reason.includes('Python is explicitly listed')));
});

test('description-only and title-only matching follow the unsupported threshold', () => {
  const description = matchRequirement(requirement('Python'), [evidenceItem({ id: 'ev_description', title: 'Service', description: 'Maintained Python code.', skills: [] })]);
  const title = matchRequirement(requirement('Python'), [evidenceItem({ id: 'ev_title', title: 'Python tooling', description: 'Maintained tools.', skills: [] })]);
  assert.strictEqual(description.status, 'unsupported');
  assert.strictEqual(description.score, 0.2);
  assert.strictEqual(title.status, 'unsupported');
  assert.strictEqual(title.score, 0.1);
});

test('does not treat SQL as PostgreSQL or infer absent Kubernetes', () => {
  const sql = matchRequirement(requirement('PostgreSQL'), [evidenceItem({ skills: ['SQL'], title: 'Database work', description: 'Worked with SQL.' })]);
  const kubernetes = matchRequirement(requirement('Kubernetes'), [evidenceItem({ skills: ['Docker'], title: 'Container work', description: 'Built containers.' })]);
  assert.strictEqual(sql.status, 'unsupported');
  assert.strictEqual(kubernetes.status, 'unsupported');
});

test('generic cloud evidence for AWS is unverified and dynamically explained', () => {
  const result = matchRequirement(requirement('AWS'), [evidenceItem({ id: 'ev_cloud', title: 'Deployment', description: 'Deployed the application to the cloud.', skills: [] })]);
  assert.strictEqual(result.status, 'unverified');
  assert.deepStrictEqual(result.evidenceIds, ['ev_cloud']);
  assert.ok(result.reasons.every((reason) => reason.includes('AWS')));
  assert.ok(result.reasons.every((reason) => !reason.includes('Python')));
});

test('scores use the strongest evidence and never exceed one', () => {
  const result = matchRequirement(requirement('Python'), [
    evidenceItem({ id: 'ev_a' }),
    evidenceItem({ id: 'ev_b', title: 'Python application', description: 'Built a Python application.', skills: ['Python'] })
  ]);
  assert.ok(result.score <= 1);
  assert.deepStrictEqual(result.evidenceIds, ['ev_a', 'ev_b']);
});

test('empty evidence is unsupported with no evidence IDs', () => {
  const result = matchRequirement(requirement('Python'), []);
  assert.deepStrictEqual(result, { requirementId: 'req_001', status: 'unsupported', score: 0, evidenceIds: [], reasons: [] });
});

test('explicit aliases match without broad technology equivalence', () => {
  const result = matchRequirement(requirement('js', 'req_alias'), [evidenceItem({ id: 'ev_js', skills: ['JavaScript'], title: 'Web work', description: 'Built a web page.' })]);
  assert.strictEqual(result.status, 'supported');
  assert.strictEqual(result.requirementId, 'req_alias');
  assert.deepStrictEqual(result.evidenceIds, ['ev_js']);
});

test('reasons only cite signals actually present in the selected evidence', () => {
  const result = matchRequirement(requirement('Python'), [evidenceItem({ id: 'ev_skill', title: 'Service', description: 'Built an API.', skills: ['Python'] })]);
  assert.strictEqual(result.reasons.length, 1);
  assert.ok(result.reasons[0].includes('ev') === false);
  assert.ok(result.reasons[0].includes('explicitly listed'));
  assert.ok(!result.reasons[0].includes('description'));
});

console.log('\n  job analysis\n');

const { parseJobDescription, normalizeRequirement, classifyRequirement, detectPriority } = require('./lib/jobParser');
const http = require('http');

function requestJson(baseUrl, pathname, options = {}) {
  const url = new URL(pathname, baseUrl);
  const body = options.body === undefined ? null : JSON.stringify(options.body);
  return new Promise((resolve, reject) => {
    const request = http.request(url, {
      method: options.method || 'GET',
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : undefined
    }, (response) => {
      let raw = '';
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => resolve({
        status: response.statusCode,
        body: raw ? JSON.parse(raw) : null
      }));
    });
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

const jobDescriptionFixture = `We are looking for a software engineer.

Requirements:
- 2+ years of experience with Python and REST APIs
- Strong knowledge of Git
- Familiarity with Docker

Nice to have:
- AWS experience
- Kubernetes`;

test('job parser extracts Python, REST APIs, Git, and Docker requirements', () => {
  const requirements = parseJobDescription(jobDescriptionFixture).requirements;
  assert.deepStrictEqual(requirements.map((item) => item.skill), ['Python', 'REST APIs', 'Git', 'Docker', 'AWS', 'Kubernetes']);
  assert.strictEqual(requirements[0].category, 'programming_language');
  assert.strictEqual(requirements[1].category, 'technical_skill');
  assert.strictEqual(requirements[2].category, 'tool');
});

test('job parser detects required and preferred priorities', () => {
  const requirements = parseJobDescription(jobDescriptionFixture).requirements;
  assert.strictEqual(requirements.find((item) => item.skill === 'Python').priority, 'required');
  assert.strictEqual(requirements.find((item) => item.skill === 'AWS').priority, 'preferred');
  assert.strictEqual(detectPriority('Docker is required.'), 'required');
  assert.strictEqual(detectPriority('AWS is a nice to have.'), 'preferred');
});

test('job parser preserves source text and creates deterministic requirement IDs', () => {
  const requirements = parseJobDescription(jobDescriptionFixture).requirements;
  assert.strictEqual(requirements[0].id, 'req_001');
  assert.strictEqual(requirements[1].id, 'req_002');
  assert.strictEqual(requirements[0].sourceText, '2+ years of experience with Python and REST APIs');
  assert.strictEqual(requirements[0].text, 'Python');
  assert.strictEqual(requirements[1].text, 'REST APIs');
});

test('job parser deduplicates explicit skills and does not infer technologies', () => {
  const parsed = parseJobDescription('- Python required\n- Experience with Python\n- Familiarity with cloud deployment').requirements;
  assert.strictEqual(parsed.filter((item) => item.skill === 'Python').length, 1);
  assert.ok(!parsed.some((item) => item.skill === 'AWS'));
  assert.strictEqual(normalizeRequirement('  REST   APIs '), 'rest apis');
  assert.strictEqual(classifyRequirement('Build software systems'), 'responsibility');
});

test('each explicit skill has specific text while retaining shared provenance', () => {
  const sourceText = 'We are looking for a software engineer with Python, REST APIs, Git and Docker.';
  const awsSourceText = 'AWS experience is preferred.';
  const requirements = parseJobDescription(`${sourceText} ${awsSourceText}`).requirements;
  const expectedSkills = ['Python', 'REST APIs', 'Git', 'Docker'];
  expectedSkills.forEach((skill) => {
    const item = requirements.find((requirement) => requirement.skill === skill);
    assert.strictEqual(item.text, skill);
    assert.strictEqual(item.sourceText, sourceText);
  });
  const aws = requirements.find((item) => item.skill === 'AWS');
  assert.strictEqual(aws.text, 'AWS');
  assert.strictEqual(aws.sourceText, awsSourceText);
  assert.strictEqual(aws.priority, 'preferred');
});

test('non-skill experience requirements retain their meaningful full text', () => {
  const sourceText = 'Minimum 2+ years of software engineering experience';
  const requirement = parseJobDescription(`- ${sourceText}`).requirements[0];
  assert.strictEqual(requirement.text, sourceText);
  assert.strictEqual(requirement.skill, null);
  assert.strictEqual(requirement.category, 'experience');
});

test('matching prioritizes requirement.skill and reasons name that specific requirement', () => {
  const sourceText = 'We are looking for a software engineer with Python, REST APIs, Git and Docker.';
  const result = matchRequirement({ id: 'req_specific', text: sourceText, skill: 'Python', sourceText }, [
    evidenceItem({ id: 'ev_python', title: 'API work', description: 'Built services.', skills: ['Python'] })
  ]);
  assert.strictEqual(result.status, 'supported');
  assert.deepStrictEqual(result.evidenceIds, ['ev_python']);
  assert.ok(result.reasons.every((reason) => reason.includes('Python')));
  assert.ok(result.reasons.every((reason) => !reason.includes(sourceText)));
});

test('analyze-job validates input and returns parsed requirements with evidence matches', async () => {
  const { app } = require('./server');
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let temporaryId;

  try {
    let response = await requestJson(baseUrl, '/api/analyze-job', { method: 'POST', body: { jobDescription: '   ' } });
    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body.error, 'Job description is required.');

    response = await requestJson(baseUrl, '/api/analyze-job', { method: 'POST', body: { jobDescription: 42 } });
    assert.strictEqual(response.status, 400);

    response = await requestJson(baseUrl, '/api/evidence');
    assert.strictEqual(response.status, 200);

    response = await requestJson(baseUrl, '/api/evidence', {
      method: 'POST', body: { title: 'Temporary Python evidence', type: 'project', description: 'Built a Python API.', skills: ['Python'] }
    });
    assert.strictEqual(response.status, 201);
    const created = response.body;
    temporaryId = created.id;

    response = await requestJson(baseUrl, `/api/evidence/${temporaryId}`);
    assert.strictEqual(response.status, 200);

    response = await requestJson(baseUrl, `/api/evidence/${temporaryId}`, {
      method: 'PUT', body: { title: 'Temporary Python evidence', type: 'project', description: 'Built a Python API.', skills: ['Python', 'REST APIs'] }
    });
    assert.strictEqual(response.status, 200);

    const liveDescription = 'We are looking for a software engineer with Python, REST APIs, Git and Docker. AWS experience is preferred.';
    response = await requestJson(baseUrl, '/api/analyze-job', { method: 'POST', body: { jobDescription: liveDescription } });
    assert.strictEqual(response.status, 200);
    const analysis = response.body;
    assert.strictEqual(analysis.requirements.length, 5);
    assert.strictEqual(analysis.matches.length, analysis.requirements.length);
    assert.deepStrictEqual(analysis.requirements.map((item) => item.text), ['Python', 'REST APIs', 'Git', 'Docker', 'AWS']);
    assert.strictEqual(analysis.requirements[0].sourceText, 'We are looking for a software engineer with Python, REST APIs, Git and Docker.');
    assert.strictEqual(analysis.requirements[4].priority, 'preferred');
    const pythonMatch = analysis.matches.find((match) => match.requirementId === analysis.requirements.find((item) => item.skill === 'Python').id);
    assert.ok(pythonMatch.evidenceIds.includes(temporaryId));

    response = await requestJson(baseUrl, `/api/evidence/${temporaryId}`, { method: 'DELETE' });
    assert.strictEqual(response.status, 204);
    temporaryId = null;
    response = await requestJson(baseUrl, `/api/evidence/${created.id}`);
    assert.strictEqual(response.status, 404);
  } finally {
    if (temporaryId) await requestJson(baseUrl, `/api/evidence/${temporaryId}`, { method: 'DELETE' });
    await new Promise((resolve) => server.close(resolve));
  }
});

// ── Summary ──

async function runTests() {
  for (const { label, fn } of testCases) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${label}`);
    } catch (error) {
      failed++;
      console.log(`  ✗ ${label}`);
      console.log(`      ${error.message}`);
    }
  }

  const total = passed + failed;
  console.log(`\n  ${'─'.repeat(40)}`);
  console.log(`  Result: ${passed}/${total} passed`);
  if (failed > 0) {
    console.log(`  ${failed} test(s) FAILED`);
    process.exitCode = 1;
  } else {
    console.log('  All tests passed!');
  }
}

runTests();
