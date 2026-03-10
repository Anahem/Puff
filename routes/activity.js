const express        = require('express');
const router         = express.Router();
const db             = require('../db');
const formatActivity = require('../lib/formatActivity');

// GET /activity
router.get('/activity', (req, res) => {
  const raw        = db.getAllActivities();
  const activities = raw.map(a => ({
    ...a,
    ...formatActivity(a),
  }));

  res.render('activity', { activities });
});

module.exports = router;
