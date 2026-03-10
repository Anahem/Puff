const express = require('express');
const bcrypt  = require('bcrypt');
const router  = express.Router();

const hasPassword = () => Boolean(process.env.PASSWORD_HASH);

// GET /login
router.get('/login', (req, res) => {
  if (req.session.authenticated) return res.redirect('/');
  res.render('login', { error: null, setupMode: !hasPassword() });
});

// POST /login
router.post('/login', async (req, res) => {
  if (!hasPassword()) return res.redirect('/setup');
  const match = await bcrypt.compare(req.body.password || '', process.env.PASSWORD_HASH);
  if (match) {
    req.session.authenticated = true;
    const dest = req.session.returnTo || '/';
    delete req.session.returnTo;
    return res.redirect(dest);
  }
  res.render('login', { error: 'Incorrect password.', setupMode: false });
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// GET /setup — only when no password is set
router.get('/setup', (req, res) => {
  if (hasPassword()) return res.redirect('/login');
  res.render('setup', { hash: null, error: null });
});

// POST /setup
router.post('/setup', async (req, res) => {
  if (hasPassword()) return res.redirect('/login');
  const { password, confirm } = req.body;
  if (!password || password.length < 8) {
    return res.render('setup', { hash: null, error: 'Password must be at least 8 characters.' });
  }
  if (password !== confirm) {
    return res.render('setup', { hash: null, error: 'Passwords do not match.' });
  }
  const hash = await bcrypt.hash(password, 12);
  res.render('setup', { hash, error: null });
});

module.exports = router;
