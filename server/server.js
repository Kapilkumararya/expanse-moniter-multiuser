const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_this';

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// --- AUTH MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) return res.status(401).json({ status: "error", message: "Access denied" });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ status: "error", message: "Invalid token" });
        req.user = user; 
        next();
    });
};

// --- AUTH ROUTES ---

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Missing fields" });

    try {
        const userCheck = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userCheck.rows.length > 0) return res.status(400).json({ message: "Username already exists" });

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await pool.query(
            'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
            [username, hashedPassword]
        );
        const userId = newUser.rows[0].id;

        const defaultCats = ['Lunch', 'Dinner', 'Travel', 'Bills', 'Snacks'];
        for (const cat of defaultCats) {
            await pool.query('INSERT INTO categories (user_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, cat]);
        }
        await pool.query('INSERT INTO people (user_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, 'Me']);

        res.json({ status: "success", message: "User created" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error", message: "Server error" });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const userRes = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userRes.rows.length === 0) return res.status(400).json({ message: "User not found" });

        const user = userRes.rows[0];

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(401).json({ message: "Invalid credentials" });

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });

        res.json({ status: "success", token, username: user.username });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error", message: "Server error" });
    }
});

// --- DATA ROUTES ---

app.get('/api/init', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const peopleRes = await pool.query('SELECT name FROM people WHERE user_id = $1 ORDER BY id ASC', [userId]);
        const catsRes = await pool.query('SELECT name FROM categories WHERE user_id = $1 ORDER BY id ASC', [userId]);

        res.json({
            status: "success",
            people: peopleRes.rows.map(r => r.name),
            categories: catsRes.rows.map(r => r.name)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error", message: "Database error" });
    }
});

app.post('/api/expenses', authenticateToken, async (req, res) => {
    const { amount, person, category, description, date } = req.body;
    const userId = req.user.id;

    try {
        await pool.query(
            'INSERT INTO expenses (user_id, amount, person, category, description, date) VALUES ($1, $2, $3, $4, $5, $6)',
            [userId, amount, person, category, description, date]
        );
        res.json({ status: "success", message: "Saved successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error", message: "Failed to save" });
    }
});

// GET History with Pagination
app.get('/api/expenses/history', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 0;
        const limit = 10;
        const offset = page * limit;

        const result = await pool.query(
            'SELECT * FROM expenses WHERE user_id = $1 ORDER BY date DESC LIMIT $2 OFFSET $3',
            [userId, limit, offset]
        );
        res.json({ status: "success", transactions: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error", message: "Failed to fetch history" });
    }
});

// --- NEW EXPORT ROUTES ---

// Get Metadata (Earliest Date)
app.get('/api/expenses/meta', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query('SELECT MIN(date) as first_date FROM expenses WHERE user_id = $1', [userId]);
        res.json({ status: "success", firstDate: result.rows[0].first_date });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error" });
    }
});

// Export Data
app.get('/api/expenses/export', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { startDate, endDate } = req.query;

        let queryText = 'SELECT * FROM expenses WHERE user_id = $1';
        const queryParams = [userId];

        if (startDate && endDate) {
            queryText += ' AND date >= $2 AND date <= $3';
            queryParams.push(startDate, endDate);
        } else {
            // Default: Last 30 days
             queryText += ` AND date >= NOW() - INTERVAL '30 days'`;
        }

        queryText += ' ORDER BY date DESC';
        
        // Limit 100 only if using default logic (no specific range provided)
        if (!startDate) {
             queryText += ' LIMIT 100';
        }

        const result = await pool.query(queryText, queryParams);
        res.json({ status: "success", transactions: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error", message: "Export failed" });
    }
});

// PUT (Edit) Expense
app.put('/api/expenses/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { amount, person, category, description, date } = req.body;
    const userId = req.user.id;

    try {
        await pool.query(
            'UPDATE expenses SET amount = $1, person = $2, category = $3, description = $4, date = $5 WHERE id = $6 AND user_id = $7',
            [amount, person, category, description, date, id, userId]
        );
        res.json({ status: "success", message: "Updated successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error", message: "Failed to update" });
    }
});

// DELETE Expense
app.delete('/api/expenses/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        await pool.query('DELETE FROM expenses WHERE id = $1 AND user_id = $2', [id, userId]);
        res.json({ status: "success", message: "Deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error", message: "Failed to delete" });
    }
});

app.post('/api/people', authenticateToken, async (req, res) => {
    const { name } = req.body;
    const userId = req.user.id;
    try {
        await pool.query('INSERT INTO people (user_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, name]);
        res.json({ status: "success" });
    } catch (err) {
        res.status(500).json({ status: "error" });
    }
});

app.post('/api/categories', authenticateToken, async (req, res) => {
    const { name } = req.body;
    const userId = req.user.id;
    try {
        await pool.query('INSERT INTO categories (user_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, name]);
        res.json({ status: "success" });
    } catch (err) {
        res.status(500).json({ status: "error" });
    }
});

// Delete Category
app.delete('/api/categories/:name', authenticateToken, async (req, res) => {
    const { name } = req.params;
    const userId = req.user.id;
    try {
        const decodedName = decodeURIComponent(name);
        await pool.query('DELETE FROM categories WHERE user_id = $1 AND name = $2', [userId, decodedName]);
        res.json({ status: "success" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error" });
    }
});

// Delete Person
app.delete('/api/people/:name', authenticateToken, async (req, res) => {
    const { name } = req.params;
    const userId = req.user.id;
    try {
        const decodedName = decodeURIComponent(name);
        if(decodedName === 'Me') return res.status(403).json({status: "error", message: "Cannot delete default profile"});
        
        await pool.query('DELETE FROM people WHERE user_id = $1 AND name = $2', [userId, decodedName]);
        res.json({ status: "success" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error" });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});