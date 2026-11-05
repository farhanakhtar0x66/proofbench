//! Decoy configuration file.
//! Not needed for outlier accumulator logic.

#[derive(Debug, Clone)]
pub struct PipelineConfig {
    pub stream_id: String,
    pub max_buffer_capacity: usize,
    pub enable_async_flush: bool,
    pub flush_interval_secs: u64,
}

impl Default for PipelineConfig {
    fn default() -> Self {
        Self {
            stream_id: "default-stream".to_string(),
            max_buffer_capacity: 1024,
            enable_async_flush: false,
            flush_interval_secs: 10,
        }
    }
}
