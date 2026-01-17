const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Pfad zur SQLite-Datei im Projektordner
const dbPath = path.join(__dirname, 'schulbibliothek.db');
const db = new sqlite3.Database(dbPath);

const schema = `
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS ausleihe;
DROP TABLE IF EXISTS buch;
DROP TABLE IF EXISTS benutzer;
DROP TABLE IF EXISTS bibliothekar;

PRAGMA foreign_keys = ON;

-- Tabelle: Benutzer (Schüler:innen / Lehrkräfte)
CREATE TABLE benutzer (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  vname   TEXT NOT NULL,
  name    TEXT NOT NULL,
  klasse  TEXT,
  email   TEXT
);

-- Tabelle: Bibliothekar
CREATE TABLE bibliothekar (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  vname         TEXT NOT NULL,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  bename        TEXT NOT NULL UNIQUE,
  passwort_hash TEXT NOT NULL
);

-- Tabelle: Buch
CREATE TABLE buch (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  isbn        TEXT NOT NULL,
  titel       TEXT NOT NULL,
  beschreibung TEXT,
  autor       TEXT,
  verlag      TEXT,
  kategorie   TEXT,
  apreis      REAL,
  anzahlges   INTEGER NOT NULL,
  anzahlver   INTEGER NOT NULL
);

-- Tabelle: Ausleihe
CREATE TABLE ausleihe (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  buch_id         INTEGER NOT NULL,
  benutzer_id     INTEGER NOT NULL,
  bibliothekar_id INTEGER NOT NULL,
  ausleihdatum    TEXT NOT NULL,
  rueckgabedatum  TEXT,
  FOREIGN KEY (buch_id) REFERENCES buch(id),
  FOREIGN KEY (benutzer_id) REFERENCES benutzer(id),
  FOREIGN KEY (bibliothekar_id) REFERENCES bibliothekar(id)
);

-- Testdaten: Benutzer
INSERT INTO benutzer (vname, name, klasse, email) VALUES
  ('Phillipp', 'Schlichting', '4ITM', 'phillipp.schlichting@school.at'),
  ('Paul', 'Berger', '3ITM', 'paul.berger@school.at');

-- Testdaten: Bibliothekar (Platzhalter-Hash)
INSERT INTO bibliothekar (vname, name, email, bename, passwort_hash) VALUES
  ('Max', 'Mustermann', 'max.mustermann@school.at', 'admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9');

-- Testdaten: Bücher
INSERT INTO buch
  (isbn, titel, beschreibung, autor, verlag, kategorie, apreis, anzahlges, anzahlver)
VALUES
  ('978-3-12345-000-1',
   'Elektrotechnik - Grundlagen + E-Book',
   'Grundlagen der Elektrotechnik für HTL-Schüler:innen.',
   'Verlag Jugend & Volk GmbH',
   'Verlag Jugend & Volk GmbH',
   'Bildung',
   20.00,
   2,
   2),
  ('978-3-12345-000-2',
   'Exel',
   'Einführung in das wundevolle EXEL.',
   'Bill Gates',
   'Microsoft',
   'Informationstechnologie',
   49.99,
   4,
   4),
  ('978-3-12345-000-3',
   'Mann & Kuh',
   'Eine Herzzerreisende Geschichte über einen Mann und einer Kuh.',
   'Julian Bittner',
   'Fantasy World',
   'Wissenschaft',
   30.00,
   1,
   1);
`;

db.exec(schema, (err) => {
    if (err) {
        console.error('Fehler beim Initialisieren der SQLite-DB:', err);
    } else {
        console.log('SQLite-Datenbank schulbibliothek.db wurde neu aufgebaut.');
    }
    db.close();
});
