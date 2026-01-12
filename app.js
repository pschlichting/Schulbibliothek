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

// Benutzer-Liste
app.get('/admin/benutzer', async (req, res) => {
    try {
        const users = await query('SELECT * FROM benutzer ORDER BY name, vname');
        res.render('users', { users });
    } catch (err) {
        console.error('Fehler bei GET /admin/benutzer:', err);
        res.status(500).send('Datenbankfehler.');
    }
});

// Neuen Benutzer anlegen (Formular)
app.get('/admin/benutzer/new', (req, res) => {
    res.render('user-form', {
        formTitle: 'Neuen Benutzer anlegen',
        formAction: '/admin/benutzer/new',
        user: null
    });
});

// Neuen Benutzer speichern
app.post('/admin/benutzer/new', async (req, res) => {
    try {
        const { vname, name, klasse, email } = req.body;

        await query(
            'INSERT INTO benutzer (vname, name, klasse, email) VALUES (?, ?, ?, ?)',
            [vname, name, klasse || null, email || null]
        );

        res.redirect('/admin/benutzer');
    } catch (err) {
        console.error('Fehler bei POST /admin/benutzer/new:', err);
        res.status(500).send('Datenbankfehler.');
    }
});

// Benutzer löschen
app.post('/admin/benutzer/:id/delete', async (req, res) => {
    try {
        const id = req.params.id;

        await query('DELETE FROM benutzer WHERE id = ?', [id]);

        res.redirect('/admin/benutzer');
    } catch (err) {
        console.error('Fehler bei POST /admin/benutzer/:id/delete:', err);
        res
            .status(500)
            .send('Benutzer kann nicht gelöscht werden (evtl. noch Ausleihen vorhanden).');
    }
});

// Formular: Buch ausleihen
app.get('/admin/books/:id/loan', async (req, res) => {
    try {
        const id = req.params.id;

        const buchRows = await query('SELECT * FROM buch WHERE id = ?', [id]);
        if (buchRows.length === 0) {
            return res.status(404).send('Buch nicht gefunden.');
        }

        const nameFilter = req.query.name || '';
        const klasseFilter = req.query.klasse || '';

        let benutzerSql = 'SELECT * FROM benutzer WHERE 1';
        const params = [];

        if (nameFilter.trim() !== '') {
            benutzerSql += ' AND (name LIKE ? OR vname LIKE ?)';
            const like = '%' + nameFilter.trim() + '%';
            params.push(like, like);
        }

        if (klasseFilter.trim() !== '') {
            benutzerSql += ' AND klasse = ?';
            params.push(klasseFilter.trim());
        }

        benutzerSql += ' ORDER BY name, vname';

        const benutzer = await query(benutzerSql, params);

        res.render('loan-form', {
            book: buchRows[0],
            benutzer,
            filters: {
                name: nameFilter,
                klasse: klasseFilter
            }
        });
    } catch (err) {
        console.error('Fehler bei GET /admin/books/:id/loan:', err);
        res.status(500).send('Datenbankfehler.');
    }
});

// Ausleihe speichern
app.post('/admin/books/:id/loan', async (req, res) => {
    try {
        const id = req.params.id;
        const benutzerId = req.body.benutzer_id;

        const buchRows = await query('SELECT anzahlver FROM buch WHERE id = ?', [id]);
        if (buchRows.length === 0) {
            return res.status(404).send('Buch nicht gefunden.');
        }

        if (buchRows[0].anzahlver <= 0) {
            return res.status(400).send('Keine Exemplare verfügbar.');
        }

        const today = new Date().toISOString().slice(0, 10);
        const bibliothekarId = 1; // Platzhalter

        await query(
            `INSERT INTO ausleihe (buch_id, benutzer_id, bibliothekar_id, ausleihdatum, rueckgabedatum)
             VALUES (?, ?, ?, ?, NULL)`,
            [id, benutzerId, bibliothekarId, today]
        );

        await query(
            'UPDATE buch SET anzahlver = anzahlver - 1 WHERE id = ?',
            [id]
        );

        res.redirect('/admin/ausleihen');
    } catch (err) {
        console.error('Fehler bei POST /admin/books/:id/loan:', err);
        res.status(500).send('Datenbankfehler.');
    }
});

// Übersicht aller Ausleihen
app.get('/admin/ausleihen', async (req, res) => {
    try {
        const nurAktiv = req.query.nurAktiv || '';

        let where = '';
        const params = [];

        if (nurAktiv === '1') {
            where = 'WHERE a.rueckgabedatum IS NULL';
        }

        const sql = `
            SELECT 
                a.id,
                a.ausleihdatum,
                a.rueckgabedatum,
                b.titel AS buchtitel,
                u.vname AS bvname,
                u.name AS bname,
                u.klasse AS bklasse
            FROM ausleihe a
            JOIN buch b ON a.buch_id = b.id
            JOIN benutzer u ON a.benutzer_id = u.id
            ${where}
            ORDER BY a.ausleihdatum DESC, a.id DESC
        `;

        const ausleihen = await query(sql, params);

        res.render('loans', { ausleihen, nurAktiv });
    } catch (err) {
        console.error('Fehler bei GET /admin/ausleihen:', err);
        res.status(500).send('Datenbankfehler.');
    }
});

// Rückgabe
app.post('/admin/ausleihen/:id/return', async (req, res) => {
    try {
        const ausleiheId = req.params.id;

        const rows = await query(
            'SELECT buch_id, rueckgabedatum FROM ausleihe WHERE id = ?',
            [ausleiheId]
        );

        if (rows.length === 0) {
            return res.status(404).send('Ausleihe nicht gefunden.');
        }

        const ausleihe = rows[0];

        if (ausleihe.rueckgabedatum) {
            return res.redirect('/admin/ausleihen');
        }

        const today = new Date().toISOString().slice(0, 10);

        await query(
            'UPDATE ausleihe SET rueckgabedatum = ? WHERE id = ?',
            [today, ausleiheId]
        );

        await query(
            'UPDATE buch SET anzahlver = anzahlver + 1 WHERE id = ?',
            [ausleihe.buch_id]
        );

        res.redirect('/admin/ausleihen');
    } catch (err) {
        console.error('Fehler bei POST /admin/ausleihen/:id/return:', err);
        res.status(500).send('Datenbankfehler.');
    }
});



// Formular: Buch ausleihen
app.get('/admin/books/:id/loan', async (req, res) => {
    try {
        const id = req.params.id;

        const buchRows = await query('SELECT * FROM buch WHERE id = ?', [id]);
        if (buchRows.length === 0) {
            return res.status(404).send('Buch nicht gefunden.');
        }

        const benutzer = await query('SELECT * FROM benutzer ORDER BY name, vname');

        res.render('loan-form', {
            book: buchRows[0],
            benutzer
        });
    } catch (err) {
        console.error('Fehler bei GET /admin/books/:id/loan:', err);
        res.status(500).send('Datenbankfehler.');
    }
});

// Ausleihe speichern
app.post('/admin/books/:id/loan', async (req, res) => {
    try {
        const id = req.params.id;
        const benutzerId = req.body.benutzer_id;

        const buchRows = await query('SELECT anzahlver FROM buch WHERE id = ?', [id]);
        if (buchRows.length === 0) {
            return res.status(404).send('Buch nicht gefunden.');
        }

        if (buchRows[0].anzahlver <= 0) {
            return res.status(400).send('Keine Exemplare verfügbar.');
        }

        const today = new Date().toISOString().slice(0, 10);
        const bibliothekarId = 1; // Platzhalter: ID des Admins

        await query(
            `INSERT INTO ausleihe (buch_id, benutzer_id, bibliothekar_id, ausleihdatum, rueckgabedatum)
             VALUES (?, ?, ?, ?, NULL)`,
            [id, benutzerId, bibliothekarId, today]
        );

        await query(
            'UPDATE buch SET anzahlver = anzahlver - 1 WHERE id = ?',
            [id]
        );

        res.redirect('/admin/ausleihen');
    } catch (err) {
        console.error('Fehler bei POST /admin/books/:id/loan:', err);
        res.status(500).send('Datenbankfehler.');
    }
});

// Übersicht aller Ausleihen
app.get('/admin/ausleihen', async (req, res) => {
    try {
        const ausleihen = await query(`
            SELECT 
                a.id,
                a.ausleihdatum,
                a.rueckgabedatum,
                b.titel AS buchtitel,
                u.vname AS bvname,
                u.name AS bname,
                u.klasse AS bklasse
            FROM ausleihe a
            JOIN buch b ON a.buch_id = b.id
            JOIN benutzer u ON a.benutzer_id = u.id
            ORDER BY a.ausleihdatum DESC, a.id DESC
        `);

        res.render('loans', { ausleihen });
    } catch (err) {
        console.error('Fehler bei GET /admin/ausleihen:', err);
        res.status(500).send('Datenbankfehler.');
    }
});

// Rückgabe
app.post('/admin/ausleihen/:id/return', async (req, res) => {
    try {
        const ausleiheId = req.params.id;

        const rows = await query(
            'SELECT buch_id, rueckgabedatum FROM ausleihe WHERE id = ?',
            [ausleiheId]
        );

        if (rows.length === 0) {
            return res.status(404).send('Ausleihe nicht gefunden.');
        }

        const ausleihe = rows[0];

        if (ausleihe.rueckgabedatum) {
            return res.redirect('/admin/ausleihen');
        }

        const today = new Date().toISOString().slice(0, 10);

        await query(
            'UPDATE ausleihe SET rueckgabedatum = ? WHERE id = ?',
            [today, ausleiheId]
        );

        await query(
            'UPDATE buch SET anzahlver = anzahlver + 1 WHERE id = ?',
            [ausleihe.buch_id]
        );

        res.redirect('/admin/ausleihen');
    } catch (err) {
        console.error('Fehler bei POST /admin/ausleihen/:id/return:', err);
        res.status(500).send('Datenbankfehler.');
    }
});


app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
});
