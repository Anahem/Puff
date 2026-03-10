require('dotenv').config();
const express      = require('express');
const session      = require('express-session');
const SQLiteStore  = require('connect-sqlite3')(session);
const path         = require('path');
const fs           = require('fs');
const os           = require('os');
const requireAuth  = require('./middleware/auth');

const app = express();

// ── Port ──────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 3000;

// ── Directories ───────────────────────────────────────────────────────────────
['data'].forEach(dir => {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ── Express config ────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  store: new SQLiteStore({ dir: './data', db: 'sessions.db' }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  },
}));

// Make auth state available in every template
app.use((req, res, next) => {
  res.locals.authenticated = !!req.session.authenticated;
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
// Auth routes are public
app.use('/', require('./routes/auth'));

// All other routes require authentication
app.use(requireAuth);
app.use('/', require('./routes/members'));
app.use('/', require('./routes/expenses'));
app.use('/', require('./routes/sessions'));
app.use('/', require('./routes/activity'));

// ── Error handlers ────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).render('error', { message: 'Page not found.' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { message: 'Something went wrong.' });
});

// ── Prevent Windows sleep while server is running ─────────────────────────────
if (process.platform === 'win32') {
  const { spawn } = require('child_process');
  const psScript = [
    `Add-Type -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'`,
    `-Name 'SE' -Namespace 'KA' -ErrorAction SilentlyContinue`,
    `while ($true) { [KA.SE]::SetThreadExecutionState(0x80000041); Start-Sleep 30 }`,
  ].join('; ');
  const keepAwake = spawn('powershell', [
    '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psScript,
  ], { stdio: 'ignore', windowsHide: true });
  process.on('exit',   () => { try { keepAwake.kill(); } catch (_) {} });
  process.on('SIGINT', () => process.exit());
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter(i => i.family === 'IPv4' && !i.internal)
    .map(i => i.address);

  console.log('\n  › Puff App is running\n');
  console.log(`    Local:    http://localhost:${PORT}`);
  ips.forEach(ip => {
    console.log(`    Network:  http://${ip}:${PORT}   ← use this on other devices`);
  });

  if (process.platform === 'win32') {
    console.log('\n  PC sleep is disabled while this window is open.');
  }
  console.log('');

  if (!process.env.PASSWORD_HASH) {
    console.log('  No PASSWORD_HASH set — visit /setup to create a password.\n');
  }
});
