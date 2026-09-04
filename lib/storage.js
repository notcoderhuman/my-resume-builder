'use strict';

const fs = require('fs/promises');
const path = require('path');

const dataDirectory = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDirectory, 'evidence.json');

function emptyStore() {
  return { version: 1, evidence: [] };
}

async function ensureStorage() {
  await fs.mkdir(dataDirectory, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.writeFile(dataFile, JSON.stringify(emptyStore(), null, 2) + '\n', 'utf8');
  }
}

async function readStore() {
  await ensureStorage();
  const raw = await fs.readFile(dataFile, 'utf8');
  let store;
  try {
    store = JSON.parse(raw);
  } catch (error) {
    throw new Error('Evidence storage contains invalid JSON. It was not changed.');
  }

  if (!store || typeof store !== 'object' || !Array.isArray(store.evidence)) {
    throw new Error('Evidence storage has an invalid shape. It was not changed.');
  }

  return { version: 1, evidence: store.evidence };
}

async function writeStore(store) {
  if (!store || !Array.isArray(store.evidence)) {
    throw new Error('Cannot write invalid evidence storage.');
  }

  await ensureStorage();
  const temporaryFile = `${dataFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify({ version: 1, evidence: store.evidence }, null, 2) + '\n', 'utf8');
  await fs.rename(temporaryFile, dataFile);
}

module.exports = { readStore, writeStore, ensureStorage, dataFile };
