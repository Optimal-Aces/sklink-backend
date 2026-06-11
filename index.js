const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

const multer = require('multer');
const path = require('path');
app.use(express.static(path.join(__dirname, '../web-admin')));

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG and PDF files are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

// Make upload accessible globally
app.locals.upload = upload;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/members', require('./routes/members')); // add this
app.use('/api/events', require('./routes/events'));       // add this
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/rewards', require('./routes/rewards'));
app.use('/api/transparency', require('./routes/transparency')); // add this
app.use('/api/feedback', require('./routes/feedback'));   
app.use('/api/users', require('./routes/users')); 
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/team-events', require('./routes/teamEvents'));


// Test route
app.get('/', (req, res) => {
  res.json({ message: 'SKLink 2.0 API is running.' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});