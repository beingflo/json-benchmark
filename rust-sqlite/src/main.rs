use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use migration::apply_migrations;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::Mutex;

mod migration;

#[tokio::main]
pub async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let conn = Arc::new(Mutex::new(Connection::open("./db.sqlite")?));

    conn.lock()
        .await
        .pragma_update_and_check(None, "journal_mode", &"WAL", |_| Ok(()))
        .unwrap();
    conn.lock()
        .await
        .pragma_update(None, "synchronous", &"NORMAL")
        .unwrap();

    {
        let mut c = conn.lock().await;
        apply_migrations(&mut c);
    }

    let app = Router::new()
        // `GET /`
        .route("/", get(get_data))
        // `POST /`
        .route("/", post(upload_data))
        // `POST /delete`
        .route("/delete", post(delete_data))
        // `GET /humidity-avg`
        .route("/humidity-avg", get(get_humidity_avg))
        .with_state(conn);

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
    State(conn): State<Arc<Mutex<Connection>>>,
) -> (StatusCode, Json<Vec<HumidityAvg>>) {
    let conn = conn.lock().await;
    let mut stmt = conn
        .prepare("SELECT timestamp, avg(data ->> '$.humidity') as avg FROM metrics WHERE data ->> '$.humidity' GROUP BY strftime('%m', timestamp);")
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

#[derive(Debug, Serialize)]
struct ResponseData {
    id: i64,
    timestamp: String,
    data: Value,
}

async fn get_data(
    State(conn): State<Arc<Mutex<Connection>>>,
) -> (StatusCode, Json<Vec<ResponseData>>) {
    let conn = conn.lock().await;
    let mut stmt = conn
        .prepare("SELECT id, timestamp, data FROM metrics")
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

async fn delete_data(State(conn): State<Arc<Mutex<Connection>>>) -> StatusCode {
    let conn = conn.lock().await;
    conn.execute("DELETE FROM metrics", ()).unwrap();

    StatusCode::OK
}

async fn upload_data(
    State(conn): State<Arc<Mutex<Connection>>>,
    Json(payload): Json<Data>,
) -> StatusCode {
    let conn = conn.lock().await;
    conn.execute(
        "INSERT INTO metrics (timestamp, data) VALUES (?1, ?2)",
        (
            payload.timestamp.unwrap_or(Utc::now().to_string()),
            payload.data,
        ),
    )
    .unwrap();

    StatusCode::OK
}

// the input to our `create_user` handler
#[derive(Deserialize)]
struct Data {
    timestamp: Option<String>,
    data: Value,
}
