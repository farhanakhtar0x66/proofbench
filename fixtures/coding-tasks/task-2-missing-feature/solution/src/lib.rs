//! Exponential backoff calculation module.

#[derive(Debug, Clone, PartialEq)]
pub struct ExponentialBackoff {
    pub initial_delay_ms: u64,
    pub max_delay_ms: u64,
    pub factor: f64,
    pub max_retries: usize,
}

impl ExponentialBackoff {
    pub fn new(initial_delay_ms: u64, max_delay_ms: u64, factor: f64, max_retries: usize) -> Self {
        Self {
            initial_delay_ms,
            max_delay_ms,
            factor,
            max_retries,
        }
    }

    /// Computes delay in milliseconds for a given 0-indexed retry attempt.
    /// - If attempt == 0: returns 0.
    /// - If attempt > max_retries: returns max_delay_ms.
    /// - Otherwise: initial_delay_ms * (factor ^ (attempt - 1)), capped at max_delay_ms.
    pub fn delay_for_attempt(&self, attempt: usize) -> u64 {
        if attempt == 0 {
            return 0;
        }
        if attempt > self.max_retries {
            return self.max_delay_ms;
        }

        let power = (attempt - 1) as i32;
        let calculated = (self.initial_delay_ms as f64) * self.factor.powi(power);
        let capped = calculated.min(self.max_delay_ms as f64);
        capped as u64
    }
}
