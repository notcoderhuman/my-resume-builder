'use strict';

const evidenceTypes = new Set([
  'project', 'experience', 'education', 'certification',
  'achievement', 'competition', 'publication', 'other'
]);

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function validateEvidenceInput(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, error: 'Evidence must be a JSON object.' };
  }

  const title = asTrimmedString(input.title);
  const type = asTrimmedString(input.type);
  const description = asTrimmedString(input.description);
  if (!title) errors.push('Title is required.');
  if (!description) errors.push('Description is required.');
  if (!evidenceTypes.has(type)) errors.push('Type must be a supported evidence type.');

  let skills = [];
  if (input.skills !== undefined) {
    if (!Array.isArray(input.skills) || input.skills.some((skill) => typeof skill !== 'string')) {
      errors.push('Skills must be an array of strings.');
    } else {
      skills = input.skills.map(asTrimmedString).filter(Boolean);
    }
  }

  let date;
  if (input.date !== undefined && input.date !== '') {
    date = asTrimmedString(input.date);
    if (!isValidDate(date)) errors.push('Date must be a valid YYYY-MM-DD date.');
  }

  let source;
  if (input.source !== undefined && input.source !== null) {
    if (!input.source || typeof input.source !== 'object' || Array.isArray(input.source)) {
      errors.push('Source must be an object.');
    } else {
      source = {};
      if (input.source.type !== undefined) {
        source.type = asTrimmedString(input.source.type);
        if (!source.type) errors.push('Source type must be a string.');
      }
      if (input.source.url !== undefined && input.source.url !== '') {
        source.url = asTrimmedString(input.source.url);
        if (!isValidHttpUrl(source.url)) errors.push('Source URL must be a valid http(s) URL.');
      }
    }
  }

  let metrics = [];
  if (input.metrics !== undefined) {
    if (!Array.isArray(input.metrics)) {
      errors.push('Metrics must be an array.');
    } else {
      metrics = input.metrics.map((metric) => ({
        label: asTrimmedString(metric && metric.label),
        value: asTrimmedString(metric && metric.value)
      }));
      if (metrics.some((metric) => !metric.label || !metric.value)) {
        errors.push('Every metric must include label and value strings.');
      }
    }
  }

  if (errors.length) return { valid: false, error: errors.join(' ') };

  const evidence = { title, type, description, skills, metrics };
  if (date) evidence.date = date;
  if (source && Object.keys(source).length) evidence.source = source;
  return { valid: true, value: evidence };
}

module.exports = { evidenceTypes, validateEvidenceInput };
