use sensor_fusion_aggregator::{
    sensor::{ReadingKind, SensorReading},
    aggregator::TelemetryAggregator,
    fusion::KalmanFusionEngine,
};

#[test]
fn test_decode_telemetry_frame() {
    let frame = "101:TEMP:42.5:1700000000";
    let reading = SensorReading::decode_telemetry_frame(frame).expect("should parse valid frame");
    assert_eq!(reading.sensor_id, 101);
    assert_eq!(reading.kind, ReadingKind::Temperature);
    assert!((reading.value - 42.5).abs() < 1e-6);
    assert_eq!(reading.timestamp_ms, 1700000000);
}

#[test]
fn test_filter_anomalies() {
    let mut agg = TelemetryAggregator::new(50.0, Some(ReadingKind::Vibration));
    agg.record(SensorReading::new(1, ReadingKind::Vibration, 25.0, 100));
    agg.record(SensorReading::new(2, ReadingKind::Vibration, 75.0, 200));
    agg.record(SensorReading::new(3, ReadingKind::Temperature, 99.0, 300));
    agg.record(SensorReading::new(4, ReadingKind::Vibration, 55.0, 400));

    let anomalies = agg.filter_anomalies();
    assert_eq!(anomalies.len(), 2, "Expected 2 vibration readings over threshold 50.0");
    assert_eq!(anomalies[0].sensor_id, 2);
    assert_eq!(anomalies[1].sensor_id, 4);
}

#[test]
fn test_kalman_fusion_update() {
    let mut kalman = KalmanFusionEngine::new(10.0, 4.0);
    let updated = kalman.update(12.0, 4.0);
    assert!((updated - 11.0).abs() < 1e-6);
    assert!((kalman.estimation_variance - 2.0).abs() < 1e-6);
}
