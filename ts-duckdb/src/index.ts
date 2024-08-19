import { Elysia, t } from "elysia";
import duckdb from "duckdb";

const db = new duckdb.Database("./duck.db");
const connection = db.connect();

connection.run(`
  CREATE SEQUENCE IF NOT EXISTS seq_id START 1;
`);

connection.run(`
  CREATE TABLE IF NOT EXISTS metrics (
      id integer primary key default nextval('seq_id'), 
      timestamp TIME NOT NULL,
      data JSON NOT NULL
  );
`);

const app = new Elysia()
  .onError(({ code, error }) => {
    console.log(error.message);
    return code;
  })
  .get("/", () => {
    const query = connection.all("SELECT * FROM metrics;", (err, res) =>
      console.log(res)
    );

    return 200;
  })
  .get("/co2-high", () => {
    const query = connection.all(
      "SELECT count(*) as count FROM metrics WHERE data ->> '$.co2' > 1990;"
    );
    console.log(query);

    return 200;
  })
  .get("/humidity-avg", () => {
    const query = connection.all(
      "SELECT timestamp, avg(data ->> '$.humidity') as avg FROM metrics WHERE data ->> '$.humidity' GROUP BY strftime('%d', timestamp);"
    );
    console.log(query);
    return 200;
  })
  .post("/delete", () => {
    const query = connection.run("DELETE FROM metrics");
    console.log(query);
  })
  .post(
    "/",
    ({ body }) => {
      const stmt = connection.prepare(
        "INSERT INTO metrics (timestamp, data) VALUES (?, ?)"
      );

      body.forEach((b) => {
        stmt.run(
          b.timestamp ?? new Date().toISOString(),
          JSON.stringify(b.data)
        );
      });
      stmt.finalize();

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
