import { Elysia, t } from "elysia";
import { Database } from "bun:sqlite";

const db = new Database("./db-schema.sqlite");

db.run(`
  CREATE TABLE IF NOT EXISTS co2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      timestamp TEXT NOT NULL,
      co2 INTEGER NOT NULL
  );
`);

db.run(`
  CREATE INDEX IF NOT EXISTS co2_val ON co2(co2);
`);

db.run(`
  CREATE TABLE IF NOT EXISTS location (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      timestamp TEXT NOT NULL,
      longitude REAL NOT NULL,
      latitude REAL NOT NULL
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS humidity (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      timestamp TEXT NOT NULL,
      humidity REAL NOT NULL
  );
`);

db.run(`
  CREATE INDEX IF NOT EXISTS humidity_month ON humidity(strftime('%m', timestamp));
`);

db.run(`
  CREATE TABLE IF NOT EXISTS brightness (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      timestamp TEXT NOT NULL,
      lux REAL NOT NULL
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
    const qry = db.query("SELECT * FROM co2;");
    const results = qry.all();

    return results;
  })
  .get("/co2-high", ({ query }) => {
    const qry = db.query("SELECT count(*) as count FROM co2 WHERE co2 > 1990;");
    const results = qry.get() as { count: number };

    return results.count;
  })
  .get("/humidity-avg", ({ query }) => {
    const qry = db.query(
      "SELECT timestamp, avg(humidity) as avg FROM humidity GROUP BY strftime('%m', timestamp);"
    );
    const results = qry.all();

    return results;
  })
  .post("/delete", () => {
    db.run("DELETE FROM co2");
    db.run("DELETE FROM brightness");
    db.run("DELETE FROM humidity");
    db.run("DELETE FROM location");
  })
  .post("/", ({ body }: { body: any }) => {
    if (body.type === "co2") {
      const query = db.query(
        "INSERT INTO co2 (timestamp, co2) VALUES ($timestamp, $co2)"
      );

      const result = query.run({
        $timestamp: body.timestamp ?? new Date().toISOString(),
        $co2: body.data.co2,
      });
    }
    if (body.type === "humidity") {
      const query = db.query(
        "INSERT INTO humidity (timestamp, humidity) VALUES ($timestamp, $humidity)"
      );

      const result = query.run({
        $timestamp: body.timestamp ?? new Date().toISOString(),
        $humidity: body.data.humidity,
      });
    }
    if (body.type === "brightness") {
      const query = db.query(
        "INSERT INTO brightness (timestamp, lux) VALUES ($timestamp, $lux)"
      );

      const result = query.run({
        $timestamp: body.timestamp ?? new Date().toISOString(),
        $lux: body.data.lux,
      });
    }
    if (body.type === "location") {
      const query = db.query(
        "INSERT INTO location (timestamp, longitude, latitude) VALUES ($timestamp, $longitude, $latitude)"
      );

      const result = query.run({
        $timestamp: body.timestamp ?? new Date().toISOString(),
        $longitude: body.data.longitude,
        $latitude: body.data.latitude,
      });
    }

    return 200;
  })
  .listen(3000);

console.log(`Running at ${app.server?.hostname}:${app.server?.port}`);
