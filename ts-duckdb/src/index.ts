import { Elysia, t } from "elysia";
import { Database } from "duckdb-async";

const db = await Database.create("./duck.db");
const connection = await db.connect();

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
console.log("Migrations done");

const app = new Elysia()
  .onError(({ code, error }) => {
    console.log(error.message);
    return code;
  })
  .get("/", async () => {
    const response = await connection.all("SELECT * FROM metrics;");

    return response;
  })
  .get("/co2-high", async () => {
    const query = await connection.all(
      "SELECT count(*) as count FROM metrics WHERE (data -> '$.co2') AND CAST(data ->> '$.co2' as int) > 1990;"
    );

    return Number(query[0].count);
  })
  .get("/humidity-avg", async () => {
    const query = await connection.all(
      "SELECT timestamp, avg(data ->> '$.humidity') as avg FROM metrics WHERE data ->> '$.humidity' GROUP BY strftime('%d', timestamp);"
    );
    return query;
  })
  .post("/delete", async () => {
    await connection.run("DELETE FROM metrics");
  })
  .post(
    "/",
    async ({ body }) => {
      const stmt = await connection.prepare(
        "INSERT INTO metrics (timestamp, data) VALUES (?, ?)"
      );
      console.log("query prepared created");

      body.forEach(async (b) => {
        await stmt.run(
          b.timestamp ?? new Date().toISOString(),
          JSON.stringify(b.data)
        );
        console.log("query ran");
      });
      console.log("query finalizing ...");
      await stmt.finalize();
      console.log("query finalized");

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
