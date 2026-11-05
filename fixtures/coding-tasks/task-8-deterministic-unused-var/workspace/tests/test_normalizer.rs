use task_8_deterministic_unused_var::normalize_reading;

#[test]
fn test_normalizer() {
    let result = normalize_reading(0.42, 1.0);
    assert!((result - 42.0).abs() < 1e-6);
}
