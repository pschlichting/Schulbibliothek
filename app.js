const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 3000;

// View-Engine und Pfade
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// statische Dateien (CSS, Bilder, ...)
app.use(express.static(path.join(__dirname, 'public')));

// Formulardaten auslesen
app.use(express.urlencoded({ extended: false }));

// SQLite-DB
const dbPath = path.join(__dirname, 'schulbibliothek.db');
const db = new sqlite3.Database(dbPath);

// kleine Helper-Funktion für SQL
function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        const upper = sql.trim().toUpperCase();
        const isSelect = upper.startsWith('SELECT') || upper.startsWith('PRAGMA');

        if (isSelect) {
            db.all(sql, params, (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        } else {
            db.run(sql, params, function (err) {
                if (err) return reject(err);
                resolve(this);
            });
        }
    });
}

// Startseite: Bücherliste + Filter
app.get('/', async (req, res) => {
    try {
        const q = req.query.q || '';
        const kategorie = req.query.kategorie || '';
        const verlag = req.query.verlag || '';
        const verfuegbar = req.query.verfuegbar || '';

        let sql = 'SELECT * FROM buch WHERE 1';
        const params = [];

        if (q.trim() !== '') {
            sql += ' AND (titel LIKE ? OR beschreibung LIKE ? OR autor LIKE ?)';
            const like = '%' + q.trim() + '%';
            params.push(like, like, like);
        }

        if (kategorie.trim() !== '') {
            sql += ' AND kategorie = ?';
            params.push(kategorie.trim());
        }

        if (verlag.trim() !== '') {
            sql += ' AND verlag = ?';
            params.push(verlag.trim());
        }

        if (verfuegbar === '1') {
            sql += ' AND anzahlver > 0';
        } else if (verfuegbar === '0') {
            sql += ' AND anzahlver = 0';
        }

        sql += ' ORDER BY titel';

        const books = await query(sql, params);

        const kategorienRows = await query(`
      SELECT DISTINCT kategorie
      FROM buch
      WHERE kategorie IS NOT NULL AND kategorie <> ''
      ORDER BY kategorie
    `);

        const verlageRows = await query(`
      SELECT DISTINCT verlag
      FROM buch
      WHERE verlag IS NOT NULL AND verlag <> ''
      ORDER BY verlag
    `);

        const kategorien = kategorienRows.map(r => r.kategorie);
        const verlage = verlageRows.map(r => r.verlag);

        res.render('index', {
            books,
            filters: { q, kategorie, verlag, verfuegbar },
            kategorien,
            verlage
        });
    } catch (err) {
        console.error('Fehler bei GET /:', err);
        res.status(500).send('Datenbankfehler.');
    }
});

// Admin-Übersicht
app.get('/admin', async (req, res) => {
    try {
        const books = await query('SELECT * FROM buch ORDER BY titel');
        res.render('admin', { books });
    } catch (err) {
        console.error('Fehler bei GET /admin:', err);
        res.status(500).send('Datenbankfehler.');
    }
});

// Formular: neues Buch
app.get('/admin/books/new', (req, res) => {
    res.render('book-form', {
        formTitle: 'Neues Buch anlegen',
        formAction: '/admin/books/new',
        book: null
    });
});

// Neues Buch speichern
app.post('/admin/books/new', async (req, res) => {
    try {
        const {
            isbn,
            titel,
            beschreibung,
            autor,
            verlag,
            kategorie,
            apreis,
            anzahlges
        } = req.body;

        const gesamt = parseInt(anzahlges, 10) || 0;

        const sql = `
      INSERT INTO buch (
        isbn, titel, beschreibung, autor, verlag, kategorie,
        apreis, anzahlges, anzahlver
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

        await query(sql, [
            isbn,
            titel,
            beschreibung || null,
            autor || null,
            verlag || null,
            kategorie || null,
            apreis || null,
            gesamt,
            gesamt
        ]);

        res.redirect('/admin');
    } catch (err) {
        console.error('Fehler bei POST /admin/books/new:', err);
        res.status(500).send('Datenbankfehler.');
    }
});

// Formular: Buch bearbeiten
app.get('/admin/books/:id/edit', async (req, res) => {
    try {
        const id = req.params.id;
        const rows = await query('SELECT * FROM buch WHERE id = ?', [id]);

        if (rows.length === 0) {
            return res.status(404).send('Buch nicht gefunden.');
        }

        res.render('book-form', {
            formTitle: 'Buch bearbeiten',
            formAction: `/admin/books/${id}/edit`,
            book: rows[0]
        });
    } catch (err) {
        console.error('Fehler bei GET /admin/books/:id/edit:', err);
        res.status(500).send('Datenbankfehler.');
    }
});

// Änderungen speichern
app.post('/admin/books/:id/edit', async (req, res) => {
    try {
        const id = req.params.id;
        const {
            isbn,
            titel,
            beschreibung,
            autor,
            verlag,
            kategorie,
            apreis,
            anzahlges,
            anzahlver
        } = req.body;

        let gesamt = parseInt(anzahlges, 10);
        if (isNaN(gesamt) || gesamt < 0) gesamt = 0;

        let verfuegbar = parseInt(anzahlver, 10);
        if (isNaN(verfuegbar) || verfuegbar < 0) verfuegbar = 0;
        if (verfuegbar > gesamt) verfuegbar = gesamt;

        const sql = `
      UPDATE buch
         SET isbn = ?,
             titel = ?,
             beschreibung = ?,
             autor = ?,
             verlag = ?,
             kategorie = ?,
             apreis = ?,
             anzahlges = ?,
             anzahlver = ?
       WHERE id = ?
    `;

        await query(sql, [
            isbn,
            titel,
            beschreibung || null,
            autor || null,
            verlag || null,
            kategorie || null,
            apreis || null,
            gesamt,
            verfuegbar,
            id
        ]);

        res.redirect('/admin');
    } catch (err) {
        console.error('Fehler bei POST /admin/books/:id/edit:', err);
        res.status(500).send('Datenbankfehler.');
    }
});

// Buch löschen
app.post('/admin/books/:id/delete', async (req, res) => {
    try {
        const id = req.params.id;
        await query('DELETE FROM buch WHERE id = ?', [id]);
        res.redirect('/admin');
    } catch (err) {
        console.error('Fehler bei POST /admin/books/:id/delete:', err);
        res.status(500).send('Datenbankfehler.');
    }
});

app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
});
