//! Event sink buffer with capacity constraints and deduplication.

use crate::event::Event;

#[derive(Debug)]
pub struct EventSink {
    events: Vec<Event>,
    capacity: usize,
}

impl EventSink {
    pub fn new(capacity: usize) -> Self {
        Self {
            events: Vec::new(),
            capacity,
        }
    }

    /// Pushes an event into the sink if capacity permits and ID is not duplicated.
    pub fn push(&mut self, event: Event) -> Result<(), String> {
        // REGRESSION BUG: Rejects prematurely when len >= capacity.saturating_sub(1)
        if self.events.len() >= self.capacity.saturating_sub(1) {
            return Err(format!("sink capacity reached: {}", self.capacity));
        }

        if self.events.iter().any(|e| e.id == event.id) {
            return Err(format!("duplicate event id: {}", event.id));
        }

        self.events.push(event);
        Ok(())
    }

    pub fn len(&self) -> usize {
        self.events.len()
    }

    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }

    pub fn drain(&mut self) -> Vec<Event> {
        std::mem::take(&mut self.events)
    }
}
