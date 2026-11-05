use task_pipeline::event::{calculate_checksum, Event};
use task_pipeline::parser::parse_event;
use task_pipeline::process_event_stream;
use task_pipeline::sink::EventSink;

#[test]
fn test_parse_valid_event() {
    let payload = "hello world";
    let checksum = calculate_checksum(payload);
    let line = format!("evt-1|{}|{}", payload, checksum);

    let event = parse_event(&line).expect("should parse valid event");
    assert_eq!(event.id, "evt-1");
    assert_eq!(event.payload, "hello world");
    assert_eq!(event.checksum, checksum);
}

#[test]
fn test_parse_invalid_checksum() {
    let line = "evt-2|payload|999999";
    let result = parse_event(line);
    assert!(result.is_err());
}

#[test]
fn test_sink_capacity_boundary() {
    let mut sink = EventSink::new(2);
    let e1 = Event::new("1", "a", 1);
    let e2 = Event::new("2", "b", 2);
    let e3 = Event::new("3", "c", 3);

    assert!(sink.push(e1).is_ok());
    // In buggy sink, capacity 2 is rejected at item 1 because len(1) >= 2 - 1 = 1
    assert!(sink.push(e2).is_ok(), "Sink with capacity 2 should accept 2 items");
    assert!(sink.push(e3).is_err(), "Sink with capacity 2 should reject 3rd item");
}

#[test]
fn test_sink_duplicate_id() {
    let mut sink = EventSink::new(5);
    let e1 = Event::new("same-id", "first", 1);
    let e2 = Event::new("same-id", "second", 2);

    assert!(sink.push(e1).is_ok());
    assert!(sink.push(e2).is_err());
}

#[test]
fn test_end_to_end_pipeline() {
    let p1 = "alpha";
    let p2 = "beta";
    let line1 = format!("id-1|{}|{}", p1, calculate_checksum(p1));
    let line2 = format!("id-2|{}|{}", p2, calculate_checksum(p2));

    let events = process_event_stream(&[&line1, &line2], 2).expect("pipeline should succeed");
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].id, "id-1");
    assert_eq!(events[1].id, "id-2");
}
