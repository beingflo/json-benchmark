import { Elysia } from "elysia";
import { Database } from "bun:sqlite";

const db = new Database("./db.sqlite");
db.run(`
  CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      timestamp TEXT NOT NULL,
      data TEXT NOT NULL
  );
`);

db.run("PRAGMA journal_mode = WAL;");

const app = new Elysia()
  .get("/", () => {
    const query = db.query("SELECT * FROM metrics;");
    const results = query.all();

    return results;
  })
  .post("/", () => {
    const query = db.query(
      "INSERT INTO metrics (timestamp, data) VALUES ($timestamp, $data)"
    );
    const results = query.run({
      $timestamp: new Date().toISOString(),
      $data: `{ "test": 123 }`,
    });

    return results;
  })
  .listen(3000);

console.log(`Running at ${app.server?.hostname}:${app.server?.port}`);
