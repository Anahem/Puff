const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'puff.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS members (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    amount        REAL NOT NULL DEFAULT 0.0,
    joints        REAL NOT NULL DEFAULT 0.0,
    is_guest      INTEGER NOT NULL DEFAULT 0,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT DEFAULT (datetime('now')),
    last_activity TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS squad_settings (
    id                INTEGER PRIMARY KEY,
    ganja             REAL NOT NULL DEFAULT 0.0,
    becky             REAL NOT NULL DEFAULT 0.0,
    papers            REAL NOT NULL DEFAULT 0.0,
    misc              REAL NOT NULL DEFAULT 0.0,
    session_start     TEXT DEFAULT (datetime('now')),
    updated_at        TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    member_name  TEXT NOT NULL,
    category     TEXT NOT NULL,
    amount       REAL NOT NULL,
    memo         TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activities (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    member_name    TEXT NOT NULL,
    action         TEXT NOT NULL,
    previous_value TEXT,
    new_value      TEXT NOT NULL,
    timestamp      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS session_history (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    start_date        TEXT NOT NULL,
    end_date          TEXT NOT NULL,
    total_joints      INTEGER NOT NULL DEFAULT 0,
    total_expenses    REAL NOT NULL DEFAULT 0.0,
    price_per_joint   REAL NOT NULL DEFAULT 0.0,
    active_members    INTEGER NOT NULL DEFAULT 0,
    breakdown_json    TEXT NOT NULL,
    member_data_json  TEXT NOT NULL,
    expense_data_json TEXT NOT NULL,
    created_at        TEXT DEFAULT (datetime('now'))
  );
`);

// ── Migrations ────────────────────────────────────────────────────────────────
// Add 'active' column to existing databases that pre-date this change
const memberCols = db.prepare('PRAGMA table_info(members)').all();
if (!memberCols.find(c => c.name === 'active')) {
  db.exec('ALTER TABLE members ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
}

// Add actual_joints / actual_expenses columns to session_history if absent
const histCols = db.prepare('PRAGMA table_info(session_history)').all();
if (!histCols.find(c => c.name === 'actual_joints')) {
  db.exec('ALTER TABLE session_history ADD COLUMN actual_joints REAL');
  db.exec('ALTER TABLE session_history ADD COLUMN actual_expenses REAL');
  // Backfill from existing JSON snapshots
  const histRows  = db.prepare('SELECT id, member_data_json, expense_data_json FROM session_history').all();
  const histUpd   = db.prepare('UPDATE session_history SET actual_joints = @aj, actual_expenses = @ae WHERE id = @id');
  histRows.forEach(row => {
    const mems       = JSON.parse(row.member_data_json  || '[]');
    const exps       = JSON.parse(row.expense_data_json || '[]');
    const guestNames = mems.filter(m => m.is_guest).map(m => m.name);
    const aj = parseFloat(mems.filter(m => !m.is_guest).reduce((s, m) => s + (m.joints || 0), 0).toFixed(4));
    const ae = parseFloat(exps.filter(e => !guestNames.includes(e.member_name)).reduce((s, e) => s + (e.amount || 0), 0).toFixed(2));
    histUpd.run({ '@id': row.id, '@aj': aj, '@ae': ae });
  });
}

// Seed squad_settings row if absent
const hasSettings = db.prepare('SELECT id FROM squad_settings WHERE id = 1').get();
if (!hasSettings) {
  db.prepare('INSERT INTO squad_settings (id) VALUES (1)').run();
}

// Seed guest member if absent
const hasGuest = db.prepare('SELECT id FROM members WHERE is_guest = 1 LIMIT 1').get();
if (!hasGuest) {
  db.prepare("INSERT INTO members (name, is_guest) VALUES ('Guest', 1)").run();
}

// Seed default categories if none exist yet
const catCount = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
if (catCount === 0) {
  const seedCat = db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)');
  ['ganja', 'becky', 'papers', 'misc'].forEach((name, i) => seedCat.run(name, i));
}

// ── Prepared statements ───────────────────────────────────────────────────────

const stmts = {
  // Members
  allMembers:       db.prepare('SELECT * FROM members WHERE active = 1 ORDER BY is_guest ASC, name ASC'),
  allInactive:      db.prepare('SELECT * FROM members WHERE active = 0 ORDER BY name ASC'),
  memberById:       db.prepare('SELECT * FROM members WHERE id = @id'),
  memberByName:     db.prepare('SELECT * FROM members WHERE name = @name LIMIT 1'),
  insertMember:     db.prepare('INSERT INTO members (name) VALUES (@name)'),
  updateJoints:     db.prepare("UPDATE members SET joints = @joints, last_activity = datetime('now') WHERE id = @id"),
  updateAmount:     db.prepare("UPDATE members SET amount = @amount, last_activity = datetime('now') WHERE id = @id"),
  deleteMember:     db.prepare('DELETE FROM members WHERE id = @id'),
  totalJoints:      db.prepare('SELECT COALESCE(SUM(joints), 0) AS total FROM members WHERE active = 1'),
  deactivateAll:    db.prepare("UPDATE members SET active = 0, joints = 0, amount = 0 WHERE is_guest = 0"),
  reactivateMember: db.prepare("UPDATE members SET active = 1, joints = 0, amount = 0, last_activity = datetime('now') WHERE id = @id"),

  // Squad settings (kept for session_start only)
  getSettings:  db.prepare('SELECT * FROM squad_settings WHERE id = 1'),
  resetSettings: db.prepare(`
    UPDATE squad_settings
    SET ganja = 0, becky = 0, papers = 0, misc = 0,
        session_start = datetime('now'), updated_at = datetime('now')
    WHERE id = 1
  `),

  // Categories
  allCategories:   db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, name ASC'),
  categoryById:    db.prepare('SELECT * FROM categories WHERE id = @id'),
  categoryByName:  db.prepare('SELECT * FROM categories WHERE name = @name LIMIT 1'),
  insertCategory:  db.prepare('INSERT INTO categories (name, sort_order) VALUES (@name, @sort_order)'),
  renameCategory:  db.prepare('UPDATE categories SET name = @name WHERE id = @id'),
  deleteCategory:  db.prepare('DELETE FROM categories WHERE id = @id'),
  maxCatOrder:     db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories'),

  // Expenses
  allExpenses:       db.prepare('SELECT * FROM expenses ORDER BY created_at DESC'),
  expensesByMember:  db.prepare('SELECT member_name, COALESCE(SUM(amount), 0) AS total_paid FROM expenses GROUP BY member_name'),
  expensesByCategory:db.prepare('SELECT category, COALESCE(SUM(amount), 0) AS total FROM expenses GROUP BY category'),
  expensesTotal:     db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses'),
  expenseCountByCat: db.prepare('SELECT COUNT(*) AS n FROM expenses WHERE category = @category'),
  insertExpense:     db.prepare(`
    INSERT INTO expenses (member_name, category, amount, memo)
    VALUES (@member_name, @category, @amount, @memo)
  `),

  // Activities
  recentActivities: db.prepare('SELECT * FROM activities ORDER BY timestamp DESC LIMIT 25'),
  allActivities:    db.prepare('SELECT * FROM activities ORDER BY timestamp DESC'),
  insertActivity:   db.prepare(`
    INSERT INTO activities (member_name, action, previous_value, new_value)
    VALUES (@member_name, @action, @previous_value, @new_value)
  `),

  // Session history
  allHistory:    db.prepare('SELECT * FROM session_history ORDER BY end_date DESC'),
  insertHistory: db.prepare(`
    INSERT INTO session_history (
      start_date, end_date, total_joints, total_expenses, price_per_joint,
      active_members, breakdown_json, member_data_json, expense_data_json,
      actual_joints, actual_expenses
    ) VALUES (
      @start_date, @end_date, @total_joints, @total_expenses, @price_per_joint,
      @active_members, @breakdown_json, @member_data_json, @expense_data_json,
      @actual_joints, @actual_expenses
    )
  `),

  clearExpenses: db.prepare('DELETE FROM expenses'),
};

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  // Members
  getMembers()         { return stmts.allMembers.all(); },
  getInactiveMembers() { return stmts.allInactive.all(); },
  getMemberById(id)    { return stmts.memberById.get({ '@id': id }); },

  addMember(name) {
    // Reactivate an existing inactive member rather than creating a duplicate
    const existing = stmts.memberByName.get({ '@name': name });
    if (existing && !existing.active) {
      stmts.reactivateMember.run({ '@id': existing.id });
      return stmts.memberById.get({ '@id': existing.id });
    }
    const r = stmts.insertMember.run({ '@name': name });
    return stmts.memberById.get({ '@id': Number(r.lastInsertRowid) });
  },

  setJoints(id, joints) { stmts.updateJoints.run({ '@id': id, '@joints': joints }); },
  setAmount(id, amount) { stmts.updateAmount.run({ '@id': id, '@amount': amount }); },
  deleteMember(id)      { stmts.deleteMember.run({ '@id': id }); },
  getTotalJoints()      { return stmts.totalJoints.get().total; },

  // Squad settings (session_start only)
  getSettings() { return stmts.getSettings.get(); },

  // Categories
  getCategories() { return stmts.allCategories.all(); },

  addCategory(name) {
    const maxOrder = stmts.maxCatOrder.get().m;
    const r = stmts.insertCategory.run({ '@name': name, '@sort_order': maxOrder + 1 });
    return stmts.categoryById.get({ '@id': Number(r.lastInsertRowid) });
  },

  renameCategory(id, name) {
    stmts.renameCategory.run({ '@id': id, '@name': name });
  },

  // Only delete if no expenses use this category this session
  deleteCategory(id) {
    const cat = stmts.categoryById.get({ '@id': id });
    if (!cat) return { ok: false, err: 'Category not found' };
    const count = stmts.expenseCountByCat.get({ '@category': cat.name }).n;
    if (count > 0) return { ok: false, err: `Cannot delete — ${count} expense(s) use this category` };
    stmts.deleteCategory.run({ '@id': id });
    return { ok: true };
  },

  categoryExists(name) {
    return !!stmts.categoryByName.get({ '@name': name });
  },

  // Expenses — computed dynamically from the expenses table
  getTotalExpenses() { return stmts.expensesTotal.get().total; },

  getBreakdown() {
    const rows = stmts.expensesByCategory.all();
    const map = {};
    rows.forEach(r => { map[r.category] = r.total; });
    return map;
  },

  getExpenses() { return stmts.allExpenses.all(); },

  getExpensesByMember() {
    const rows = stmts.expensesByMember.all();
    const map = {};
    rows.forEach(r => { map[r.member_name] = r.total_paid; });
    return map;
  },

  addExpense({ member_name, category, amount, memo }) {
    stmts.insertExpense.run({
      '@member_name': member_name,
      '@category':    category,
      '@amount':      amount,
      '@memo':        memo || null,
    });
  },

  // Activities
  getActivities()   { return stmts.recentActivities.all(); },
  getAllActivities() { return stmts.allActivities.all(); },

  logActivity({ member_name, action, previous_value, new_value }) {
    stmts.insertActivity.run({
      '@member_name':    member_name,
      '@action':         action,
      '@previous_value': previous_value || null,
      '@new_value':      new_value,
    });
  },

  // Session history
  getSessionHistory() { return stmts.allHistory.all(); },

  closeSession() {
    const settings = stmts.getSettings.get();
    const members  = stmts.allMembers.all();
    const expenses = stmts.allExpenses.all();

    const totalJoints   = stmts.totalJoints.get().total;
    const totalExpenses = stmts.expensesTotal.get().total;
    const pricePerJoint = totalJoints > 0
      ? parseFloat((totalExpenses / totalJoints).toFixed(4))
      : 0;
    const activeMembers = members.filter(m => !m.is_guest).length;

    // Dynamic breakdown from expenses table
    const breakdown = {};
    stmts.expensesByCategory.all().forEach(r => { breakdown[r.category] = r.total; });

    // Build paid-per-member map
    const paidByMember = {};
    stmts.expensesByMember.all().forEach(r => { paidByMember[r.member_name] = r.total_paid; });

    // Attach calculated netOwed to each member snapshot
    const memberSnapshot = members.map(m => {
      const paid    = paidByMember[m.name] || 0;
      const netOwed = parseFloat((m.joints * pricePerJoint - paid).toFixed(2));
      return { ...m, paidAmount: paid, netOwed };
    });

    // Actual (non-guest) totals for reporting
    const guestNames     = members.filter(m => m.is_guest).map(m => m.name);
    const actualJoints   = parseFloat(members.filter(m => !m.is_guest).reduce((s, m) => s + m.joints, 0).toFixed(4));
    const actualExpenses = parseFloat(expenses.filter(e => !guestNames.includes(e.member_name)).reduce((s, e) => s + e.amount, 0).toFixed(2));

    stmts.insertHistory.run({
      '@start_date':        settings.session_start || new Date().toISOString(),
      '@end_date':          new Date().toISOString(),
      '@total_joints':      totalJoints,
      '@total_expenses':    totalExpenses,
      '@price_per_joint':   pricePerJoint,
      '@active_members':    activeMembers,
      '@breakdown_json':    JSON.stringify(breakdown),
      '@member_data_json':  JSON.stringify(memberSnapshot),
      '@expense_data_json': JSON.stringify(expenses),
      '@actual_joints':     actualJoints,
      '@actual_expenses':   actualExpenses,
    });

    stmts.deactivateAll.run();
    stmts.clearExpenses.run();
    stmts.resetSettings.run();
  },
};
