use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use clickhouse::Client;
use clickhouse::Row;
use opentelemetry::{global, trace::TracerProvider};
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::trace::SdkTracerProvider;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::{error, info, span, Span};
use tracing_opentelemetry::OpenTelemetryLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, Layer};

#[tokio::main]
pub async fn main() -> Result<(), Box<dyn std::error::Error>> {
    std::env::set_var("OTEL_SERVICE_NAME", "json-benchmark");
    std::env::set_var("OTEL_BSP_MAX_QUEUE_SIZE", "1000000");
    std::env::set_var("OTEL_BSP_MAX_EXPORT_BATCH_SIZE", "10000");

    let tracer = opentelemetry_otlp::SpanExporter::builder()
        .with_http()
        .with_endpoint("http://localhost:4318/v1/traces")
        .build()?;

    let provider = SdkTracerProvider::builder()
        .with_batch_exporter(tracer)
        .build();

    global::set_tracer_provider(provider.clone());

    // Set up tracing with both console output and OpenTelemetry
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::fmt::layer()
                .with_filter(tracing_subscriber::filter::LevelFilter::INFO),
        )
        .with(
            OpenTelemetryLayer::new(provider.tracer("reflective-service"))
                .with_filter(tracing_subscriber::filter::LevelFilter::INFO),
        )
        .init();

    let client = Client::default()
        // should include both protocol and port
        .with_url("http://localhost:18123")
        .with_user("default")
        .with_database("events")
        .with_password("default");

    let app = Router::new()
        .route("/", post(upload_data))
        .route("/co2-avg", get(get_co2_avg))
        .route("/logs", get(get_error_logs))
        .route("/gps-coords", get(get_gps_coords))
        .with_state(client);

    // run our app with hyper, listening globally on port 3000
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3006").await.unwrap();
    axum::serve(listener, app).await.unwrap();

    Ok(())
}

#[derive(Debug, Serialize, Row, Deserialize)]
struct EndpointCount {
    count: u64,
    endpoint: String,
}

async fn get_error_logs(State(conn): State<Client>) -> (StatusCode, Json<Vec<EndpointCount>>) {
    let mut cursor = conn
        .query(
            "SELECT 
    count(*) AS count,
    JSONExtractString(SpanAttributes['payload'], 'endpoint') AS endpoint
FROM otel_traces 
WHERE SpanAttributes['bucket'] = 'logs'
    AND JSONExtractString(SpanAttributes['payload'], 'level') = 'error'
    AND parseDateTimeBestEffort(SpanAttributes['timestamp']) > toDate('2023-07-01') - INTERVAL 90 DAY
GROUP BY JSONExtractString(SpanAttributes['payload'], 'endpoint')
ORDER BY count(*) DESC",
        )
        .fetch::<EndpointCount>()
        .unwrap();

    let mut results = Vec::new();
    while let Some(row) = cursor.next().await.unwrap() {
        results.push(row);
    }

    (StatusCode::OK, Json(results))
}

#[derive(Debug, Serialize, Row, Deserialize)]
struct GPSResponse {
    longitude: String,
    latitude: String,
}

async fn get_gps_coords(State(conn): State<Client>) -> (StatusCode, Json<Vec<GPSResponse>>) {
    let mut cursor = conn
        .query(
            "SELECT 
    JSONExtractString(SpanAttributes['payload'], 'longitude') AS longitude,
    JSONExtractString(SpanAttributes['payload'], 'latitude') AS latitude
FROM otel_traces 
WHERE SpanAttributes['bucket'] = 'location'
    AND toFloat64(JSONExtractString(SpanAttributes['payload'], 'longitude')) > 6
    AND toFloat64(JSONExtractString(SpanAttributes['payload'], 'longitude')) < 10
    AND toFloat64(JSONExtractString(SpanAttributes['payload'], 'latitude')) > 45
    AND toFloat64(JSONExtractString(SpanAttributes['payload'], 'latitude')) < 50",
        )
        .fetch::<GPSResponse>()
        .unwrap();

    let mut results = Vec::new();
    while let Some(row) = cursor.next().await.unwrap() {
        results.push(row);
    }

    (StatusCode::OK, Json(results))
}

#[derive(Debug, Serialize, Deserialize, Row)]
struct CO2Avg {
    timestamp: u8,
    avg: f64,
}

async fn get_co2_avg(State(conn): State<Client>) -> (StatusCode, Json<Vec<CO2Avg>>) {
    let mut cursor = conn
        .query(
            "SELECT 
    toMonth(parseDateTimeBestEffort(SpanAttributes['timestamp'])) AS timestamp,
    avg(toFloat64(JSONExtractString(SpanAttributes['payload'], 'co2'))) AS avg
FROM otel_traces 
WHERE SpanAttributes['bucket'] = 'co2'
GROUP BY toMonth(parseDateTimeBestEffort(SpanAttributes['timestamp']))",
        )
        .fetch::<CO2Avg>()
        .unwrap();

    let mut results = Vec::new();
    while let Some(row) = cursor.next().await.unwrap() {
        results.push(row);
    }

    (StatusCode::OK, Json(results))
}

async fn upload_data(Json(payload): Json<Data>) -> StatusCode {
    let span = span!(
        tracing::Level::INFO,
        "json-benchmark",
        timestamp = payload.timestamp,
        bucket = payload.bucket,
        payload = serde_json::to_string(&payload.data).unwrap_or_default()
    );
    let _enter = span.enter();

    StatusCode::OK
}

#[derive(Deserialize)]
struct Data {
    timestamp: Option<String>,
    bucket: String,
    data: Value,
}
