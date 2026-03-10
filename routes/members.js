const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET / — main dashboard
router.get('/', (req, res) => {
  const rawMembers      = db.getMembers();
  const inactiveMembers = db.getInactiveMembers();
  const totalJoints     = db.getTotalJoints();
  const totalExpenses   = db.getTotalExpenses();
  const breakdown       = db.getBreakdown();
  const paidByMember    = db.getExpensesByMember(); // { name: totalPaid }
  const ppj             = totalJoints > 0 ? totalExpenses / totalJoints : 0;
  const pricePerJoint   = ppj.toFixed(2);

  // Attach calculated balance to each member:
  //   netOwed = (joints × price/joint) − expenses they've paid
  //   positive → they owe the group
  //   negative → the group owes them
  const members = rawMembers.map(m => {
    const share   = m.joints * ppj;
    const paid    = paidByMember[m.name] || 0;
    const netOwed = parseFloat((share - paid).toFixed(2));
    return { ...m, paidAmount: paid, netOwed };
  });

  res.render('index', {
    members,
    inactiveMembers,
    breakdown,
    totalJoints,
    totalExpenses: parseFloat(totalExpenses).toFixed(2),
    pricePerJoint,
    ok:  req.query.ok  || null,
    err: req.query.err || null,
  });
});

// GET /members/history — all-time per-member stats from archived sessions
router.get('/members/history', (req, res) => {
  const sessions = db.getSessionHistory().map(s => ({
    ...s,
    member_data:  JSON.parse(s.member_data_json  || '[]'),
    expense_data: JSON.parse(s.expense_data_json || '[]'),
  }));

  // Aggregate per member name across all closed sessions
  const statsMap = {};
  sessions.forEach(s => {
    // Build expense-paid map for this session
    const expPaid = {};
    s.expense_data.forEach(e => {
      expPaid[e.member_name] = (expPaid[e.member_name] || 0) + e.amount;
    });

    s.member_data.forEach(m => {
      if (!statsMap[m.name]) {
        statsMap[m.name] = { name: m.name, is_guest: m.is_guest, sessions: 0, totalJoints: 0, totalPaid: 0 };
      }
      const stat = statsMap[m.name];
      stat.sessions++;
      stat.totalJoints = parseFloat((stat.totalJoints + (m.joints || 0)).toFixed(4));
      stat.totalPaid   = parseFloat((stat.totalPaid   + (expPaid[m.name] || 0)).toFixed(2));
    });
  });

  const memberStats = Object.values(statsMap).sort((a, b) => {
    if (a.is_guest !== b.is_guest) return a.is_guest - b.is_guest;
    return b.totalJoints - a.totalJoints; // highest smoker first
  });

  res.render('members', { memberStats, sessionCount: sessions.length });
});

// POST /members/guest/socialise — split guest balance among non-guest members
router.post('/members/guest/socialise', (req, res) => {
  const allMembers = db.getMembers();
  const guest      = allMembers.find(m => m.is_guest);
  if (!guest) return res.redirect('/?err=No+guest+member+found');

  const totalJoints   = db.getTotalJoints();
  const totalExpenses = db.getTotalExpenses();
  const ppj           = totalJoints > 0 ? totalExpenses / totalJoints : 0;

  if (ppj <= 0) return res.redirect('/?err=No+price-per-joint+yet+(add+expenses+first)');

  const paidByMember = db.getExpensesByMember();
  const guestPaid    = paidByMember[guest.name] || 0;
  const guestNetOwed = parseFloat((guest.joints * ppj - guestPaid).toFixed(2));

  if (guestNetOwed <= 0.005) return res.redirect('/?err=No+guest+balance+to+socialise');

  const nonGuests = allMembers.filter(m => !m.is_guest);

  // Parse & validate percentages (flat keys: pct_<id> to avoid qs bracket-parsing)
  let total = 0;
  const splits = [];
  for (const member of nonGuests) {
    const pct = parseFloat(req.body['pct_' + member.id] || 0);
    if (isNaN(pct) || pct < 0) return res.redirect('/?err=Invalid+percentage');
    splits.push({ member, pct });
    total += pct;
  }

  if (Math.abs(total - 100) > 0.5) {
    return res.redirect(`/?err=${encodeURIComponent(`Percentages must sum to 100 (got ${total.toFixed(1)}%)`)}`);
  }

  // Apply: add joints to each member proportional to their share
  const details = [];
  for (const { member, pct } of splits) {
    if (pct <= 0) continue;
    const addJoints = parseFloat(((pct / 100) * guestNetOwed / ppj).toFixed(4));
    const newJoints = parseFloat((member.joints + addJoints).toFixed(4));
    db.setJoints(member.id, newJoints);
    db.logActivity({
      member_name:    member.name,
      action:         'socialise_guest',
      previous_value: String(member.joints),
      new_value:      String(newJoints),
    });
    details.push(`${member.name} ${pct}%`);
  }

  // Zero out guest joints
  db.setJoints(guest.id, 0);
  db.logActivity({
    member_name:    'System',
    action:         'socialise_guest',
    previous_value: `Guest owed £${guestNetOwed.toFixed(2)}`,
    new_value:      `Split: ${details.join(', ')}`,
  });

  res.redirect('/?ok=1');
});

// POST /members — add member
router.post('/members', (req, res) => {
  const name = (req.body.memberName || '').trim();
  if (!name) return res.redirect('/?err=Name+is+required');

  const member = db.addMember(name);
  db.logActivity({ member_name: member.name, action: 'add_member', new_value: member.name });
  res.redirect('/');
});

// POST /members/:id/joints/inc
router.post('/members/:id/joints/inc', (req, res) => {
  const id     = parseInt(req.params.id);
  const member = db.getMemberById(id);
  if (!member) return res.redirect('/?err=Member+not+found');

  const newJoints = parseFloat((member.joints + 0.25).toFixed(4));
  db.setJoints(id, newJoints);
  db.logActivity({
    member_name:    member.name,
    action:         'increment_joints',
    previous_value: String(member.joints),
    new_value:      String(newJoints),
  });
  res.redirect('/');
});

// POST /members/:id/joints/dec
router.post('/members/:id/joints/dec', (req, res) => {
  const id     = parseInt(req.params.id);
  const member = db.getMemberById(id);
  if (!member) return res.redirect('/?err=Member+not+found');
  if (member.joints < 0.25) return res.redirect('/?err=Cannot+go+below+0');

  const newJoints = parseFloat((member.joints - 0.25).toFixed(4));
  db.setJoints(id, newJoints);
  db.logActivity({
    member_name:    member.name,
    action:         'decrement_joints',
    previous_value: String(member.joints),
    new_value:      String(newJoints),
  });
  res.redirect('/');
});

// POST /members/:id/joints/bulk
router.post('/members/:id/joints/bulk', (req, res) => {
  const id        = parseInt(req.params.id);
  const member    = db.getMemberById(id);
  if (!member) return res.redirect('/?err=Member+not+found');

  const amount    = parseFloat(req.body.amount);
  const operation = req.body.operation;

  if (!amount || amount <= 0 || isNaN(amount) || !['add', 'subtract'].includes(operation)) {
    return res.redirect('/?err=Invalid+bulk+operation');
  }

  let newJoints;
  if (operation === 'add') {
    newJoints = parseFloat((member.joints + amount).toFixed(4));
  } else {
    if (member.joints < amount) {
      return res.redirect(`/?err=Only+${parseFloat(member.joints.toFixed(2))}+joints+available`);
    }
    newJoints = parseFloat((member.joints - amount).toFixed(4));
  }

  db.setJoints(id, newJoints);
  db.logActivity({
    member_name:    member.name,
    action:         `bulk_${operation}_joints`,
    previous_value: String(member.joints),
    new_value:      String(newJoints),
  });
  res.redirect('/');
});

// POST /joints/log — log a joint shared among N members (each gets 1/N)
router.post('/joints/log', (req, res) => {
  let ids = req.body.participants || [];
  if (!Array.isArray(ids)) ids = [ids];
  ids = ids.map(id => parseInt(id)).filter(id => !isNaN(id));

  if (ids.length === 0) return res.redirect('/?err=Select+at+least+one+person');

  const n     = ids.length;
  const share = parseFloat((1 / n).toFixed(4));
  const names = [];

  for (const id of ids) {
    const member = db.getMemberById(id);
    if (!member) continue;
    const newJoints = parseFloat((member.joints + share).toFixed(4));
    db.setJoints(id, newJoints);
    names.push(member.name);
  }

  db.logActivity({
    member_name:    names.join(', '),
    action:         'log_joint',
    previous_value: null,
    new_value:      n === 1 ? 'Solo' : `Shared (${n} people)`,
  });

  res.redirect('/');
});

// POST /members/:id/delete
router.post('/members/:id/delete', (req, res) => {
  const id     = parseInt(req.params.id);
  const member = db.getMemberById(id);
  if (!member)          return res.redirect('/?err=Member+not+found');
  if (member.is_guest)  return res.redirect('/?err=Cannot+delete+guest');
  if (member.joints > 0) return res.redirect('/?err=Clear+joints+first');

  const name = member.name;
  db.deleteMember(id);
  db.logActivity({ member_name: 'System', action: 'delete_member', previous_value: name, new_value: 'Removed' });
  res.redirect('/');
});

module.exports = router;
