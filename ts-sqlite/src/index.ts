import { Elysia, t } from "elysia";
import { Database } from "bun:sqlite";
import { populate } from "./populate";

const db = new Database("./db.sqlite");
db.run(`
  CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      timestamp TEXT NOT NULL,
      data TEXT NOT NULL
  );
`);

db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA synchronous = normal;");

//populate();

const app = new Elysia()
  .onError(({ code, error }) => {
    console.log(error.message);
    return code;
  })
  .get("/", () => {
    const query = db.query("SELECT * FROM metrics;");
    const results = query.all();

    return results;
  })
  .post(
    "/",
    ({ body }) => {
      const query = db.query(
        "INSERT INTO metrics (timestamp, data) VALUES ($timestamp, $data)"
      );

      body.forEach((b) => {
        const result = query.run({
          $timestamp: b.timestamp ?? new Date().toISOString(),
          $data: JSON.stringify(b.data),
        });
      });

      return 200;
    },
    {
      body: t.Array(
        t.Object({
          data: t.Any(),
          timestamp: t.Optional(t.String({ format: "date-time" })),
        })
      ),
    }
  )
  .listen(3000);

console.log(`Running at ${app.server?.hostname}:${app.server?.port}`);
