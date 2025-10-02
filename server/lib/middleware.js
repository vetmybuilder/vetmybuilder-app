function authMiddleware(admin) {
  return async function(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });
    try {
      if (!admin || !admin.auth) {
        return res.status(500).json({ error: 'Auth not initialized on server' });
      }
      const decoded = await admin.auth().verifyIdToken(token);
      req.user = decoded;
      next();
    } catch (e) {
      console.error('[auth] verify error', e);
      res.status(401).json({ error: 'Invalid token' });
    }
  }
}

module.exports = { authMiddleware };
