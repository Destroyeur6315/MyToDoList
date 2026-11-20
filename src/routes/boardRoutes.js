'use strict';

/**
 * Board routes (authenticated, mounted on `/api`):
 * - `GET/PUT /state`: full snapshot used by the web page;
 * - `/tabs`, `/lists` and `/tasks`: per-resource REST routes for other clients.
 */

const express = require('express');
const { HttpError, ValidationError } = require('../http/errors');
const {
  LIMITS, normalizeList, normalizeTab, normalizeTabUpdate, normalizeTask, validateBoardSnapshot
} = require('../domain/validation');
const { generateId } = require('../security/crypto');

const TAB_NOT_FOUND = 'Onglet introuvable';
const LIST_NOT_FOUND = 'Liste introuvable';
const TASK_NOT_FOUND = 'Tâche introuvable';

/**
 * @param {object} deps
 * @param {ReturnType<import('../db/repositories/boardRepository').createBoardRepository>} deps.board
 */
function createBoardRouter({ board }) {
  const router = express.Router();

  const assertTabExists = (userId, tabId) => {
    if (!board.tabExists(userId, tabId)) throw new HttpError(404, TAB_NOT_FOUND);
  };
  const assertListExists = (userId, listId) => {
    if (!board.listExists(userId, listId)) throw new HttpError(404, LIST_NOT_FOUND);
  };

  /* ── Full snapshot ── */

  router.get('/state', (req, res) => {
    res.json(board.readState(req.user.id));
  });

  // Atomic replacement guarded by `revision` (optimistic locking).
  router.put('/state', (req, res) => {
    const { revision, ...snapshot } = validateBoardSnapshot(req.body);
    if (!board.replaceState(req.user.id, revision, snapshot)) {
      throw new HttpError(409, 'Les données ont été modifiées ailleurs. Rechargez la page.');
    }
    res.json({ revision: revision + 1 });
  });

  /* ── Tabs ── */

  router.get('/tabs', (req, res) => {
    res.json(board.allTabs(req.user.id));
  });

  // New tabs are appended on the right.
  router.post('/tabs', (req, res) => {
    const tab = board.createTab(req.user.id, normalizeTab({ ...req.body, id: generateId() }), LIMITS.maxTabs);
    if (!tab) throw new ValidationError(`Limite de ${LIMITS.maxTabs} onglets atteinte.`);
    res.status(201).json(tab);
  });

  // `{ name?, position? }`: rename and/or move (0 = leftmost).
  router.patch('/tabs/:id', (req, res) => {
    const existing = board.findTab(req.user.id, req.params.id);
    if (!existing) throw new HttpError(404, TAB_NOT_FOUND);
    res.json(board.updateTab(req.user.id, existing.id, normalizeTabUpdate(req.body, existing)));
  });

  // Deletes the tab with all of its lists and tasks.
  router.delete('/tabs/:id', (req, res) => {
    const result = board.deleteTab(req.user.id, req.params.id);
    if (result === 'not-found') throw new HttpError(404, TAB_NOT_FOUND);
    if (result === 'last-tab') throw new ValidationError('Impossible de supprimer le dernier onglet.');
    res.status(204).end();
  });

  /* ── Lists ── */

  router.get('/lists', (req, res) => {
    res.json(board.allLists(req.user.id));
  });

  // Without `tabId`, the list goes to the leftmost tab.
  router.post('/lists', (req, res) => {
    const tabId = req.body?.tabId ?? board.firstTab(req.user.id)?.id;
    const list = normalizeList({ ...req.body, tabId, id: generateId(), archived: false });
    assertTabExists(req.user.id, list.tabId);
    if (!board.createList(req.user.id, list, LIMITS.maxLists)) {
      throw new ValidationError(`Limite de ${LIMITS.maxLists} listes atteinte.`);
    }
    res.status(201).json(list);
  });

  router.patch('/lists/:id', (req, res) => {
    const existing = board.findList(req.user.id, req.params.id);
    if (!existing) throw new HttpError(404, LIST_NOT_FOUND);
    // Identity and creation date are immutable.
    const list = normalizeList({ ...existing, ...req.body, id: existing.id, createdAt: existing.createdAt });
    assertTabExists(req.user.id, list.tabId);
    board.updateList(req.user.id, list);
    res.json(list);
  });

  router.delete('/lists/:id', (req, res) => {
    if (!board.deleteList(req.user.id, req.params.id)) throw new HttpError(404, LIST_NOT_FOUND);
    res.status(204).end();
  });

  /* ── Tasks ── */

  router.get('/tasks', (req, res) => {
    res.json(board.allTasks(req.user.id));
  });

  router.post('/tasks', (req, res) => {
    const task = normalizeTask({ ...req.body, id: generateId() });
    assertListExists(req.user.id, task.listId);
    if (!board.createTask(req.user.id, task, LIMITS.maxTasks)) {
      throw new ValidationError(`Limite de ${LIMITS.maxTasks} tâches atteinte.`);
    }
    res.status(201).json(task);
  });

  router.patch('/tasks/:id', (req, res) => {
    const existing = board.findTask(req.user.id, req.params.id);
    if (!existing) throw new HttpError(404, TASK_NOT_FOUND);
    const task = normalizeTask({ ...existing, ...req.body, id: existing.id, createdAt: existing.createdAt });
    assertListExists(req.user.id, task.listId);
    board.updateTask(req.user.id, task);
    res.json(task);
  });

  router.delete('/tasks/:id', (req, res) => {
    if (!board.deleteTask(req.user.id, req.params.id)) throw new HttpError(404, TASK_NOT_FOUND);
    res.status(204).end();
  });

  return router;
}

module.exports = { createBoardRouter };
