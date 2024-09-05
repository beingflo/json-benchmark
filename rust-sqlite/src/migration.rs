use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};

pub fn apply_migrations(connection: &mut Connection) {
    let migrations = Migrations::new(vec![
        M::up(
            "CREATE TABLE IF NOT EXISTS metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            timestamp TEXT NOT NULL,
            data TEXT NOT NULL
        );",
        ),
        M::up("CREATE INDEX IF NOT EXISTS timestamp_index on metrics(timestamp);"),
    ]);

    migrations.to_latest(connection).unwrap();
}
