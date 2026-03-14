/**
 * LOST & FOUND SYSTEM - EXPRESS.JS + POSTGRESQL BACKEND
 * =======================================================
 * By: Kushal Khatri
 * Migrated from sql.js (SQLite) to PostgreSQL (pg)
 *
 * Setup:
 *   npm install express multer ejs jsonwebtoken dotenv bcrypt pg
 *
 * .env file:
 *   PORT=3000
 *   JWT_SECRET=your_secret_key_here
 *   ADMIN_USERNAME=FBLA20252026
 *   ADMIN_PASSWORD=FBLA20252026
 *   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/lostandfound
 */

const jwt      = require('jsonwebtoken');
const fs       = require('fs');
const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const bcrypt   = require('bcrypt');
const axios    = require('axios');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// ─── DATABASE ─────────────────────────────────────────────────────────────────

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host:     process.env.PGHOST     || 'localhost',
        port:     process.env.PGPORT     || 5432,
        database: process.env.PGDATABASE || 'lostandfound',
        user:     process.env.PGUSER     || 'postgres',
        password: process.env.PGPASSWORD || '',
      }
);

// Thin wrapper — keeps same db.all / db.get / db.run call style everywhere
const db = {
  async all(sql, params = []) {
    const { rows } = await pool.query(sql, params);
    return rows;
  },
  async get(sql, params = []) {
    const { rows } = await pool.query(sql, params);
    return rows[0];
  },
  async run(sql, params = []) {
    const isInsert = /^\s*INSERT/i.test(sql);
    const finalSql = isInsert && !/RETURNING/i.test(sql) ? sql + ' RETURNING id' : sql;
    const result   = await pool.query(finalSql, params);
    const lastID   = isInsert && result.rows[0] ? result.rows[0].id : null;
    return { lastID, changes: result.rowCount };
  },
  logAction(action, entityType, entityId, details, userIp) {
    pool.query(
      `INSERT INTO audit_log (action, entity_type, entity_id, details, user_ip) VALUES ($1,$2,$3,$4,$5)`,
      [action, entityType, entityId, JSON.stringify(details), userIp]
    ).catch(e => console.error('Audit log error:', e.message));
  }
};

// ─── CREATE TABLES ────────────────────────────────────────────────────────────

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id             SERIAL PRIMARY KEY,
      item_name      VARCHAR(255) NOT NULL,
      description    TEXT,
      category       VARCHAR(100),
      location       VARCHAR(255),
      date_found     DATE NOT NULL,
      contact_number VARCHAR(255) NOT NULL,
      contact_email  VARCHAR(255),
      contact_name   VARCHAR(255),
      image_filename VARCHAR(255),
      status         VARCHAR(50) DEFAULT 'pending',
      pin_lat        DOUBLE PRECISION,
      pin_lng        DOUBLE PRECISION,
      pin_floor      SMALLINT,
      created_at     TIMESTAMP DEFAULT NOW(),
      updated_at     TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS claims (
      id                SERIAL PRIMARY KEY,
      item_id           INTEGER NOT NULL,
      claimant_name     VARCHAR(255) NOT NULL,
      claimant_contact  VARCHAR(255) NOT NULL,
      claimant_email    VARCHAR(255),
      claim_description TEXT,
      status            VARCHAR(50) DEFAULT 'pending',
      submitted_at      TIMESTAMP DEFAULT NOW(),
      resolved_at       TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(100) UNIQUE NOT NULL,
      description TEXT,
      item_count  INTEGER DEFAULT 0,
      created_at  TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         VARCHAR(255) UNIQUE NOT NULL,
      full_name     VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255),
      phone         VARCHAR(20),
      created_at    TIMESTAMP DEFAULT NOW(),
      updated_at    TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id          SERIAL PRIMARY KEY,
      action      VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50),
      entity_id   INTEGER,
      details     TEXT,
      user_ip     VARCHAR(45),
      created_at  TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('SUCCESS: All tables created/verified');

  // Migration: add pin_lat / pin_lng columns if they don't exist yet
  await pool.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS pin_lat   DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS pin_lng   DOUBLE PRECISION`);
  await pool.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS pin_floor SMALLINT`);

  await seedCategories();
}

async function seedCategories() {
  const { rows } = await pool.query('SELECT COUNT(*) as count FROM categories');
  if (parseInt(rows[0].count) === 0) {
    const cats = [
      ['Electronics',      'Phones, laptops, tablets, chargers, etc.'],
      ['Clothing',         'Jackets, shirts, shoes, hats, etc.'],
      ['Accessories',      'Jewelry, watches, bags, wallets, etc.'],
      ['Books & Supplies', 'Textbooks, notebooks, stationery, etc.'],
      ['Personal Items',   'Keys, IDs, glasses, umbrellas, etc.'],
      ['Sports Equipment', 'Balls, rackets, gym gear, etc.'],
      ['Other',            'Miscellaneous items']
    ];
    for (const [name, desc] of cats) {
      await pool.query(
        'INSERT INTO categories (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
        [name, desc]
      );
    }
    console.log('SUCCESS: Default categories seeded');
  }
}

// ─── HELPER ───────────────────────────────────────────────────────────────────

function normalizeItem(item) {
  if (!item) return item;
  return {
    id:             item.id,
    name:           item.item_name      || 'Unknown Item',
    itemName:       item.item_name      || 'Unknown Item',
    item_name:      item.item_name      || 'Unknown Item',
    description:    item.description    || '',
    category:       item.category       || 'Other',
    location:       item.location       || 'Not specified',
    dateFound:      item.date_found     || null,
    date_found:     item.date_found     || null,
    contactName:    item.contact_name   || null,
    contact_name:   item.contact_name   || null,
    contactEmail:   item.contact_email  || null,
    contact_email:  item.contact_email  || null,
    contactNumber:  item.contact_number || null,
    contact_number: item.contact_number || null,
    imageUrl:       item.image_filename ? '/uploads/' + item.image_filename : null,
    image:          item.image_filename ? '/uploads/' + item.image_filename : null,
    image_filename: item.image_filename || null,
    status:         item.status         || 'active',
    createdAt:      item.created_at     || null,
    created_at:     item.created_at     || null,
    pinLat:         item.pin_lat        || null,
    pinLng:         item.pin_lng        || null,
    pin_lat:        item.pin_lat        || null,
    pin_lng:        item.pin_lng        || null,
    pinFloor:       item.pin_floor      || null,
    pin_floor:      item.pin_floor      || null
  };
}

function getUserFromToken(req) {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

// ─── FILE UPLOADS ─────────────────────────────────────────────────────────────

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename:    (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname))
  }),
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|gif|webp/.test(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Only image files allowed'), ok);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use((req, res, next) => {
  console.log(`LOG: ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// ─── ADMIN AUTH MIDDLEWARE ────────────────────────────────────────────────────

const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USERNAME || 'FBLA20252026',
  password: process.env.ADMIN_PASSWORD || 'FBLA20252026'
};
const JWT_SECRET = process.env.JWT_SECRET || 'lost_and_found_secret_key_2025_fbla';

function checkAdminAuth(req, res, next) {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return res.status(401).json({ success: false, error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ success: false, error: 'Admin access required' });
    req.adminUsername = decoded.username;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

// ─── PAGE ROUTES ──────────────────────────────────────────────────────────────

app.get('/', async (req, res) => {
  try {
    const stats = await db.get(`
      SELECT COUNT(*) as "totalItems",
        SUM(CASE WHEN status='active'   THEN 1 ELSE 0 END) as "activeItems",
        SUM(CASE WHEN status='returned' THEN 1 ELSE 0 END) as "returnedItems",
        SUM(CASE WHEN status='pending'  THEN 1 ELSE 0 END) as "pendingItems"
      FROM items
    `);
    const recentItems = await db.all(`SELECT * FROM items WHERE status='active' ORDER BY created_at DESC LIMIT 5`);
    const claimsStats = await db.get('SELECT COUNT(*) as "totalClaims" FROM claims');
    res.render('index', {
      pageTitle: 'Lost But Found System',
      stats: { ...stats, totalClaims: claimsStats?.totalClaims || 0 },
      recentItems: recentItems.map(normalizeItem),
      currentTime: new Date().toLocaleString()
    });
  } catch (error) {
    console.error('Homepage error:', error.message);
    res.render('index', {
      pageTitle: 'Lost But Found System',
      stats: { totalItems: 0, activeItems: 0, returnedItems: 0, pendingItems: 0, totalClaims: 0 },
      recentItems: [],
      currentTime: new Date().toLocaleString()
    });
  }
});

app.get('/login',    (req, res) => res.render('login',    { pageTitle: 'Login - Lost But Found' }));
app.get('/register', (req, res) => res.render('register', { pageTitle: 'Register - Lost But Found' }));
app.get('/account',  (req, res) => res.render('account',  { pageTitle: 'My Account - Lost But Found' }));
app.get('/claim',    (req, res) => res.render('claim',    { pageTitle: 'Claim an Item - Lost But Found' }));
app.get('/faq',      (req, res) => res.render('faq',      { pageTitle: 'FAQ - Lost But Found' }));
app.get('/contact',  (req, res) => res.render('contact',  { pageTitle: 'Contact Us - Lost But Found' }));
app.get('/terms-of-service', (req, res) => res.render('terms-of-service', { pageTitle: 'Terms of Service - Lost But Found' }));
app.get('/admin/login', (req, res) => res.render('admin-login', { pageTitle: 'Admin Login - Lost But Found' }));
app.get('/admin',       (req, res) => res.render('admin',       { pageTitle: 'Admin Dashboard - Lost But Found', serverTime: new Date().toLocaleString() }));
app.get('/admin/data',  (req, res) => res.render('admin-data',  { pageTitle: 'Admin Data - Lost But Found' }));

app.get(['/upload', '/uploadItem'], async (req, res) => {
  try {
    const categories = await db.all('SELECT * FROM categories ORDER BY name');
    res.render('uploadItem', {
      pageTitle: 'Submit Found Item - Lost But Found',
      categories,
      maxFileSize: '5MB',
      currentDate: new Date().toISOString().split('T')[0]
    });
  } catch (error) {
    res.render('uploadItem', { pageTitle: 'Submit Found Item', categories: [], maxFileSize: '5MB', currentDate: new Date().toISOString().split('T')[0] });
  }
});

app.get('/browse', async (req, res) => {
  try {
    const { search, category, status = 'active', sort = 'recent' } = req.query;
    let sql = 'SELECT * FROM items WHERE 1=1';
    const params = [];

    if (status && status !== 'all') { params.push(status);    sql += ` AND status = $${params.length}`; }
    if (search) {
      const s = '%' + search + '%';
      params.push(s, s, s);
      sql += ` AND (item_name ILIKE $${params.length-2} OR description ILIKE $${params.length-1} OR location ILIKE $${params.length})`;
    }
    if (category) { params.push(category); sql += ` AND category = $${params.length}`; }
    sql += sort === 'name' ? ' ORDER BY item_name ASC' : sort === 'date' ? ' ORDER BY date_found DESC' : ' ORDER BY created_at DESC';

    const rawItems   = await db.all(sql, params);
    const categories = await db.all('SELECT * FROM categories ORDER BY name');
    const items      = rawItems.map(normalizeItem);
    res.render('browse', { pageTitle: 'Browse Items - Lost But Found', items, categories, filters: { search, category, status, sort }, totalResults: items.length });
  } catch (error) {
    console.error('Browse error:', error.message);
    res.render('browse', { pageTitle: 'Browse Items', items: [], categories: [], filters: {}, totalResults: 0 });
  }
});

// ─── AUTH API ─────────────────────────────────────────────────────────────────

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password are required' });

    const user = await db.get('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ success: false, error: 'Invalid email or password' });

    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.full_name, isAdmin: false },
      JWT_SECRET, { expiresIn: '24h' }
    );
    db.logAction('USER_LOGIN', 'user', user.id, { email }, req.ip);
    res.json({ success: true, message: 'Login successful', token });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ success: false, error: 'Login failed: ' + error.message });
  }
});

/**
 * POST /api/verify-turnstile
 * Validates a Cloudflare Turnstile token server-side.
 * Requires CLOUDFLARE_TURNSTILE_SECRET in .env
 * Get your secret key from: https://dash.cloudflare.com -> Turnstile
 *
 * @param {string} req.body.token - The cf-turnstile-response token from the widget
 * @returns {200} { success: true }
 * @throws {400} Token missing  {403} Token invalid
 */
app.post('/api/verify-turnstile', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, error: 'No token provided' });

    const secret = process.env.CLOUDFLARE_TURNSTILE_SECRET;
    if (!secret) {
      console.warn('WARNING: CLOUDFLARE_TURNSTILE_SECRET not set -- skipping verification');
      return res.json({ success: true });
    }

    const params = new URLSearchParams();
    params.append('secret', secret);
    params.append('response', token);
    params.append('remoteip', req.ip);

    const cfRes = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    if (cfRes.data.success) {
      res.json({ success: true });
    } else {
      console.warn('Turnstile failed:', cfRes.data['error-codes']);
      res.status(403).json({ success: false, error: 'Bot verification failed' });
    }
  } catch (error) {
    console.error('Turnstile error:', error.message);
    res.status(500).json({ success: false, error: 'Verification failed: ' + error.message });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { fullName, firstName, lastName, email, password } = req.body;
    const name = fullName || (firstName && lastName ? `${firstName} ${lastName}` : null);
    if (!name || !email || !password) return res.status(400).json({ success: false, error: 'Name, email, and password are required' });
    if (password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });

    const existing = await db.get('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing) return res.status(409).json({ success: false, error: 'An account with this email already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.run(
      'INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3)',
      [name, email.toLowerCase(), passwordHash]
    );
    db.logAction('USER_REGISTERED', 'user', result.lastID, { email, name }, req.ip);
    res.json({ success: true, message: 'Registration successful. You can now login.', userId: result.lastID });
  } catch (error) {
    console.error('Register error:', error.message);
    res.status(500).json({ success: false, error: 'Registration failed: ' + error.message });
  }
});

app.post('/api/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'Username and password required' });
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
      const token = jwt.sign({ adminId: 'admin_1', username, isAdmin: true }, JWT_SECRET, { expiresIn: '24h' });
      db.logAction('ADMIN_LOGIN', 'admin', null, { username }, req.ip);
      return res.json({ success: true, message: 'Admin login successful', token });
    }
    db.logAction('ADMIN_LOGIN_FAILED', 'admin', null, { username }, req.ip);
    res.status(401).json({ success: false, error: 'Invalid username or password' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Admin login failed: ' + error.message });
  }
});

// ─── ITEMS API ────────────────────────────────────────────────────────────────

app.post('/api/upload', upload.single('itemImage'), async (req, res) => {
  try {
    const { itemName, description, category, location, dateFound, contactName, contactEmail, contactNumber } = req.body;
    const pinLat   = req.body.pinLat   ? parseFloat(req.body.pinLat)   : null;
    const pinLng   = req.body.pinLng   ? parseFloat(req.body.pinLng)   : null;
    const pinFloor = req.body.pinFloor ? parseInt(req.body.pinFloor)   : null;
    if (!itemName || !dateFound || !contactName || !contactNumber) {
      return res.status(400).json({ success: false, error: 'Missing required fields: itemName, dateFound, contactName, contactNumber' });
    }
    const result = await db.run(
      `INSERT INTO items (item_name, description, category, location, date_found, contact_name, contact_email, contact_number, image_filename, status, pin_lat, pin_lng, pin_floor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [itemName, description || null, category || 'Other', location || null, dateFound, contactName, contactEmail || null, contactNumber, req.file?.filename || null, 'active', pinLat, pinLng, pinFloor]
    );
    if (category) await db.run('UPDATE categories SET item_count = item_count + 1 WHERE name = $1', [category]);
    db.logAction('ITEM_SUBMITTED', 'item', result.lastID, req.body, req.ip);
    res.json({ success: true, message: 'Item submitted successfully!', itemId: result.lastID, imageUrl: req.file ? '/uploads/' + req.file.filename : null });
  } catch (error) {
    console.error('Upload error:', error.message);
    res.status(500).json({ success: false, error: 'Upload failed: ' + error.message });
  }
});

/**
 * GET /api/items/pinned
 * Returns all active items that have GPS pin coordinates.
 * Used by the homepage 3D map to render location markers.
 * @returns {Object[]} Normalized items with pinLat, pinLng, imageUrl, name
 */
app.get('/api/items/pinned', async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT id, item_name, image_filename, location, status, pin_lat, pin_lng
       FROM items
       WHERE status = 'active' AND pin_lat IS NOT NULL AND pin_lng IS NOT NULL
       ORDER BY created_at DESC`
    );
    res.json({ success: true, items: rows.map(normalizeItem) });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch pinned items: ' + error.message });
  }
});

app.get('/api/items', async (req, res) => {
  try {
    const { status, category } = req.query;
    let sql = 'SELECT * FROM items WHERE 1=1';
    const params = [];
    if (status)   { params.push(status);   sql += ` AND status = $${params.length}`; }
    if (category) { params.push(category); sql += ` AND category = $${params.length}`; }
    sql += ' ORDER BY created_at DESC';
    const rows = await db.all(sql, params);
    res.json({ success: true, items: rows.map(normalizeItem), total: rows.length });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch items: ' + error.message });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const categories = await db.all('SELECT * FROM categories ORDER BY name');
    res.json({ success: true, categories });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch categories: ' + error.message });
  }
});

// ─── CLAIMS API ───────────────────────────────────────────────────────────────

app.post('/api/claims', async (req, res) => {
  try {
    const { itemId, claimantName, claimantContact, claimantEmail, claimDescription } = req.body;
    if (!itemId || !claimantName || !claimantContact) {
      return res.status(400).json({ success: false, error: 'Missing required fields: itemId, claimantName, claimantContact' });
    }
    const item = await db.get('SELECT * FROM items WHERE id = $1 AND status = $2', [itemId, 'active']);
    if (!item) return res.status(404).json({ success: false, error: 'Item not found or not available for claiming' });

    const result = await db.run(
      `INSERT INTO claims (item_id, claimant_name, claimant_contact, claimant_email, claim_description, status)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [itemId, claimantName, claimantContact, claimantEmail || null, claimDescription || null, 'pending']
    );
    await db.run('UPDATE items SET status = $1 WHERE id = $2', ['claimed', itemId]);
    db.logAction('CLAIM_SUBMITTED', 'claim', result.lastID, req.body, req.ip);
    res.json({ success: true, message: 'Claim submitted and pending admin review', claimId: result.lastID });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Claim submission failed: ' + error.message });
  }
});

// ─── CONTACT API ──────────────────────────────────────────────────────────────

app.post('/api/contact', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !subject || !message) return res.status(400).json({ success: false, error: 'All fields are required' });
  const validSubjects = ['general', 'bug', 'feedback', 'claim', 'submission', 'other'];
  if (!validSubjects.includes(subject)) return res.status(400).json({ success: false, error: 'Invalid subject' });
  db.logAction('CONTACT_SUBMITTED', 'contact', null, { name, email, subject, message }, req.ip);
  res.json({ success: true, message: 'Thank you for contacting us. We will respond soon.' });
});

// ─── ADMIN API ────────────────────────────────────────────────────────────────

app.get('/api/admin/data', checkAdminAuth, async (req, res) => {
  try {
    const stats = await db.get(`
      SELECT COUNT(*) as "totalItems",
        SUM(CASE WHEN status='active'   THEN 1 ELSE 0 END) as "activeItems",
        SUM(CASE WHEN status='pending'  THEN 1 ELSE 0 END) as "pendingItems",
        SUM(CASE WHEN status='claimed'  THEN 1 ELSE 0 END) as "claimedItems",
        SUM(CASE WHEN status='returned' THEN 1 ELSE 0 END) as "returnedItems"
      FROM items
    `);
    const claimsCount = await db.get('SELECT COUNT(*) as "totalClaims" FROM claims');
    const rawItems    = await db.all('SELECT * FROM items ORDER BY created_at DESC');
    const rawClaims   = await db.all(`
      SELECT c.*, i.item_name FROM claims c
      LEFT JOIN items i ON c.item_id = i.id
      ORDER BY c.submitted_at DESC
    `);
    const items  = rawItems.map(normalizeItem);
    const claims = rawClaims.map(c => ({
      id: c.id,
      itemId: c.item_id,          item_id: c.item_id,
      itemName: c.item_name || 'Unknown', item_name: c.item_name || 'Unknown',
      claimantName: c.claimant_name,      claimant_name: c.claimant_name,
      claimantContact: c.claimant_contact, claimant_contact: c.claimant_contact,
      claimantEmail: c.claimant_email,    claimant_email: c.claimant_email,
      claimDescription: c.claim_description,
      status: c.status || 'pending',
      submittedAt: c.submitted_at, submitted_at: c.submitted_at,
      resolvedAt: c.resolved_at
    }));
    res.json({
      success: true,
      stats: { ...stats, totalClaims: claimsCount?.totalClaims || 0 },
      items, claims,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch admin data: ' + error.message });
  }
});

app.put('/api/admin/items/:id/status', checkAdminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'active', 'claimed', 'returned', 'rejected'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
    const result = await db.run('UPDATE items SET status = $1, updated_at = NOW() WHERE id = $2', [status, req.params.id]);
    if (!result.changes) return res.status(404).json({ success: false, error: 'Item not found' });
    db.logAction('ITEM_STATUS_UPDATED', 'item', req.params.id, { status }, req.ip);
    res.json({ success: true, message: `Item status updated to ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update item status: ' + error.message });
  }
});

app.put('/api/admin/claims/:id/status', checkAdminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'approved', 'denied'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
    const claim = await db.get('SELECT * FROM claims WHERE id = $1', [req.params.id]);
    if (!claim) return res.status(404).json({ success: false, error: 'Claim not found' });
    await db.run('UPDATE claims SET status = $1, resolved_at = NOW() WHERE id = $2', [status, req.params.id]);
    if (status === 'approved') await db.run('UPDATE items SET status = $1 WHERE id = $2', ['returned', claim.item_id]);
    if (status === 'denied')   await db.run('UPDATE items SET status = $1 WHERE id = $2', ['active',   claim.item_id]);
    db.logAction('CLAIM_STATUS_UPDATED', 'claim', req.params.id, { status }, req.ip);
    res.json({ success: true, message: `Claim status updated to ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update claim status: ' + error.message });
  }
});

app.delete('/api/admin/items/:id', checkAdminAuth, async (req, res) => {
  try {
    const item = await db.get('SELECT * FROM items WHERE id = $1', [req.params.id]);
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    if (item.image_filename) {
      const imgPath = path.join(__dirname, 'public', 'uploads', item.image_filename);
      if (fs.existsSync(imgPath)) fs.unlink(imgPath, () => {});
    }
    await db.run('DELETE FROM claims WHERE item_id = $1', [req.params.id]);
    await db.run('DELETE FROM items WHERE id = $1', [req.params.id]);
    if (item.category) await db.run('UPDATE categories SET item_count = item_count - 1 WHERE name = $1', [item.category]);
    db.logAction('ITEM_DELETED', 'item', req.params.id, item, req.ip);
    res.json({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete item: ' + error.message });
  }
});

// ─── USER API ─────────────────────────────────────────────────────────────────

app.get('/api/user/profile', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const userData = await db.get('SELECT id, full_name, email, created_at FROM users WHERE id = $1', [user.userId || user.id]);
    if (!userData) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, id: userData.id, fullName: userData.full_name, email: userData.email, createdAt: userData.created_at });
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
});

app.get('/api/user/uploads', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const userData  = await db.get('SELECT email FROM users WHERE id = $1', [user.userId || user.id]);
    const userEmail = userData?.email || null;
    const uploads   = await db.all('SELECT * FROM items WHERE contact_email = $1 ORDER BY date_found DESC', [userEmail]);
    res.json(uploads.map(normalizeItem));
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
});

app.get('/api/user/claims', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const userData  = await db.get('SELECT email FROM users WHERE id = $1', [user.userId || user.id]);
    const userEmail = userData?.email || null;
    const claims    = await db.all(`
      SELECT c.id, c.item_id as "itemId", i.item_name as "itemName",
             i.image_filename as "imageUrl", i.location,
             c.claimant_name as "claimantName", c.claimant_email as "claimantEmail",
             c.claimant_contact as "claimantPhone", c.status,
             c.submitted_at as "createdAt"
      FROM claims c
      LEFT JOIN items i ON c.item_id = i.id
      WHERE c.claimant_email = $1
      ORDER BY c.submitted_at DESC
    `, [userEmail]);
    res.json(claims.map(c => ({ ...c, imageUrl: c.imageUrl ? '/uploads/' + c.imageUrl : null })));
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
});

app.post('/api/user/password', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: 'Both passwords required' });
    if (newPassword.length < 8) return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
    const userData = await db.get('SELECT * FROM users WHERE id = $1', [user.userId || user.id]);
    if (!userData) return res.status(404).json({ success: false, message: 'User not found' });
    const valid = await bcrypt.compare(currentPassword, userData.password_hash);
    if (!valid) return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPassword, 10);
    await db.run('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, userData.id]);
    res.json({ success: true, message: 'Password updated successfully' });
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
});

app.delete('/api/user/uploads/:id', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const userData  = await db.get('SELECT email FROM users WHERE id = $1', [user.userId || user.id]);
    const userEmail = userData?.email || null;
    const item      = await db.get('SELECT * FROM items WHERE id = $1', [req.params.id]);
    if (!item || item.contact_email !== userEmail) return res.status(403).json({ success: false, message: 'Forbidden' });
    await db.run('DELETE FROM claims WHERE item_id = $1', [req.params.id]);
    await db.run('DELETE FROM items WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Item deleted successfully' });
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
});

app.delete('/api/user/claims/:id', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const userData  = await db.get('SELECT email FROM users WHERE id = $1', [user.userId || user.id]);
    const userEmail = userData?.email || null;
    const claim     = await db.get('SELECT * FROM claims WHERE id = $1', [req.params.id]);
    if (!claim || claim.claimant_email !== userEmail) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (claim.status === 'pending') await db.run('UPDATE items SET status = $1 WHERE id = $2', ['active', claim.item_id]);
    await db.run('DELETE FROM claims WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Claim withdrawn successfully' });
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
});

app.delete('/api/user/account', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const userData = await db.get('SELECT email FROM users WHERE id = $1', [user.userId || user.id]);
    if (!userData) return res.status(404).json({ success: false, message: 'User not found' });
    await db.run('DELETE FROM claims WHERE claimant_email = $1', [userData.email]);
    await db.run('DELETE FROM items WHERE contact_email = $1', [userData.email]);
    await db.run('DELETE FROM users WHERE id = $1', [user.userId || user.id]);
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
});

// ─── AI CHAT API ─────────────────────────────────────────────────────────────
// Requires ANTHROPIC_API_KEY in .env

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'Messages array is required' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'Chat is not configured. Add ANTHROPIC_API_KEY to your .env file.' });
    }

    // Keep last 10 messages to avoid huge context
    const trimmed = messages.slice(-10);

    const axiosRes = await axios.post('https://api.anthropic.com/v1/messages', {
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: `You are the friendly AI assistant for "Lost But Found", a school lost and found platform.
You help users with:
- Reporting found items (direct them to /uploadItem)
- Claiming lost items (direct them to /claim or /browse)
- Understanding how the review and return process works
- Navigating the website
- General questions about lost and found policies

Keep responses concise (2-4 sentences max). Be warm and helpful. If you don't know something specific about this school's policies, give general helpful guidance and suggest they contact staff.
Do not discuss topics unrelated to lost and found or this platform.
Always respond in plain text only. Never use markdown formatting, asterisks, bold, italics, bullet points, or any special characters for formatting.
REPEAT - NO MARKDOWN FORMATTING IN MESSAGES`,
      messages: trimmed
    }, {
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01'
      }
    });

    const reply = axiosRes.data.content?.[0]?.text || 'Sorry, I could not generate a response.';
    res.json({ success: true, reply });
  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({ success: false, error: 'Chat failed: ' + error.message });
  }
});

// ─── HEALTH ───────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime() }));

// ─── 404 & ERROR ──────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).send(`<!DOCTYPE html><html><head><title>404</title><link rel="stylesheet" href="/styles.css"></head>
  <body><div class="container" style="padding-top:100px;text-align:center">
  <h1>404 - Page Not Found</h1><p style="color:#666;margin:20px 0">The page you are looking for does not exist.</p>
  <a href="/" class="btn btn-primary">Go Home</a></div></body></html>`);
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal Server Error', message: err.message });
});

// ─── START ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

pool.connect()
  .then(client => { client.release(); console.log('SUCCESS: Connected to PostgreSQL'); return createTables(); })
  .then(() => {
    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(60));
      console.log(`SERVER: http://localhost:${PORT}`);
      console.log('='.repeat(60));
      console.log(`  Homepage:    http://localhost:${PORT}/`);
      console.log(`  Login:       http://localhost:${PORT}/login`);
      console.log(`  Admin:       http://localhost:${PORT}/admin/login`);
      console.log(`  Admin user:  ${ADMIN_CREDENTIALS.username}`);
      console.log(`  Admin pass:  ${ADMIN_CREDENTIALS.password}`);
      console.log('='.repeat(60) + '\n');
    });
  })
  .catch(err => {
    console.error('FATAL: Could not connect to PostgreSQL:', err.message);
    console.error('Check your .env DATABASE_URL and that PostgreSQL is running.');
    process.exit(1);
  });

module.exports = app;