use crate::event::{Event, EventType};

#[derive(Debug, Clone)]
pub struct EventFilter {
    pub min_severity: u8,
    pub allowed_types: Vec<EventType>,
}

impl EventFilter {
    pub fn new(min_severity: u8, allowed_types: Vec<EventType>) -> Self {
        Self {
            min_severity,
            allowed_types,
        }
    }

    pub fn evaluate_predicate(&self, _event: &Event) -> bool {
        // Stub for bounded Small LLM follow-up
        false
    }
}
