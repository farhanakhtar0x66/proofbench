#[derive(Debug, Clone, Default)]
pub struct OutlierFilteredAccumulator {
    samples: Vec<f64>,
}

impl OutlierFilteredAccumulator {
    pub fn new() -> Self {
        Self {
            samples: Vec::new(),
        }
    }

    /// Appends a sample if it is not an outlier.
    /// If fewer than 5 samples exist, accepts all samples.
    /// If 5 or more samples exist:
    ///   Computes mean = sum / N
    ///   Computes std_dev = sqrt(sum((x - mean)^2) / N)
    ///   If |sample - mean| > 3.0 * std_dev, rejects sample and returns None.
    ///   Otherwise records sample and returns Some(sample).
    pub fn process(&mut self, _sample: f64) -> Option<f64> {
        // Failing stub for coding agent to implement
        todo!("Implement outlier filtering logic")
    }

    pub fn count(&self) -> usize {
        self.samples.len()
    }

    pub fn mean(&self) -> f64 {
        if self.samples.is_empty() {
            0.0
        } else {
            self.samples.iter().sum::<f64>() / self.samples.len() as f64
        }
    }
}
