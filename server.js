'use strict';

const crypto = require('crypto');
const express = require('express');
const path = require('path');
const { readStore, writeStore, ensureStorage } = require('./lib/storage');
const { validateEvidenceInput } = require('./lib/validation');
const { parseJobDescription } = require('./lib/jobParser');
const { matchRequirement } = require('./lib/matching');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function sendStorageError(response, error) {
  console.error(error);
  response.status(500).json({ error: 'Unable to access evidence storage.' });
}

app.get('/api/evidence', async (request, response) => {
  try {
    const store = await readStore();
    response.json(store.evidence);
  } catch (error) {
    sendStorageError(response, error);
  }
});

app.get('/api/evidence/:id', async (request, response) => {
  try {
    const store = await readStore();
    const item = store.evidence.find((evidence) => evidence.id === request.params.id);
    if (!item) return response.status(404).json({ error: 'Evidence item not found.' });
    response.json(item);
  } catch (error) {
    sendStorageError(response, error);
  }
});

app.post('/api/evidence', async (request, response) => {
  const validation = validateEvidenceInput(request.body);
  if (!validation.valid) return response.status(400).json({ error: validation.error });

  try {
    const store = await readStore();
    const now = new Date().toISOString();
    const item = {
      id: `ev_${crypto.randomUUID()}`,
      ...validation.value,
      verification: { status: 'unverified', confidence: 0 },
      createdAt: now,
      updatedAt: now
    };
    store.evidence.push(item);
    await writeStore(store);
    response.status(201).json(item);
  } catch (error) {
    sendStorageError(response, error);
  }
});

app.put('/api/evidence/:id', async (request, response) => {
  const validation = validateEvidenceInput(request.body);
  if (!validation.valid) return response.status(400).json({ error: validation.error });

  try {
    const store = await readStore();
    const index = store.evidence.findIndex((evidence) => evidence.id === request.params.id);
    if (index === -1) return response.status(404).json({ error: 'Evidence item not found.' });

    const existing = store.evidence[index];
    const item = {
      id: existing.id,
      ...validation.value,
      verification: existing.verification || { status: 'unverified', confidence: 0 },
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    };
    store.evidence[index] = item;
    await writeStore(store);
    response.json(item);
  } catch (error) {
    sendStorageError(response, error);
  }
});

app.delete('/api/evidence/:id', async (request, response) => {
  try {
    const store = await readStore();
    const index = store.evidence.findIndex((evidence) => evidence.id === request.params.id);
    if (index === -1) return response.status(404).json({ error: 'Evidence item not found.' });
    store.evidence.splice(index, 1);
    await writeStore(store);
    response.status(204).send();
  } catch (error) {
    sendStorageError(response, error);
  }
});

app.post('/api/analyze-job', async (request, response) => {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body) || typeof request.body.jobDescription !== 'string' || !request.body.jobDescription.trim()) {
    return response.status(400).json({ error: 'Job description is required.' });
  }

  const jobDescription = request.body.jobDescription.trim();
  try {
    const analysis = parseJobDescription(jobDescription);
    const store = await readStore();
    const matches = analysis.requirements.map((requirement) => matchRequirement({
      ...requirement,
      text: requirement.skill || requirement.text
    }, store.evidence));
    response.json({ jobDescription, requirements: analysis.requirements, matches });
  } catch (error) {
    sendStorageError(response, error);
  }
});

app.use((error, request, response, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return response.status(400).json({ error: 'Request body must contain valid JSON.' });
  }
  next(error);
});

function startServer() {
  return ensureStorage()
    .then(() => app.listen(port, () => console.log(`Liquid Evidence is running at http://localhost:${port}`)));
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Unable to initialize evidence storage.', error);
    process.exit(1);
  });
}

module.exports = { app, startServer };
