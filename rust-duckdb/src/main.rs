use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use duckdb::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::Mutex;

type StateType = (Arc<Mutex<Connection>>, Arc<Mutex<Vec<Data>>>);

#[tokio::main]
pub async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let conn = Arc::new(Mutex::new(Connection::open("./duck.db")?));
    let buffer = Arc::new(Mutex::new(Vec::<Data>::new()));

    conn.lock().await.execute_batch(
        r"CREATE SEQUENCE IF NOT EXISTS seq_id START 1;
          CREATE TABLE IF NOT EXISTS metrics (
            id integer primary key default nextval('seq_id'), 
            timestamp TIMESTAMP NOT NULL,
            bucket TEXT NOT NULL,
            data JSON NOT NULL
        );
    ",
    )?;

    println!("Migrations done");

    let app = Router::new()
        // `GET /`
        .route("/", get(get_data))
        // `POST /`
        .route("/", post(upload_data))
        // `POST /delete`
        .route("/delete", post(delete_data))
        // `GET /humidity-avg`
        .route("/humidity-avg", get(get_humidity_avg))
        .with_state((conn, buffer));

    // run our app with hyper, listening globally on port 3000
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();

    Ok(())
}

#[derive(Debug, Serialize)]
struct HumidityAvg {
    timestamp: String,
    avg: f64,
}

async fn get_humidity_avg(
    State((conn, _)): State<StateType>,
) -> (StatusCode, Json<Vec<HumidityAvg>>) {
    let conn = conn.lock().await;
    let mut stmt = conn
        .prepare("SELECT strftime(timestamp, '%m') as timestamp, avg(cast(data -> '$.humidity' as float)) as avg FROM metrics WHERE bucket = 'humidity' GROUP BY strftime(timestamp, '%m');")
        .unwrap();

    let response: Result<Vec<HumidityAvg>, _> = stmt
        .query_map([], |row| {
            Ok(HumidityAvg {
                timestamp: row.get(0)?,
                avg: row.get(1)?,
            })
        })
        .unwrap()
        .collect();

    (StatusCode::OK, Json(response.unwrap()))
}

#[derive(Debug, Deserialize, Serialize)]
struct Humidity {
    data: String,
    timestamp: i64,
}

#[derive(Debug, Serialize)]
struct ResponseData {
    id: i64,
    timestamp: i64,
    data: String,
}

async fn get_data(State((conn, _)): State<StateType>) -> (StatusCode, Json<Vec<ResponseData>>) {
    let conn = conn.lock().await;
    let mut stmt = conn
        .prepare("SELECT id, timestamp, data FROM metrics ORDER BY id DESC LIMIT 10;")
        .unwrap();

    let response: Result<Vec<ResponseData>, _> = stmt
        .query_map([], |row| {
            Ok(ResponseData {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                data: row.get(2)?,
            })
        })
        .unwrap()
        .collect();

    (StatusCode::OK, Json(response.unwrap()))
}

async fn delete_data(State((conn, _)): State<StateType>) -> StatusCode {
    let conn = conn.lock().await;
    conn.execute("DELETE FROM metrics", []).unwrap();

    StatusCode::OK
}

async fn upload_data(
    State((conn, buffer)): State<StateType>,
    Json(payload): Json<Data>,
) -> StatusCode {
    let mut buffer = buffer.lock().await;

    if buffer.len() < 10000 {
        buffer.push(payload);
    } else {
        println!("Flushing buffer");
        let conn = conn.lock().await;
        let mut stmt = conn
            .prepare("INSERT INTO metrics (timestamp, bucket, data) VALUES (?, ?, ?);")
            .unwrap();
        while let Some(p) = buffer.pop() {
            conn.execute("BEGIN TRANSACTION", []).unwrap();
            stmt.execute(params![
                p.timestamp.unwrap_or(Utc::now().to_string()),
                p.bucket,
                p.data.to_string(),
            ])
            .unwrap();
            conn.execute("COMMIT", []).unwrap();
        }
    }

    StatusCode::OK
}

// the input to our `create_user` handler
#[derive(Deserialize)]
struct Data {
    timestamp: Option<String>,
    bucket: String,
    data: Value,
}
