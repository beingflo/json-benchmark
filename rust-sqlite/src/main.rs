use migration::apply_migrations;
use rusqlite::Connection;

mod migration;

pub fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut conn = Connection::open("./db.sqlite")?;

    conn.pragma_update_and_check(None, "journal_mode", &"WAL", |_| Ok(()))
        .unwrap();
    conn.pragma_update(None, "synchronous", &"NORMAL").unwrap();
    apply_migrations(&mut conn);

    Ok(())
}
