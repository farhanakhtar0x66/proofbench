use crate::buffer::ChunkBuffer;

pub trait Stage<T> {
    fn transform(&self, input: &T) -> Result<Vec<u8>, String>;
}

pub struct StreamingPipeline<'a, T, S: Stage<T>> {
    stage: &'a S,
    buffer: ChunkBuffer,
    _marker: std::marker::PhantomData<T>,
}

impl<'a, T, S: Stage<T>> StreamingPipeline<'a, T, S> {
    pub fn new(stage: &'a S, capacity: usize) -> Self {
        Self {
            stage,
            buffer: ChunkBuffer::new(capacity),
            _marker: std::marker::PhantomData,
        }
    }

    pub fn process_item(&mut self, item: &T) -> Result<(), String> {
        let bytes = self.stage.transform(item)?;
        self.buffer.push(&bytes)?;
        Ok(())
    }

    pub fn buffer_mut(&mut self) -> &mut ChunkBuffer {
        &mut self.buffer
    }
}
