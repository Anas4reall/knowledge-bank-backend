const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'knowledge_bank.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeDatabase();
    }
});

function initializeDatabase() {
    db.serialize(() => {
        // Create files table
        db.run(`
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                majorId TEXT NOT NULL,
                levelId INTEGER NOT NULL,
                subject TEXT NOT NULL,
                uploader TEXT NOT NULL,
                rating REAL DEFAULT 0,
                date TEXT NOT NULL,
                type TEXT NOT NULL,
                fileUrl TEXT NOT NULL
            )
        `);

        // Create users table
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'student'
            )
        `);

        // Insert some initial mock data if the table is empty
        db.get("SELECT COUNT(*) AS count FROM files", (err, row) => {
            if (err) return;
            if (row.count === 0) {
                console.log("Seeding database with initial data...");
                const stmt = db.prepare(`
                    INSERT INTO files (title, majorId, levelId, subject, uploader, rating, date, type, fileUrl)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                
                const initialData = [
                    ['ملخص هندسة برمجيات', 'it', 3, 'هندسة برمجيات', 'أحمد صالح', 4.8, '2023-10-15', 'PDF', '#'],
                    ['شرح الخوارزميات المتقدمة', 'cs', 2, 'خوارزميات وهياكل بيانات', 'سارة محمد', 5.0, '2023-11-02', 'PDF', '#'],
                    ['مقدمة في التشفير', 'sec', 3, 'تشفير وتحليل شفرات', 'عمر القاضي', 4.5, '2023-09-20', 'DOC', '#'],
                    ['قواعد البيانات الموزعة', 'cis', 4, 'قواعد بيانات 2', 'مها علي', 4.2, '2023-12-05', 'PDF', '#']
                ];

                initialData.forEach(file => stmt.run(file));
                stmt.finalize();
                console.log("Database seeded successfully.");
            }
        });
    });
}

module.exports = db;
