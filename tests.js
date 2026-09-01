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

function test(label, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${label}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${label}`);
    console.log(`      ${e.message}`);
  }
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
  const data = { name: 'Test', role: 'Dev' };
  saveToStorage(data);
  const loaded = loadFromStorage();
  assert.strictEqual(loaded.name, 'Test');
  assert.strictEqual(loaded.role, 'Dev');
});

test('removeFromStorage clears data', () => {
  saveToStorage({ name: 'Temp' });
  removeFromStorage();
  const loaded = loadFromStorage();
  assert.strictEqual(loaded, null);
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

// ── Summary ──

const total = passed + failed;
console.log(`\n  ${'─'.repeat(40)}`);
console.log(`  Result: ${passed}/${total} passed`);
if (failed > 0) {
  console.log(`  ${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log('  All tests passed!');
}
