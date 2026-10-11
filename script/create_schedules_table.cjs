const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_xtTurX3H1RKf@ep-ancient-mode-anfhme7z-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

async function run() {
  await client.connect();
  console.log('Connected to DB');

  await client.query(`
    CREATE TABLE IF NOT EXISTS schedule_categories (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      is_default BOOLEAN DEFAULT FALSE
    );
  `);
  console.log('Created schedule_categories table');

  await client.query(`
    CREATE TABLE IF NOT EXISTS schedules (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      month TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      type TEXT NOT NULL,
      description TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  console.log('Created schedules table');

  const defaultCats = [
    'Room Cleaning',
    'Vessel Cleaning',
    'Grocery',
    'Bill Payment',
    'Maintenance',
    'Other'
  ];

  for (const name of defaultCats) {
    await client.query(
      `INSERT INTO schedule_categories (name, is_default)
       VALUES ($1, TRUE)
       ON CONFLICT (name) DO NOTHING`,
      [name]
    );
  }
  console.log('Seeded default schedule categories');

  await client.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
