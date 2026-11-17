const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = 3000;

const DATA_DIR = path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");
const DB_FILE = path.join(DATA_DIR, "database.json");
const SECRET_FILE = path.join(DATA_DIR, "session-secret.key");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
        DB_FILE,
        JSON.stringify({ users: [], scripts: [] }, null, 2)
    );
}

if (!fs.existsSync(SECRET_FILE)) {
    fs.writeFileSync(SECRET_FILE, crypto.randomBytes(48).toString("hex"));
}

const SESSION_SECRET = fs.readFileSync(SECRET_FILE, "utf8");

function readDatabase() {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveDatabase(data) {
    const temporaryFile = DB_FILE + ".tmp";

    fs.writeFileSync(
        temporaryFile,
        JSON.stringify(data, null, 2)
    );

    fs.renameSync(temporaryFile, DB_FILE);
}

app.disable("x-powered-by");

app.use(helmet());

app.use(express.json({ limit: "100kb" }));

app.use(express.urlencoded({
    extended: false,
    limit: "100kb"
}));

app.use(session({
    name: "hfzzscript.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
}));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false
});

function createCsrfToken() {
    return crypto.randomBytes(32).toString("hex");
}

function requireCsrf(req, res, next) {
    const token = req.headers["x-csrf-token"];
    const expected = req.session.csrfToken;

    if (
        typeof token !== "string" ||
        typeof expected !== "string" ||
        token.length !== expected.length ||
        !crypto.timingSafeEqual(
            Buffer.from(token),
            Buffer.from(expected)
        )
    ) {
        return res.status(403).json({
            error: "Token keamanan tidak valid. Muat ulang halaman."
        });
    }

    next();
}

function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            error: "Silakan login terlebih dahulu."
        });
    }

    next();
}

function getCurrentUser(userId) {
    const db = readDatabase();

    const user = db.users.find(item => item.id === userId);

    if (!user) return null;

    return {
        id: user.id,
        username: user.username
    };
}

// SESSION
app.get("/api/session", (req, res) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = createCsrfToken();
    }

    res.json({
        user: req.session.userId
            ? getCurrentUser(req.session.userId)
            : null,
        csrfToken: req.session.csrfToken
    });
});

// REGISTER
app.post("/api/register", authLimiter, requireCsrf, async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            return res.status(400).json({
                error: "Username harus 3-20 karakter dan hanya boleh menggunakan huruf, angka, dan underscore."
            });
        }

        if (password.length < 8 || password.length > 100) {
            return res.status(400).json({
                error: "Password harus terdiri dari 8-100 karakter."
            });
        }

        const db = readDatabase();

        const exists = db.users.some(
            user => user.username.toLowerCase() === username.toLowerCase()
        );

        if (exists) {
            return res.status(409).json({
                error: "Username sudah digunakan."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const user = {
            id: crypto.randomUUID(),
            username,
            passwordHash,
            createdAt: new Date().toISOString()
        };

        db.users.push(user);
        saveDatabase(db);

        req.session.regenerate(error => {
            if (error) {
                return res.status(500).json({
                    error: "Gagal membuat sesi."
                });
            }

            req.session.userId = user.id;
            req.session.csrfToken = createCsrfToken();

            req.session.save(() => {
                res.json({
                    message: "Registrasi berhasil.",
                    user: {
                        id: user.id,
                        username: user.username
                    },
                    csrfToken: req.session.csrfToken
                });
            });
        });

    } catch (error) {
        res.status(500).json({
            error: "Terjadi kesalahan server."
        });
    }
});

// LOGIN
app.post("/api/login", authLimiter, requireCsrf, async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        const db = readDatabase();

        const user = db.users.find(
            item => item.username.toLowerCase() === username.toLowerCase()
        );

        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
            return res.status(401).json({
                error: "Username atau password salah."
            });
        }

        req.session.regenerate(error => {
            if (error) {
                return res.status(500).json({
                    error: "Gagal membuat sesi."
                });
            }

            req.session.userId = user.id;
            req.session.csrfToken = createCsrfToken();

            req.session.save(() => {
                res.json({
                    message: "Login berhasil.",
                    user: {
                        id: user.id,
                        username: user.username
                    },
                    csrfToken: req.session.csrfToken
                });
            });
        });

    } catch (error) {
        res.status(500).json({
            error: "Terjadi kesalahan server."
        });
    }
});

// LOGOUT
app.post("/api/logout", requireLogin, requireCsrf, (req, res) => {
    req.session.destroy(() => {
        res.clearCookie("hfzzscript.sid");

        res.json({
            message: "Berhasil logout."
        });
    });
});

// GET ALL SCRIPTS
app.get("/api/scripts", (req, res) => {
    const db = readDatabase();

    let scripts = db.scripts;

    const search = String(req.query.search || "").toLowerCase();
    const game = String(req.query.game || "");
    const category = String(req.query.category || "");
    const mine = req.query.mine === "true";

    if (search) {
        scripts = scripts.filter(script =>
            script.title.toLowerCase().includes(search) ||
            script.description.toLowerCase().includes(search)
        );
    }

    if (game) {
        scripts = scripts.filter(script => script.game === game);
    }

    if (category) {
        scripts = scripts.filter(script => script.category === category);
    }

    if (mine && req.session.userId) {
        scripts = scripts.filter(
            script => script.ownerId === req.session.userId
        );
    }

    scripts = [...scripts].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json({
        scripts: scripts.map(({ code, ...script }) => script)
    });
});

// GET SCRIPT DETAIL
app.get("/api/scripts/:id", (req, res) => {
    const db = readDatabase();

    const script = db.scripts.find(
        item => item.id === req.params.id
    );

    if (!script) {
        return res.status(404).json({
            error: "Script tidak ditemukan."
        });
    }

    res.json({ script });
});

// CREATE SCRIPT
app.post("/api/scripts", requireLogin, requireCsrf, (req, res) => {
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const code = String(req.body.code || "");
    const game = String(req.body.game || "Universal");
    const category = String(req.body.category || "Other");

    if (!title || title.length > 80) {
        return res.status(400).json({
            error: "Judul harus 1-80 karakter."
        });
    }

    if (description.length > 500) {
        return res.status(400).json({
            error: "Deskripsi maksimal 500 karakter."
        });
    }

    if (!code.trim() || code.length > 50000) {
        return res.status(400).json({
            error: "Kode script harus 1-50000 karakter."
        });
    }

    const db = readDatabase();

    const script = {
        id: crypto.randomUUID(),
        title,
        description,
        code,
        game,
        category,
        ownerId: req.session.userId,
        ownerUsername: getCurrentUser(req.session.userId).username,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    db.scripts.push(script);
    saveDatabase(db);

    res.status(201).json({
        message: "Script berhasil diterbitkan.",
        script
    });
});

// EDIT SCRIPT
app.put("/api/scripts/:id", requireLogin, requireCsrf, (req, res) => {
    const db = readDatabase();

    const script = db.scripts.find(
        item => item.id === req.params.id
    );

    if (!script) {
        return res.status(404).json({
            error: "Script tidak ditemukan."
        });
    }

    if (script.ownerId !== req.session.userId) {
        return res.status(403).json({
            error: "Kamu tidak memiliki izin mengedit script ini."
        });
    }

    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const code = String(req.body.code || "");

    if (!title || title.length > 80) {
        return res.status(400).json({
            error: "Judul harus 1-80 karakter."
        });
    }

    if (description.length > 500 || !code.trim() || code.length > 50000) {
        return res.status(400).json({
            error: "Deskripsi atau kode script tidak valid."
        });
    }

    script.title = title;
    script.description = description;
    script.code = code;
    script.game = String(req.body.game || "Universal");
    script.category = String(req.body.category || "Other");
    script.updatedAt = new Date().toISOString();

    saveDatabase(db);

    res.json({
        message: "Script berhasil diperbarui.",
        script
    });
});

// DELETE SCRIPT
app.delete("/api/scripts/:id", requireLogin, requireCsrf, (req, res) => {
    const db = readDatabase();

    const index = db.scripts.findIndex(
        item => item.id === req.params.id
    );

    if (index === -1) {
        return res.status(404).json({
            error: "Script tidak ditemukan."
        });
    }

    if (db.scripts[index].ownerId !== req.session.userId) {
        return res.status(403).json({
            error: "Kamu tidak memiliki izin menghapus script ini."
        });
    }

    db.scripts.splice(index, 1);
    saveDatabase(db);

    res.json({
        message: "Script berhasil dihapus."
    });
});

// WEBSITE
app.use(express.static(PUBLIC_DIR));

app.use((req, res) => {
    res.status(404).send("Halaman tidak ditemukan.");
});

// SERVER
app.listen(PORT, "0.0.0.0", () => {
    console.log("--------------------------------");
    console.log("       HFZZSCRIPT SERVER");
    console.log("--------------------------------");
    console.log(`Website: http://localhost:${PORT}`);
    console.log("Status: ONLINE");
    console.log("--------------------------------");
});
