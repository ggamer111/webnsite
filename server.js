// =======================================
//             SERVER.JS
// =======================================

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const META_FILE = path.join(__dirname, 'items.json');
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB
const ALLOWED_EXT = ['.zip','.pdf','.png','.jpg','.jpeg','.txt','.exe'];

// =======================================
//        USER MANAGEMENT (IN-MEMORY)
// =======================================
const users = [
  { username: 'admin', password: bcrypt.hashSync('1', 10), role: 'admin' },
  { username: 'mod', password: bcrypt.hashSync('1', 10), role: 'moderator' },
  { username: 'editor', password: bcrypt.hashSync('1', 10), role: 'editor' }
];

// =======================================
//       FILE / FOLDER SETUP
// =======================================
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);

// =======================================
//           EXPRESS SETUP
// =======================================
const app = express();
app.use(express.static(PUBLIC_DIR));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sessions
app.use(session({
  secret: 'super-secret-key',
  resave: false,
  saveUninitialized: false
}));

// =======================================
//         HELPER FUNCTIONS
// =======================================
function loadMeta() {
  try { return JSON.parse(fs.readFileSync(META_FILE)); } 
  catch (e) { return []; }
}

function saveMeta(items) {
  fs.writeFileSync(META_FILE, JSON.stringify(items, null, 2));
}

function findItem(filename) {
  return loadMeta().find(it => it.filename === filename);
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
    if (!roles.includes(req.session.user.role)) return res.status(403).json({ error: 'Access denied' });
    next();
  }
}

// =======================================
//            MULTER CONFIG
// =======================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9\.\-_]/g, '_');
    cb(null, `${Date.now()}-${cleanName}`);
  }
});
const upload = multer({ storage, limits: { fileSize: MAX_FILE_BYTES } });

// =======================================
//           AUTHENTICATION ROUTES
// =======================================

// Login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid credentials' });

  req.session.user = { username: user.username, role: user.role };
  res.json({ message: 'Logged in', role: user.role });
});

// Logout
app.post('/logout', (req,res) => {
  req.session.destroy(() => res.json({ message: 'Logged out' }));
});

// Current session
app.get('/api/session', (req,res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  res.json(req.session.user);
});

// =======================================
//           FILE UPLOAD ROUTE
// =======================================
app.post('/api/upload', requireRole(['admin','moderator','editor']), (req,res)=>{
  upload.single('file')(req,res,(err)=>{
    if(err) return res.status(500).json({ error: err.message });
    const file = req.file;
    if(!file) return res.status(400).json({ error:'No file uploaded' });
    const ext = path.extname(file.originalname).toLowerCase();
    if(!ALLOWED_EXT.includes(ext)){
      fs.unlinkSync(file.path);
      return res.status(400).json({ error:'File type not allowed' });
    }

    const items = loadMeta();
    const newItem = {
      id: Date.now().toString(36),
      title: req.body.title || file.originalname,
      desc: req.body.desc || '',
      category: req.body.category || 'mods',
      filename: path.basename(file.path),
      originalName: file.originalname,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      public: req.body.public === 'on' || req.body.public === 'true',
      uploader: req.session.user.username
    };
    items.unshift(newItem);
    saveMeta(items);
    res.json({ message:'uploaded', item:newItem });
  });
});

// =======================================
//           FILE DELETE ROUTE
// =======================================
app.delete('/api/admin/delete/:filename', requireRole(['admin']), (req,res)=>{
  const filename = req.params.filename;
  const items = loadMeta();
  const index = items.findIndex(it => it.filename === filename);
  if(index === -1) return res.status(404).json({ error:'File not found' });

  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, filename));
    items.splice(index,1);
    saveMeta(items);
    res.json({ message:'Deleted successfully' });
  } catch(err){
    res.status(500).json({ error:'Failed to delete file' });
  }
});

// =======================================
//           UPDATE FILE ROUTE
// =======================================
app.post('/api/admin/update/:filename', requireRole(['admin','moderator']), (req,res)=>{
  upload.single('file')(req,res,(err)=>{
    if(err) return res.status(500).json({ error:'Upload error' });
    const filename = req.params.filename;
    const items = loadMeta();
    const item = items.find(it => it.filename === filename);
    if(!item) return res.status(404).json({ error:'File not found' });

    fs.unlinkSync(path.join(UPLOAD_DIR, filename)); // remove old file
    item.filename = req.file.filename;
    item.originalName = req.file.originalname;
    item.size = req.file.size;
    item.uploadedAt = new Date().toISOString();
    saveMeta(items);

    res.json({ message:'File updated', item });
  });
});

// =======================================
//           PUBLIC FILES
// =======================================
app.get('/api/items',(req,res)=>{
  const items = loadMeta()
    .filter(it => it.public)
    .map(it => ({
      id: it.id,
      title: it.title,
      desc: it.desc,
      category: it.category,
      filename: it.filename,
      size: it.size
    }));
  res.json(items);
});

// Serve uploaded files
app.get('/files/:filename',(req,res)=>{
  const filename = req.params.filename;
  const item = findItem(filename);
  if(!item) return res.status(404).json({ error:'File not found' });
  if(item.public) return res.sendFile(path.join(UPLOAD_DIR, filename));
  if(req.session.user) return res.sendFile(path.join(UPLOAD_DIR, filename));
  res.status(403).json({ error:'File is not public' });
});

// =======================================
//           START SERVER
// =======================================
app.listen(PORT,()=>console.log(`Server running on http://localhost:${PORT}`));
