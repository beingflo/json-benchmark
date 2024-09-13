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
        .route("/", get(get_data))
        .route("/", post(upload_data))
        .route("/delete", post(delete_data))
        .route("/co2-avg", get(get_co2_avg))
        .route("/logs", get(get_error_logs))
        .route("/gps-coords", get(get_gps_coords))
        .with_state(conn);

    // run our app with hyper, listening globally on port 3000
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();

    Ok(())
}

#[derive(Debug, Serialize)]
struct EndpointCount {
    endpoint: String,
    count: i64,
}

async fn get_error_logs(
    State(conn): State<Arc<Mutex<Connection>>>,
) -> (StatusCode, Json<Vec<EndpointCount>>) {
    let conn = conn.lock().await;
    let mut stmt = conn
        .prepare("SELECT count(*), data ->> '$.endpoint' FROM metrics WHERE bucket = 'logs' AND data ->> '$.level' = 'error' AND timestamp > DATE('2024-01-01', '-90 day') GROUP BY data ->> '$.endpoint' ORDER BY count(*);")
        .unwrap();

    let response: Result<Vec<EndpointCount>, _> = stmt
        .query_map([], |row| {
            Ok(EndpointCount {
                count: row.get(0)?,
                endpoint: row.get(1)?,
            })
        })
        .unwrap()
        .collect();

    (StatusCode::OK, Json(response.unwrap()))
}

#[derive(Debug, Serialize)]
struct GPSResponse {
    longitude: f64,
    latitude: f64,
}

async fn get_gps_coords(
    State(conn): State<Arc<Mutex<Connection>>>,
) -> (StatusCode, Json<Vec<GPSResponse>>) {
    let conn = conn.lock().await;
    let mut stmt = conn
        .prepare("SELECT data ->> '$.longitude', data ->> '$.latitude' FROM metrics WHERE bucket = 'location' AND data ->> '$.longitude' > 6 AND data ->> '$.longitude' < 10 AND data ->> '$.latitude' > 45 AND data ->> '$.latitude' < 50;")
        .unwrap();

    let response: Result<Vec<GPSResponse>, _> = stmt
        .query_map([], |row| {
            Ok(GPSResponse {
                longitude: row.get(0)?,
                latitude: row.get(1)?,
            })
        })
        .unwrap()
        .collect();

    (StatusCode::OK, Json(response.unwrap()))
}
#[derive(Debug, Serialize)]
struct CO2Avg {
    timestamp: String,
    avg: f64,
}

async fn get_co2_avg(
    State(conn): State<Arc<Mutex<Connection>>>,
) -> (StatusCode, Json<Vec<CO2Avg>>) {
    let conn = conn.lock().await;
    let mut stmt = conn
        .prepare("SELECT strftime('%m', timestamp) as timestamp, avg(data -> '$.co2') as avg FROM metrics WHERE bucket = 'co2' GROUP BY strftime('%m', timestamp);")
        .unwrap();

    let response: Result<Vec<CO2Avg>, _> = stmt
        .query_map([], |row| {
            Ok(CO2Avg {
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
        .prepare("SELECT id, timestamp, data FROM metrics;")
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
        "INSERT INTO metrics (timestamp, bucket, data) VALUES (?1, ?2, ?3)",
        (
            payload.timestamp.unwrap_or(Utc::now().to_string()),
            payload.bucket,
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
    bucket: String,
    data: Value,
}
