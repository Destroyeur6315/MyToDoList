'use strict';

/**
 * Board routes (authenticated, mounted on `/api`):
 * - `GET/PUT /state`: full snapshot used by the web page;
 * - `/lists` and `/tasks`: per-resource REST routes for other clients.
 */

const express = require('express');
const { HttpError, ValidationError } = require('../http/errors');
const { LIMITS, normalizeList, normalizeTask, validateBoardSnapshot } = require('../domain/validation');
const { generateId } = require('../security/crypto');

const LIST_NOT_FOUND = 'Liste introuvable';
const TASK_NOT_FOUND = 'Tâche introuvable';

/**
 * @param {object} deps
 * @param {ReturnType<import('../db/repositories/boardRepository').createBoardRepository>} deps.board
 */
function createBoardRouter({ board }) {
  const router = express.Router();

  const assertListExists = (userId, listId) => {
    if (!board.listExists(userId, listId)) throw new HttpError(404, LIST_NOT_FOUND);
  };

  /* ── Full snapshot ── */

  router.get('/state', (req, res) => {
    res.json(board.readState(req.user.id));
  });

  // Atomic replacement guarded by `revision` (optimistic locking).
  router.put('/state', (req, res) => {
    const { lists, tasks, revision } = validateBoardSnapshot(req.body);
    if (!board.replaceState(req.user.id, revision, lists, tasks)) {
      throw new HttpError(409, 'Les données ont été modifiées ailleurs. Rechargez la page.');
    }
    res.json({ revision: revision + 1 });
  });

  /* ── Lists ── */

  router.get('/lists', (req, res) => {
    res.json(board.allLists(req.user.id));
  });

  router.post('/lists', (req, res) => {
    const list = normalizeList({ ...req.body, id: generateId(), archived: false });
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
