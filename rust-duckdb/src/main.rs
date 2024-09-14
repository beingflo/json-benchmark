use std::{sync::Arc, time::Duration};

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
use tokio::{runtime::Handle, sync::Mutex, task};

type StateType = (Arc<Mutex<Connection>>, Arc<Mutex<Vec<Data>>>);

#[tokio::main]
pub async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let conn = Arc::new(Mutex::new(Connection::open("./duck.db")?));
    let buffer = Arc::new(Mutex::new(Vec::new()));

    println!("Opened db");

    conn.lock()
        .await
        .execute_batch(r"CREATE SEQUENCE IF NOT EXISTS seq_id START 1;")?;

    println!("Created sequence");

    conn.lock().await.execute_batch(
        r"CREATE TABLE IF NOT EXISTS metrics (
            id integer primary key default nextval('seq_id'), 
            timestamp TIMESTAMP NOT NULL,
            bucket TEXT NOT NULL,
            data JSON NOT NULL
          );
        ",
    )?;

    println!("Created table");

    fn task(conn: Arc<Mutex<Connection>>, buffer: Arc<Mutex<Vec<Data>>>) {
        let mut interval = tokio::time::interval(Duration::from_millis(100));
        loop {
            let handle = Handle::current();
            handle.block_on(interval.tick());

            let mut buffer = handle.block_on(buffer.lock());

            println!("Buffer length: {}", buffer.len());

            if buffer.len() < 1 {
                continue;
            }

            let buffer_len = buffer.len();
            let mut buffer_local: Vec<Data> =
                buffer.drain(0..std::cmp::min(10000, buffer_len)).collect();
            // Free up lock
            drop(buffer);

            let conn = handle.block_on(conn.lock());
            conn.execute_batch("BEGIN TRANSACTION").unwrap();
            let mut stmt = conn
                .prepare("INSERT INTO metrics (timestamp, bucket, data) VALUES (?, ?, ?);")
                .unwrap();
            while let Some(p) = buffer_local.pop() {
                stmt.execute(params![
                    p.timestamp.unwrap_or(Utc::now().to_string()),
                    p.bucket,
                    p.data.to_string(),
                ])
                .unwrap();
            }
            conn.execute_batch("COMMIT").unwrap();
        }
    }

    let conn_clone = conn.clone();
    let buffer_clone = buffer.clone();
    task::spawn_blocking(move || task(conn_clone, buffer_clone));

    let app = Router::new()
        .route("/", get(get_data))
        .route("/", post(upload_data))
        .route("/delete", post(delete_data))
        .route("/co2-avg", get(get_co2_avg))
        .route("/logs", get(get_error_logs))
        .route("/gps-coords", get(get_gps_coords))
        .with_state((conn, buffer));

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
    State((conn, _)): State<StateType>,
) -> (StatusCode, Json<Vec<EndpointCount>>) {
    let conn = conn.lock().await;
    let mut stmt = conn
        .prepare("SELECT count(*), data ->> '$.endpoint' FROM metrics WHERE bucket = 'logs' AND cast(data ->> '$.level' as text) = 'error' AND timestamp > TIMESTAMP '2024-01-01 00:00:00' - INTERVAL 90 DAY GROUP BY data ->> '$.endpoint' ORDER BY count(*);")
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
struct CO2Avg {
    timestamp: String,
    avg: f64,
}

async fn get_co2_avg(State((conn, _)): State<StateType>) -> (StatusCode, Json<Vec<CO2Avg>>) {
    let conn = conn.lock().await;
    let mut stmt = conn
        .prepare("SELECT strftime(timestamp, '%m') as timestamp, avg(cast(data -> '$.co2' as int)) as avg FROM metrics WHERE bucket = 'co2' GROUP BY strftime(timestamp, '%m');")
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
struct GPSResponse {
    longitude: f64,
    latitude: f64,
}

async fn get_gps_coords(
    State((conn, _)): State<StateType>,
) -> (StatusCode, Json<Vec<GPSResponse>>) {
    let conn = conn.lock().await;
    let mut stmt = conn
        .prepare("SELECT cast(data -> '$.longitude' as float), cast(data -> '$.latitude' as float) FROM metrics WHERE bucket = 'location' AND cast(data -> '$.longitude' as float) > 6 AND cast(data -> '$.longitude' as float) < 10 AND cast(data -> '$.latitude' as float) > 45 AND cast(data -> '$.latitude' as float) < 50;")
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
struct ResponseData {
    id: i64,
    timestamp: i64,
    bucket: String,
    data: String,
}

async fn get_data(State((conn, _)): State<StateType>) -> (StatusCode, Json<Vec<ResponseData>>) {
    let conn = conn.lock().await;
    let mut stmt = conn
        .prepare("SELECT id, timestamp, bucket, data FROM metrics ORDER BY id DESC LIMIT 10;")
        .unwrap();

    let response: Result<Vec<ResponseData>, _> = stmt
        .query_map([], |row| {
            Ok(ResponseData {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                bucket: row.get(2)?,
                data: row.get(3)?,
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
    State((_, buffer)): State<StateType>,
    Json(payload): Json<Data>,
) -> StatusCode {
    let mut buffer = buffer.lock().await;

    buffer.push(payload);

    StatusCode::OK
}

// the input to our `create_user` handler
#[derive(Deserialize, Clone)]
struct Data {
    timestamp: Option<String>,
    bucket: String,
    data: Value,
}
