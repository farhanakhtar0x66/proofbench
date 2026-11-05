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

    pub fn process(&mut self, sample: f64) -> Option<f64> {
        if self.samples.len() < 5 {
            self.samples.push(sample);
            return Some(sample);
        }

        let n = self.samples.len() as f64;
        let sum: f64 = self.samples.iter().sum();
        let mean = sum / n;
        let variance: f64 = self.samples.iter().map(|&x| (x - mean).powi(2)).sum::<f64>() / n;
        let std_dev = variance.sqrt();

        if (sample - mean).abs() > 3.0 * std_dev {
            None
        } else {
            self.samples.push(sample);
            Some(sample)
        }
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
