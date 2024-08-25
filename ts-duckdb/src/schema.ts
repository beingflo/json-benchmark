import { Elysia, t } from "elysia";
import { Database } from "duckdb-async";

const db = await Database.create("./duck-schema.db");
const connection = await db.connect();

connection.run(`
  CREATE SEQUENCE IF NOT EXISTS seq_id START 1;
`);

connection.run(`
  CREATE TABLE IF NOT EXISTS co2 (
      id integer primary key default nextval('seq_id'), 
      timestamp TIMESTAMP NOT NULL,
      co2 INTEGER NOT NULL
  );
`);

connection.run(`
  CREATE TABLE IF NOT EXISTS location (
      id integer primary key default nextval('seq_id'), 
      timestamp TIMESTAMP NOT NULL,
      longitude DOUBLE NOT NULL,
      latitude DOUBLE NOT NULL
  );
`);

connection.run(`
  CREATE TABLE IF NOT EXISTS humidity (
      id integer primary key default nextval('seq_id'), 
      timestamp TIMESTAMP NOT NULL,
      humidity DOUBLE NOT NULL
  );
`);

connection.run(`
  CREATE TABLE IF NOT EXISTS brightness (
      id integer primary key default nextval('seq_id'), 
      timestamp TIMESTAMP NOT NULL,
      lux DOUBLE NOT NULL
  );
`);

console.log("Migrations done");

const app = new Elysia()
  .onError(({ code, error }) => {
    console.log(error.message);
    return code;
  })
  .get("/", async () => {
    const response = await connection.all("SELECT * FROM co2;");

    return response;
  })
  .get("/co2-high", async () => {
    const query = await connection.all(
      "SELECT count(*) as count FROM co2 WHERE co2 > 1990;"
    );

    return Number(query[0].count);
  })
  .get("/humidity-avg", async () => {
    const query = await connection.all(
      "SELECT strftime(timestamp, '%m') as timestamp, avg(humidity) as avg FROM humidity GROUP BY strftime(timestamp, '%m');"
    );
    return query;
  })
  .post("/delete", async () => {
    await connection.run("DELETE FROM co2");
    await connection.run("DELETE FROM location");
    await connection.run("DELETE FROM humidity");
    await connection.run("DELETE FROM brightness");
  })
  .post(
    "/",
    async ({ body }: { body: any }) => {
      if (body.type === "co2") {
        const stmt = await connection.prepare(
          "INSERT INTO co2 (timestamp, co2) VALUES (?, ?)"
        );

        await stmt.run(
          body.timestamp ?? new Date().toISOString(),
          body.data.co2
        );
        await stmt.finalize();
      }
      if (body.type === "humidity") {
        const stmt = await connection.prepare(
          "INSERT INTO humidity (timestamp, humidity) VALUES (?, ?)"
        );

        await stmt.run(
          body.timestamp ?? new Date().toISOString(),
          body.data.humidity
        );
        await stmt.finalize();
      }
      if (body.type === "brightness") {
        const stmt = await connection.prepare(
          "INSERT INTO brightness (timestamp, lux) VALUES (?, ?)"
        );

        await stmt.run(
          body.timestamp ?? new Date().toISOString(),
          body.data.lux
        );
        await stmt.finalize();
      }
      if (body.type === "location") {
        const stmt = await connection.prepare(
          "INSERT INTO location (timestamp, longitude, latitude) VALUES (?, ?, ?)"
        );

        await stmt.run(
          body.timestamp ?? new Date().toISOString(),
          body.data.longitude,
          body.data.latitude
        );
        await stmt.finalize();
      }

      return 200;
    },
    {
      body: t.Object({
        data: t.Any(),
        type: t.String(),
        timestamp: t.Optional(t.String({ format: "date-time" })),
      }),
    }
  )
  .listen(3000);

console.log(`Running at ${app.server?.hostname}:${app.server?.port}`);
