use task_7_adaptive_pipeline::{ChunkBuffer, MemorySink, Stage, StreamingPipeline};

struct UpperCaseStage;

impl Stage<String> for UpperCaseStage {
    fn transform(&self, input: &String) -> Result<Vec<u8>, String> {
        Ok(input.to_uppercase().into_bytes())
    }
}

#[test]
fn test_buffer_capacity_invariant() {
    let mut buf = ChunkBuffer::new(8);
    assert!(buf.push(b"1234").is_ok());
    assert!(buf.push(b"5678").is_ok());
    assert_eq!(buf.len(), 8);
    // Exceeding capacity must return an error
    let overflow = buf.push(b"9");
    assert!(overflow.is_err(), "Buffer should enforce strict capacity limit");
}

#[test]
fn test_streaming_pipeline_execution() {
    let stage = UpperCaseStage;
    let mut pipeline = StreamingPipeline::new(&stage, 32);

    assert!(pipeline.process_item(&"hello".to_string()).is_ok());
    assert!(pipeline.process_item(&"world".to_string()).is_ok());

    let mut sink = MemorySink::new();
    let flushed_bytes = sink.flush_buffer(pipeline.buffer_mut());

    assert_eq!(flushed_bytes, 10);
    assert_eq!(sink.record_count(), 1);
    assert_eq!(sink.get_record(0), Some(b"HELLOWORLD".as_slice()));
    assert_eq!(pipeline.buffer_mut().len(), 0);
}
