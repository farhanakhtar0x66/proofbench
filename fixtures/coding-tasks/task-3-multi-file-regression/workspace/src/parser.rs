use crate::event::TelemetryEvent;

pub struct EventParser {
    pub next_seq: u64,
}

impl EventParser {
    pub fn new() -> Self {
        Self { next_seq: 1 }
    }

    /// Parses raw lines in the format: "<timestamp>|<payload>"
    /// Assigns sequential 1-based sequence numbers to each event.
    pub fn parse_line(&mut self, line: &str) -> Option<TelemetryEvent> {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return None;
        }
        let (ts, payload) = trimmed.split_once('|')?;
        // REGRESSION: Hardcoding sequence: 0 instead of self.next_seq, and not incrementing self.next_seq
        let event = TelemetryEvent::new(0, ts.to_string(), payload.to_string());
        Some(event)
    }
}
