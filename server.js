require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();

// Middleware Setups
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// Session Setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'yesyn_secret_key', // Live ပေါ်အတွက် env သုံးနိုင်ရန်
    resave: false,
    saveUninitialized: true
}));

// Images Folder Auto Creation
const uploadDir = path.join(__dirname, 'public', 'images');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Profile Image Configuration (Safe with Session)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        // Login မဝင်ထားပါက 'temp' ဖြင့် သိမ်းဆည်းပြီး Server မကျအောင် ကာကွယ်ခြင်း
        const userId = req.session && req.session.user ? req.session.user.id : 'temp';
        cb(null, `avatar-${userId}${ext}`);
    }
});
const upload = multer({ storage: storage });

// Database Connection with SSL (Suitable for Heroku, Railway, Render, etc.)
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false }
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed: ' + err.stack);
        return;
    }
    console.log('Connected to MySQL Database successfully!');

    // Users Table Creation
    const createUsersTable = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            balance DECIMAL(10, 2) DEFAULT 0.00,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    // Wallet History Table Creation
    const createHistoryTable = `
        CREATE TABLE IF NOT EXISTS wallet_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            type ENUM('income', 'outcome') NOT NULL,
            amount DECIMAL(10, 2) NOT NULL,
            description TEXT,                                
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `;

    // Double code သီးသန့် ရှင်းလင်းပြီး စနစ်တကျ Table ဆောက်ခြင်း
    db.query(createUsersTable, (err, result) => {
        if (err) return console.error('Error creating users table:', err);
        console.log('Users table checked/created successfully!');

        db.query(createHistoryTable, (err, result) => {
            if (err) console.error('Error creating wallet_history table:', err);
            else console.log('Wallet history table checked/created successfully!');
        });
    });
});

// --- Page Routes ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'views', 'register.html')));
app.get('/logout-page', (req, res) => res.sendFile(path.join(__dirname, 'views', 'logout.html')));

app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'views', 'home.html')); 
});

app.get('/history', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html')); 
});

app.get('/profile', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'views', 'profile.html')); 
});

app.get('/settings', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'views', 'setting.html')); 
});

// --- Authentication APIs ---
app.post('/auth/register', async (req, res) => {
    const { username, password, confirmPassword, initial_balance } = req.body;
    
    if (password !== confirmPassword) {
        return res.send("<script>alert('Passwords do not match!'); window.location='/register';</script>");
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], (err, result) => {
            if (err) {
                return res.send("<script>alert('Username already exists!'); window.location='/register';</script>");
            }
            
            const newUserId = result.insertId;
            const startingAmount = parseFloat(initial_balance) || 0;

            const walletQuery = 'INSERT INTO wallet_history (user_id, type, amount, description) VALUES (?, ?, ?, ?)';
            db.query(walletQuery, [newUserId, 'income', startingAmount, 'Initial SignUp Balance'], (walletErr) => {
                if (walletErr) console.error("Error creating initial balance:", walletErr);
                res.send("<script>alert('Registration Successful with Initial Balance!'); window.location='/';</script>");
            });
        });
    } catch {
        res.status(500).send('Server Error');
    }
});

app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
        if (err) return res.status(500).send('Database Error');
        if (results.length === 0 || !(await bcrypt.compare(password, results[0].password))) {
            return res.send("<script>alert('Invalid Username or Password'); window.location='/';</script>");
        }
        req.session.user = results[0];
        res.redirect('/dashboard');
    });
});

app.get('/auth/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/logout-page'));
});

// --- Wallet & Profile APIs ---
app.get('/api/balance', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
    db.query('SELECT type, amount FROM wallet_history WHERE user_id = ?', [req.session.user.id], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database Error' });
        let totalBalance = 0;
        results.forEach(item => {
            if (item.type === 'income') totalBalance += parseFloat(item.amount);
            else if (item.type === 'outcome') totalBalance -= parseFloat(item.amount);
        });
        res.json({ username: req.session.user.username, balance: totalBalance });
    });
});

app.get('/api/profile-data', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
    db.query('SELECT id, username, created_at FROM users WHERE id = ?', [req.session.user.id], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database Error' });
        if (results.length > 0) res.json(results[0]);
        else res.status(404).json({ error: 'User not found' });
    });
});

// 🛠️ [UPDATED] Username ကော Password ကော ပြောင်းလဲမှုကို လိုက်လျောညီထွေဖြစ်စေရန် ပြင်ဆင်ခြင်း
app.post('/api/profile-update', async (req, res) => {
    if (!req.session.user) return res.status(401).send('Unauthorized');
    const { username, password } = req.body;
    const userId = req.session.user.id;

    if (!username || username.trim() === '') {
        return res.send("<script>alert('Username cannot be empty.'); window.location='/profile';</script>");
    }

    try {
        if (password && password.trim() !== '') {
            // စကားဝှက်ရော အမည်ပါ ပြောင်းလဲချိန်
            const hashedPassword = await bcrypt.hash(password, 10);
            db.query('UPDATE users SET username = ?, password = ? WHERE id = ?', [username, hashedPassword, userId], (err) => {
                if (err) return res.send("<script>alert('Username already exists!'); window.location='/profile';</script>");
                req.session.user.username = username; // Update Session
                res.send("<script>alert('Profile & Password Updated Successfully!'); window.location='/profile';</script>");
            });
        } else {
            // အမည်တစ်ခုတည်းသာ ပြောင်းလဲချိန်
            db.query('UPDATE users SET username = ? WHERE id = ?', [username, userId], (err) => {
                if (err) return res.send("<script>alert('Username already exists!'); window.location='/profile';</script>");
                req.session.user.username = username; // Update Session
                res.send("<script>alert('Username Updated Successfully!'); window.location='/profile';</script>");
            });
        }
    } catch {
        res.status(500).send('Server Error');
    }
});

app.post('/api/upload-avatar', upload.single('avatar'), (req, res) => {
    if (!req.session.user) return res.status(401).send('Unauthorized');
    res.redirect('/profile');
});

// --- Wallet Actions (Inflow / Outflow) ---
app.post('/api/transaction', (req, res) => {
    if (!req.session.user) return res.status(401).json({ message: 'Unauthorized' });

    const { description, amount, type } = req.body;
    const userId = req.session.user.id;

    if (!description || !amount || !type) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    const query = 'INSERT INTO wallet_history (user_id, type, amount, description) VALUES (?, ?, ?, ?)';
    db.query(query, [userId, type, amount, description], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Database error' });
        }
        return res.status(200).json({ message: 'Success' });
    });
});

app.get('/api/history', (req, res) => {
    if (!req.session.user) return res.status(401).json({ message: 'Unauthorized' });

    const userId = req.session.user.id;
    const query = 'SELECT type, amount, description, date FROM wallet_history WHERE user_id = ? ORDER BY date DESC';
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Database error' });
        }
        return res.json(results);
    });
});

// 🔍 ရက်စွဲအလိုက် ဝင်ငွေ/ထွက်ငွေ ရှာဖွေရန် API
app.get('/api/search-history', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });

    const userId = req.session.user.id;
    const searchDate = req.query.date;

    if (!searchDate) {
        return res.status(400).json({ error: 'Date is required' });
    }

    const query = `
        SELECT type, amount, description, date 
        FROM wallet_history 
        WHERE user_id = ? AND DATE(date) = ? 
        ORDER BY date DESC
    `;

    db.query(query, [userId, searchDate], (err, results) => {
        if (err) {
            console.error('Search error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));