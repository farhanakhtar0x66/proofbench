//! Decoy utility module: telemetry and performance timing.
//! Not needed for outlier accumulator logic.

#[derive(Debug, Clone)]
pub struct TimerMetric {
    pub name: String,
    pub elapsed_nanos: u64,
}

impl TimerMetric {
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            elapsed_nanos: 0,
        }
    }

    pub fn record(&mut self, nanos: u64) {
        self.elapsed_nanos += nanos;
    }

    pub fn reset(&mut self) {
        self.elapsed_nanos = 0;
    }
}

pub fn calculate_percentile(sorted_samples: &[f64], percentile: f64) -> f64 {
    if sorted_samples.is_empty() {
        return 0.0;
    }
    let rank = (percentile / 100.0) * (sorted_samples.len() - 1) as f64;
    let lower = rank.floor() as usize;
    let upper = rank.ceil() as usize;
    if lower == upper {
        sorted_samples[lower]
    } else {
        let weight = rank - lower as f64;
        sorted_samples[lower] * (1.0 - weight) + sorted_samples[upper] * weight
    }
}

pub fn summarize_histogram(samples: &[f64], num_buckets: usize) -> Vec<(f64, usize)> {
    if samples.is_empty() || num_buckets == 0 {
        return Vec::new();
    }
    let min = samples.iter().copied().fold(f64::INFINITY, f64::min);
    let max = samples.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let step = (max - min) / num_buckets as f64;
    let mut buckets = vec![0; num_buckets];

    for &s in samples {
        let idx = if step > 0.0 {
            ((s - min) / step).floor() as usize
        } else {
            0
        };
        let clamped = idx.min(num_buckets - 1);
        buckets[clamped] += 1;
    }

    buckets.into_iter().enumerate().map(|(i, count)| (min + i as f64 * step, count)).collect()
}
