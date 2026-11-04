//! Sliding window sums calculator.

/// Computes the sum of each contiguous window of length `window_size`.
/// If `window_size == 0` or `window_size > values.len()`, returns an empty Vec.
pub fn sliding_window_sums(values: &[i64], window_size: usize) -> Vec<i64> {
    if window_size == 0 || window_size > values.len() {
        return Vec::new();
    }
    let mut sums = Vec::new();
    // BUG: Off-by-one loop bound: `0..=(values.len() - window_size + 1)`
    // causes an out-of-bounds index access in the final iteration.
    // Correct upper bound is `0..=(values.len() - window_size)`.
    for i in 0..=(values.len() - window_size + 1) {
        let window = &values[i..i + window_size];
        sums.push(window.iter().sum());
    }
    sums
}
