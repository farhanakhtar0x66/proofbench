use task_backoff_policy::BackoffPolicy;

#[test]
fn test_attempt_zero_returns_base() {
    let policy = BackoffPolicy::new(100, 10_000, 2.0);
    assert_eq!(policy.calculate_backoff_ms(0), 100);
}

#[test]
fn test_attempt_one_and_two() {
    let policy = BackoffPolicy::new(100, 10_000, 2.0);
    assert_eq!(policy.calculate_backoff_ms(1), 200);
    assert_eq!(policy.calculate_backoff_ms(2), 400);
}

#[test]
fn test_fractional_multiplier() {
    let policy = BackoffPolicy::new(100, 10_000, 1.5);
    assert_eq!(policy.calculate_backoff_ms(0), 100);
    assert_eq!(policy.calculate_backoff_ms(1), 150);
    assert_eq!(policy.calculate_backoff_ms(2), 225);
}

#[test]
fn test_capped_at_max() {
    let policy = BackoffPolicy::new(100, 500, 2.0);
    assert_eq!(policy.calculate_backoff_ms(2), 400);
    assert_eq!(policy.calculate_backoff_ms(3), 500);
    assert_eq!(policy.calculate_backoff_ms(10), 500);
}

#[test]
fn test_large_attempt_no_overflow() {
    let policy = BackoffPolicy::new(100, 5_000, 2.0);
    assert_eq!(policy.calculate_backoff_ms(100), 5_000);
}
