pub mod event;
pub mod parser;
pub mod sink;

use event::Event;
use parser::parse_event;
use sink::EventSink;

/// Processes an iterator of event lines into an EventSink.
pub fn process_event_stream(lines: &[&str], capacity: usize) -> Result<Vec<Event>, String> {
    let mut sink = EventSink::new(capacity);
    for line in lines {
        let event = parse_event(line)?;
        sink.push(event)?;
    }
    Ok(sink.drain())
}
