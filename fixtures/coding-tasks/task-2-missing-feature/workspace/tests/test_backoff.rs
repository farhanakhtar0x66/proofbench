use task_backoff::ExponentialBackoff;

#[test]
fn test_attempt_zero() {
    let backoff = ExponentialBackoff::new(100, 1000, 2.0, 5);
    assert_eq!(backoff.delay_for_attempt(0), 0);
}

#[test]
fn test_first_retry() {
    let backoff = ExponentialBackoff::new(100, 1000, 2.0, 5);
    assert_eq!(backoff.delay_for_attempt(1), 100);
}

#[test]
fn test_subsequent_retries() {
    let backoff = ExponentialBackoff::new(100, 1000, 2.0, 5);
    assert_eq!(backoff.delay_for_attempt(2), 200);
    assert_eq!(backoff.delay_for_attempt(3), 400);
    assert_eq!(backoff.delay_for_attempt(4), 800);
}

#[test]
fn test_cap_at_max() {
    let backoff = ExponentialBackoff::new(100, 1000, 2.0, 5);
    assert_eq!(backoff.delay_for_attempt(5), 1000);
}

#[test]
fn test_exceeding_max_retries() {
    let backoff = ExponentialBackoff::new(100, 1000, 2.0, 3);
    assert_eq!(backoff.delay_for_attempt(4), 1000);
    assert_eq!(backoff.delay_for_attempt(10), 1000);
}
