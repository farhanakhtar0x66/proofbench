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

    pub fn ingest(&mut self, event: TelemetryEvent) -> Result<(), String> {
        if event.sequence != self.last_seq + 1 {
            return Err(format!(
                "Sequence discontinuity: expected {}, got {}",
                self.last_seq + 1,
                event.sequence
            ));
        }
        self.last_seq = event.sequence;
        self.received.push(event);
        Ok(())
    }
}
