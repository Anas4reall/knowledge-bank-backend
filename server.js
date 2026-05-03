const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');

const app = express();
const port = process.env.PORT || 5000;
const JWT_SECRET = 'knowledge_bank_secret_key_123';

// Middlewares
app.use(cors());
app.use(express.json());
// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// --- Auth Middleware ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Access Denied. No token provided." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid token." });
        req.user = user;
        next();
    });
};

// --- Auth Routes ---

// Register
app.post('/api/auth/register', async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password are required" });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const userRole = role === 'admin' ? 'admin' : 'student';

        const stmt = db.prepare(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`);
        stmt.run([username, hashedPassword, userRole], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: "Username already exists" });
                }
                return res.status(500).json({ error: "Failed to register user" });
            }
            res.status(201).json({ message: "User registered successfully", userId: this.lastID });
        });
        stmt.finalize();
    } catch (err) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password are required" });

    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!user) return res.status(400).json({ error: "Invalid username or password" });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: "Invalid username or password" });

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ message: "Logged in successfully", token, user: { username: user.username, role: user.role } });
    });
});

// --- File Routes ---

// Get all files
app.get('/api/files', (req, res) => {
    const { search, major, level } = req.query;
    
    let query = "SELECT * FROM files WHERE 1=1";
    let params = [];

    if (search) {
        query += " AND (title LIKE ? OR subject LIKE ?)";
        params.push(`%${search}%`, `%${search}%`);
    }
    if (major) {
        query += " AND majorId = ?";
        params.push(major);
    }
    if (level) {
        query += " AND levelId = ?";
        params.push(level);
    }

    query += " ORDER BY date DESC";

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Internal Server Error" });
        }
        res.json(rows);
    });
});

// Upload a new file (Protected Route)
app.post('/api/files', authenticateToken, upload.single('file'), (req, res) => {
    const { title, majorId, levelId, subject } = req.body;
    
    const fileUploader = req.user.username; // Taken from JWT
    const rating = 0;
    const date = new Date().toISOString().split('T')[0];
    
    let type = 'UNKNOWN';
    let fileUrl = '#';

    if (req.file) {
        const ext = path.extname(req.file.originalname).toUpperCase().replace('.', '');
        if (['PDF', 'DOC', 'DOCX'].includes(ext)) {
            type = ext.startsWith('DOC') ? 'DOC' : 'PDF';
        } else if (ext === 'ZIP') {
            type = 'ZIP';
        } else {
            type = ext;
        }
        fileUrl = `/uploads/${req.file.filename}`;
    }

    const stmt = db.prepare(`
        INSERT INTO files (title, majorId, levelId, subject, uploader, rating, date, type, fileUrl)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([title, majorId, levelId, subject, fileUploader, rating, date, type, fileUrl], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Failed to upload file to database" });
        }
        res.status(201).json({
            message: "File uploaded successfully",
            file: {
                id: this.lastID,
                title, majorId, levelId, subject, uploader: fileUploader, rating, date, type, fileUrl
            }
        });
    });
    stmt.finalize();
});

// Start server
app.listen(port, () => {
    console.log(`Backend server is running on http://localhost:${port}`);
});
