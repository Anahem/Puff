const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /history
router.get('/history', (req, res) => {
  const history = db.getSessionHistory().map(s => ({
    ...s,
    breakdown:    JSON.parse(s.breakdown_json    || '{}'),
    member_data:  JSON.parse(s.member_data_json  || '[]'),
    expense_data: JSON.parse(s.expense_data_json || '[]'),
  }));

  res.render('history', {
    history,
    ok: req.query.ok || null,
  });
});

// POST /session/close
router.post('/session/close', (req, res) => {
  db.logActivity({ member_name: 'System', action: 'close_session', new_value: 'Session closed and reset' });
  db.closeSession();
  res.redirect('/history?ok=1');
});

module.exports = router;
