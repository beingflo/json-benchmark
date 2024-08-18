import { Elysia, t } from "elysia";
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
  .onError(({ code, error }) => {
    console.log(error);
    return new Response(error.toString());
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
      query.run({
        $timestamp: body.timestamp ?? new Date().toISOString(),
        $data: body.data,
      });

      return 200;
    },
    {
      body: t.Object({
        data: t.String(),
        timestamp: t.Optional(t.String({ format: "date-time" })),
      }),
    }
  )
  .listen(3000);

console.log(`Running at ${app.server?.hostname}:${app.server?.port}`);
