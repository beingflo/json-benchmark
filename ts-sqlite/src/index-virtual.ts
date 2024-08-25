import { Elysia, t } from "elysia";
import { Database } from "bun:sqlite";

const db = new Database("./db-virtual.sqlite");
db.run(`
  CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      timestamp TEXT NOT NULL,
      data TEXT NOT NULL
  );
`);

try {
  db.run(`
  ALTER TABLE metrics 
  ADD COLUMN co2 INTEGER 
  AS (json_extract(data, '$.co2'));
`);
} catch (e) {
  console.log("co2 column already exists");
}

try {
  db.run(`
  ALTER TABLE metrics 
  ADD COLUMN humidity REAL
  AS (json_extract(data, '$.humidity'));
`);
} catch (e) {
  console.log("humidity column already exists");
}

try {
  db.run(`
  ALTER TABLE metrics 
  ADD COLUMN month TEXT 
  AS (strftime('%m', timestamp));
`);
} catch (e) {
  console.log("month column already exists");
}

db.run(`CREATE INDEX IF NOT EXISTS timestamp_index on metrics(timestamp);`);
db.run(`CREATE INDEX IF NOT EXISTS co2_index on metrics(co2);`);
db.run(`CREATE INDEX IF NOT EXISTS humidity_index on metrics(humidity);`);

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
    // const qry = db.query(
    //   "SELECT count(*) as count FROM metrics WHERE data ->> '$.co2' > 1990;"
    // );
    const qry = db.query(
      "SELECT count(*) as count FROM metrics WHERE co2 > 1990;"
    );
    const results = qry.get() as { count: number };

    return results.count;
  })
  .get("/humidity-avg", ({ query }) => {
    //const qry = db.query(
    //  "SELECT timestamp, avg(data ->> '$.humidity') as avg FROM metrics WHERE data ->> '$.humidity' GROUP BY strftime('%m', timestamp);"
    //);
    const qry = db.query(
      "SELECT month, humidity as avg FROM metrics WHERE humidity group by month;"
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
