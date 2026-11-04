use crate::event::TelemetryEvent;

#[derive(Debug, Default)]
pub struct EventSink {
    pub received: Vec<TelemetryEvent>,
    pub last_seq: u64,
}

impl EventSink {
    pub fn new() -> Self {
        Self {
            received: Vec::new(),
            last_seq: 0,
        }
    }

    /// Ingests a telemetry event. Verifies that the sequence number is strictly
    /// monotonic and contiguous: event.sequence == self.last_seq + 1.
    /// Returns Err if the sequence check fails.
    pub fn ingest(&mut self, event: TelemetryEvent) -> Result<(), String> {
        // REGRESSION: Incorrect continuity check and fails to update last_seq
        if event.sequence == 0 {
            return Err("Zero sequence invalid".into());
        }
        if event.sequence < self.last_seq {
            return Err(format!("Out of order sequence {}", event.sequence));
        }
        self.received.push(event);
        // Missing: self.last_seq = event.sequence;
        Ok(())
    }
}
