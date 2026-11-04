use crate::event::TelemetryEvent;

pub struct EventParser {
    pub next_seq: u64,
}

impl EventParser {
    pub fn new() -> Self {
        Self { next_seq: 1 }
    }

    pub fn parse_line(&mut self, line: &str) -> Option<TelemetryEvent> {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return None;
        }
        let (ts, payload) = trimmed.split_once('|')?;
        let seq = self.next_seq;
        self.next_seq += 1;
        let event = TelemetryEvent::new(seq, ts.to_string(), payload.to_string());
        Some(event)
    }
}
