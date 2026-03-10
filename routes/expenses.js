const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /expenses
router.get('/expenses', (req, res) => {
  const expenses      = db.getExpenses();
  const members       = db.getMembers();
  const categories    = db.getCategories();
  const totalExpenses = db.getTotalExpenses();
  const breakdown     = db.getBreakdown();

  res.render('expenses', {
    expenses,
    members,
    categories,
    totalExpenses: parseFloat(totalExpenses).toFixed(2),
    breakdown,
    ok:  req.query.ok  || null,
    err: req.query.err || null,
  });
});

// POST /expenses — add an expense
router.post('/expenses', (req, res) => {
  const { member_name, category, amount, memo } = req.body;

  if (!member_name || !category || !amount) {
    return res.redirect('/expenses?err=All+fields+required');
  }

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return res.redirect('/expenses?err=Invalid+amount');
  }

  // Validate against the dynamic categories table
  if (!db.categoryExists(category)) {
    return res.redirect('/expenses?err=Invalid+category');
  }

  db.addExpense({ member_name, category, amount: amountNum, memo });
  db.logActivity({
    member_name,
    action:    'add_expense',
    new_value: `£${amountNum.toFixed(2)} for ${category}${memo ? ` (${memo})` : ''}`,
  });

  res.redirect('/expenses?ok=1');
});

// ── Category management ───────────────────────────────────────────────────────

// POST /categories — create new category
router.post('/categories', (req, res) => {
  const name = (req.body.name || '').trim().toLowerCase();
  if (!name) return res.redirect('/expenses?err=Category+name+required');
  if (name.length > 30) return res.redirect('/expenses?err=Name+too+long+(max+30+chars)');
  if (db.categoryExists(name)) return res.redirect('/expenses?err=Category+already+exists');

  db.addCategory(name);
  db.logActivity({ member_name: 'System', action: 'add_category', new_value: name });
  res.redirect('/expenses?ok=1');
});

// POST /categories/:id/rename
router.post('/categories/:id/rename', (req, res) => {
  const id      = parseInt(req.params.id);
  const newName = (req.body.name || '').trim().toLowerCase();

  if (!newName) return res.redirect('/expenses?err=Name+required');
  if (newName.length > 30) return res.redirect('/expenses?err=Name+too+long+(max+30+chars)');
  if (db.categoryExists(newName)) return res.redirect('/expenses?err=Name+already+in+use');

  db.renameCategory(id, newName);
  db.logActivity({ member_name: 'System', action: 'rename_category', new_value: newName });
  res.redirect('/expenses?ok=1');
});

// POST /categories/:id/delete
router.post('/categories/:id/delete', (req, res) => {
  const id     = parseInt(req.params.id);
  const result = db.deleteCategory(id);

  if (!result.ok) {
    return res.redirect(`/expenses?err=${encodeURIComponent(result.err)}`);
  }

  db.logActivity({ member_name: 'System', action: 'delete_category', new_value: 'Removed' });
  res.redirect('/expenses?ok=1');
});

module.exports = router;
