#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TelemetryEvent {
    pub sequence: u64,
    pub timestamp: String,
    pub payload: String,
}

impl TelemetryEvent {
    pub fn new(sequence: u64, timestamp: String, payload: String) -> Self {
        Self {
            sequence,
            timestamp,
            payload,
        }
    }
}
