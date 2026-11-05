#[derive(Debug, Clone)]
pub struct KalmanFusionEngine {
    pub state_estimate: f64,
    pub estimation_variance: f64,
}

impl KalmanFusionEngine {
    pub fn new(initial_estimate: f64, initial_variance: f64) -> Self {
        Self {
            state_estimate: initial_estimate,
            estimation_variance: initial_variance,
        }
    }

    pub fn update(&mut self, measurement: f64, measurement_variance: f64) -> f64 {
        let kalman_gain = self.estimation_variance / (self.estimation_variance + measurement_variance);
        self.state_estimate += kalman_gain * (measurement - self.state_estimate);
        self.estimation_variance *= 1.0 - kalman_gain;
        self.state_estimate
    }
}
