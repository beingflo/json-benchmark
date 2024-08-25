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
db.run("PRAGMA synchronous = normal;");

const app = new Elysia()
  .onError(({ code, error }) => {
    console.log(error.message);
    return code;
  })
  .get("/", ({ query }) => {
    const qry = db.query("SELECT * FROM metrics;");
    const results = qry.all();

    return results;
  })
  .get("/co2-high", ({ query }) => {
    const qry = db.query(
      "SELECT count(*) as count FROM metrics WHERE data ->> '$.co2' > 1990;"
    );
    const results = qry.get() as { count: number };

    return results.count;
  })
  .get("/humidity-avg", ({ query }) => {
    const qry = db.query(
      "SELECT timestamp, avg(data ->> '$.humidity') as avg FROM metrics WHERE data ->> '$.humidity' GROUP BY strftime('%m', timestamp);"
    );
    const results = qry.all();

    return results;
  })
  .post("/delete", () => {
    const query = db.query("DELETE FROM metrics");
    query.run();
  })
  .post(
    "/",
    ({ body }) => {
      const query = db.query(
        "INSERT INTO metrics (timestamp, data) VALUES ($timestamp, $data)"
      );

      const result = query.run({
        $timestamp: body.timestamp ?? new Date().toISOString(),
        $data: JSON.stringify(body.data),
      });

      return 200;
    },
    {
      body: t.Object({
        data: t.Any(),
        timestamp: t.Optional(t.String({ format: "date-time" })),
      }),
    }
  )
  .listen(3000);

console.log(`Running at ${app.server?.hostname}:${app.server?.port}`);
