//! Exponential backoff retry policy.

#[derive(Debug, Clone, PartialEq)]
pub struct BackoffPolicy {
    pub base_ms: u64,
    pub max_ms: u64,
    pub multiplier: f64,
}

impl BackoffPolicy {
    pub fn new(base_ms: u64, max_ms: u64, multiplier: f64) -> Self {
        Self {
            base_ms,
            max_ms,
            multiplier,
        }
    }

    /// Calculates backoff in milliseconds for a given attempt index (0-based).
    /// Formula: min(max_ms, floor(base_ms * (multiplier ^ attempt))).
    /// For attempt 0, returns base_ms.
    /// Clamps large values to max_ms without numeric overflow.
    pub fn calculate_backoff_ms(&self, attempt: u32) -> u64 {
        if attempt == 0 {
            return self.base_ms.min(self.max_ms);
        }
        let factor = self.multiplier.powi(attempt as i32);
        if !factor.is_finite() || factor > (self.max_ms as f64) {
            return self.max_ms;
        }
        let computed = (self.base_ms as f64) * factor;
        if !computed.is_finite() || computed >= (self.max_ms as f64) {
            self.max_ms
        } else {
            (computed as u64).min(self.max_ms)
        }
    }
}
