use event_service::{Event, EventType, EventFilter, EventDispatcher};
use event_service::dispatcher::EventHandler;

struct MockHandler {
    received: Vec<String>,
}

impl EventHandler for MockHandler {
    fn handle(&mut self, event: &Event) {
        self.received.push(event.payload.clone());
    }
}

#[test]
fn test_event_parsing() {
    let line = "101,Alert,3,database connection dropped";
    let event = Event::parse_csv_line(line).expect("Should parse valid line");
    assert_eq!(event.id, 101);
    assert_eq!(event.event_type, EventType::Alert);
    assert_eq!(event.severity, 3);
    assert_eq!(event.payload, "database connection dropped");
}

#[test]
fn test_filter_predicate() {
    let filter = EventFilter::new(2, vec![EventType::Metric, EventType::Alert]);
    let e1 = Event::new(1, EventType::Alert, 3, "high alert");
    let e2 = Event::new(2, EventType::Alert, 1, "low alert");
    let e3 = Event::new(3, EventType::Audit, 5, "audit log");

    assert!(filter.evaluate_predicate(&e1));
    assert!(!filter.evaluate_predicate(&e2)); // severity < 2
    assert!(!filter.evaluate_predicate(&e3)); // audit not in allowed_types
}

#[test]
fn test_dispatcher_dispatch() {
    let mut dispatcher = EventDispatcher::new();
    let handler = MockHandler { received: Vec::new() };
    dispatcher.register_handler(Box::new(handler));

    let event = Event::new(1, EventType::Metric, 1, "cpu=95");
    let dispatched = dispatcher.dispatch(&event);
    assert!(dispatched);
    assert_eq!(dispatcher.dispatched_count(), 1);
}

#[test]
fn test_end_to_end_service() {
    let filter = EventFilter::new(2, vec![EventType::Alert]);
    let mut dispatcher = EventDispatcher::new().with_filter(&filter);

    let handler = MockHandler { received: Vec::new() };
    dispatcher.register_handler(Box::new(handler));

    let e1 = Event::parse_csv_line("201,Alert,4,server overheated").unwrap();
    let e2 = Event::parse_csv_line("202,Alert,1,minor warning").unwrap();

    assert!(dispatcher.dispatch(&e1));
    assert!(!dispatcher.dispatch(&e2)); // Filtered out
    assert_eq!(dispatcher.dispatched_count(), 1);
}
