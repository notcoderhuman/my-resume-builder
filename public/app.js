(() => {
  'use strict';

  const state = { evidence: [], editingId: null };

  const $ = (s) => document.querySelector(s);

  const el = {
    add: $('#add-evidence-button'),
    editor: $('#editor'),
    viewer: $('#viewer'),
    form: $('#evidence-form'),
    editorTitle: $('#editor-title'),
    closeEditor: $('#close-editor'),
    cancelEditor: $('#cancel-editor'),
    addMetric: $('#add-metric'),
    metrics: $('#metrics'),
    list: $('#evidence-list'),
    message: $('#message'),
    details: $('#evidence-details'),
    closeViewer: $('#close-viewer'),
    total: $('#total-count'),
    projects: $('#project-count'),
    verified: $('#verified-count'),
    title: $('#title'),
    type: $('#type'),
    description: $('#description'),
    skills: $('#skills'),
    date: $('#date'),
    sourceType: $('#source-type'),
    sourceUrl: $('#source-url')
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function message(text, kind = '') {
    el.message.textContent = text;
    el.message.className = `message ${kind}`.trim();
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    if (response.status === 204) return null;

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }

    return data;
  }

  function formatType(type) {
    return String(type || 'other')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  function renderStats() {
    el.total.textContent = state.evidence.length;
    el.projects.textContent =
      state.evidence.filter(x => x.type === 'project').length;
    el.verified.textContent =
      state.evidence.filter(x => x.verification?.status === 'verified').length;
  }

  function renderList() {
    renderStats();

    if (!state.evidence.length) {
      el.list.innerHTML = `
        <div class="empty-state">
          <h2>No evidence yet</h2>
          <p>Add your first piece of career evidence.</p>
        </div>
      `;
      return;
    }

    el.list.innerHTML = state.evidence.map(item => {
      const skills = (item.skills || [])
        .slice(0, 5)
        .map(s => `<span class="chip">${escapeHtml(s)}</span>`)
        .join('');

      const status = item.verification?.status || 'unverified';

      return `
        <article class="evidence-card">
          <div class="evidence-card-content">
            <p class="eyebrow">${escapeHtml(formatType(item.type))}</p>
            <h2>${escapeHtml(item.title)}</h2>
            <p>${escapeHtml(item.description)}</p>

            <div class="chips">
              ${skills || '<span class="hint">No skills added.</span>'}
            </div>

            <div class="evidence-meta">
              <span>${escapeHtml(item.date || 'No date')}</span>
              <span>${escapeHtml(status)}</span>
            </div>
          </div>

          <div class="evidence-actions">
            <button type="button" data-action="view" data-id="${escapeHtml(item.id)}">View</button>
            <button type="button" data-action="edit" data-id="${escapeHtml(item.id)}">Edit</button>
            <button type="button" data-action="delete" data-id="${escapeHtml(item.id)}">Delete</button>
          </div>
        </article>
      `;
    }).join('');
  }

  async function loadEvidence() {
    try {
      const data = await api('/api/evidence');
      state.evidence = Array.isArray(data) ? data : [];
      renderList();
    } catch (error) {
      console.error(error);
      message(error.message, 'error');
    }
  }

  function addMetricRow(label = '', value = '') {
    const row = document.createElement('div');
    row.className = 'metric-row';

    row.innerHTML = `
      <input class="metric-label" type="text" placeholder="Label">
      <input class="metric-value" type="text" placeholder="Value">
      <button type="button" class="text-button remove-metric">Remove</button>
    `;

    row.querySelector('.metric-label').value = label;
    row.querySelector('.metric-value').value = value;

    row.querySelector('.remove-metric').addEventListener('click', () => {
      row.remove();
    });

    el.metrics.appendChild(row);
  }

  function openEditor(item = null) {
    state.editingId = item?.id || null;
    el.editorTitle.textContent = item ? 'Edit Evidence' : 'Add Evidence';

    el.form.reset();
    el.metrics.innerHTML = '';

    if (item) {
      el.title.value = item.title || '';
      el.type.value = item.type || 'project';
      el.description.value = item.description || '';
      el.skills.value = (item.skills || []).join(', ');
      el.date.value = item.date || '';
      el.sourceType.value = item.source?.type || '';
      el.sourceUrl.value = item.source?.url || '';

      (item.metrics || []).forEach(metric => {
        addMetricRow(metric.label, metric.value);
      });
    }

    el.editor.classList.remove('hidden');
    el.title.focus();
  }

  function closeEditor() {
    el.editor.classList.add('hidden');
    state.editingId = null;
    el.form.reset();
    el.metrics.innerHTML = '';
  }

  function openViewer(item) {
    const skills = (item.skills || [])
      .map(s => `<span class="chip">${escapeHtml(s)}</span>`)
      .join('');

    const metrics = (item.metrics || [])
      .map(m => `<li><strong>${escapeHtml(m.label)}:</strong> ${escapeHtml(m.value)}</li>`)
      .join('');

    const source = item.source?.url
      ? `<a href="${escapeHtml(item.source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.source.url)}</a>`
      : 'No source URL';

    el.details.innerHTML = `
      <p class="eyebrow">${escapeHtml(formatType(item.type))}</p>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.description)}</p>

      <div class="detail-block">
        <strong>Skills</strong>
        <div class="chips">
          ${skills || '<span class="hint">No skills added.</span>'}
        </div>
      </div>

      <div class="detail-block">
        <strong>Date</strong>
        <p>${escapeHtml(item.date || 'Not provided')}</p>
      </div>

      <div class="detail-block">
        <strong>Source</strong>
        <p>${source}</p>
      </div>

      <div class="detail-block">
        <strong>Metrics</strong>
        ${metrics ? `<ul>${metrics}</ul>` : '<p class="hint">No metrics added.</p>'}
      </div>

      <div class="detail-block">
        <strong>Verification</strong>
        <p>${escapeHtml(item.verification?.status || 'unverified')}</p>
      </div>
    `;

    el.viewer.classList.remove('hidden');
  }

  function closeViewer() {
    el.viewer.classList.add('hidden');
    el.details.innerHTML = '';
  }

  function collectForm() {
    const skills = el.skills.value
      .split(',')
      .map(x => x.trim())
      .filter(Boolean);

    const metrics = [...el.metrics.querySelectorAll('.metric-row')]
      .map(row => ({
        label: row.querySelector('.metric-label').value.trim(),
        value: row.querySelector('.metric-value').value.trim()
      }))
      .filter(x => x.label || x.value);

    const data = {
      title: el.title.value.trim(),
      type: el.type.value,
      description: el.description.value.trim(),
      skills,
      metrics
    };

    if (el.date.value) data.date = el.date.value;

    const sourceType = el.sourceType.value.trim();
    const sourceUrl = el.sourceUrl.value.trim();

    if (sourceType || sourceUrl) {
      data.source = {};
      if (sourceType) data.source.type = sourceType;
      if (sourceUrl) data.source.url = sourceUrl;
    }

    return data;
  }

  async function submit(event) {
    event.preventDefault();

    try {
      const payload = collectForm();

      if (state.editingId) {
        await api(`/api/evidence/${encodeURIComponent(state.editingId)}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        message('Evidence updated successfully.', 'success');
      } else {
        await api('/api/evidence', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        message('Evidence added successfully.', 'success');
      }

      closeEditor();
      await loadEvidence();
    } catch (error) {
      console.error(error);
      message(error.message, 'error');
    }
  }

  async function listClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const item = state.evidence.find(x => x.id === button.dataset.id);
    if (!item) return;

    if (button.dataset.action === 'view') {
      openViewer(item);
    }

    if (button.dataset.action === 'edit') {
      openEditor(item);
    }

    if (button.dataset.action === 'delete') {
      if (!confirm(`Delete "${item.title}"?`)) return;

      try {
        await api(`/api/evidence/${encodeURIComponent(item.id)}`, {
          method: 'DELETE'
        });

        message('Evidence deleted.', 'success');
        await loadEvidence();
      } catch (error) {
        console.error(error);
        message(error.message, 'error');
      }
    }
  }

  el.add.addEventListener('click', () => openEditor());
  el.closeEditor.addEventListener('click', closeEditor);
  el.cancelEditor.addEventListener('click', closeEditor);
  el.closeViewer.addEventListener('click', closeViewer);
  el.addMetric.addEventListener('click', () => addMetricRow());
  el.form.addEventListener('submit', submit);
  el.list.addEventListener('click', listClick);

  loadEvidence();
})();
