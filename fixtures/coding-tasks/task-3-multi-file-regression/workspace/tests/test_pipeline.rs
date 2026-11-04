use task_event_pipeline::{EventParser, EventSink};

#[test]
fn test_parser_assigns_monotonic_sequences() {
    let mut parser = EventParser::new();
    let ev1 = parser.parse_line("2026-11-04T00:00:00Z|start").unwrap();
    let ev2 = parser.parse_line("2026-11-04T00:00:01Z|step").unwrap();
    let ev3 = parser.parse_line("2026-11-04T00:00:02Z|finish").unwrap();

    assert_eq!(ev1.sequence, 1);
    assert_eq!(ev2.sequence, 2);
    assert_eq!(ev3.sequence, 3);
}

#[test]
fn test_sink_validates_contiguous_sequences() {
    let mut parser = EventParser::new();
    let mut sink = EventSink::new();

    let lines = [
        "2026-11-04T00:00:00Z|alpha",
        "2026-11-04T00:00:01Z|beta",
        "2026-11-04T00:00:02Z|gamma",
    ];

    for line in lines {
        let ev = parser.parse_line(line).expect("valid line");
        sink.ingest(ev).expect("contiguous sequence accepted");
    }

    assert_eq!(sink.received.len(), 3);
    assert_eq!(sink.last_seq, 3);
}

#[test]
fn test_sink_rejects_discontinuous_sequences() {
    use task_event_pipeline::TelemetryEvent;
    let mut sink = EventSink::new();
    sink.ingest(TelemetryEvent::new(1, "2026".into(), "first".into())).unwrap();
    // Skipping sequence 2:
    let res = sink.ingest(TelemetryEvent::new(3, "2026".into(), "third".into()));
    assert!(res.is_err(), "Sink must reject non-contiguous sequence");
}
