use task_accumulator::OutlierFilteredAccumulator;

#[test]
fn test_initial_five_samples_accepted() {
    let mut acc = OutlierFilteredAccumulator::new();
    assert_eq!(acc.process(10.0), Some(10.0));
    assert_eq!(acc.process(10.2), Some(10.2));
    assert_eq!(acc.process(9.8), Some(9.8));
    assert_eq!(acc.process(10.1), Some(10.1));
    assert_eq!(acc.process(9.9), Some(9.9));
    assert_eq!(acc.count(), 5);
}

#[test]
fn test_outlier_rejection_after_warmup() {
    let mut acc = OutlierFilteredAccumulator::new();
    for _ in 0..10 {
        acc.process(100.0);
    }
    // Mean = 100.0, std_dev = 0.0. A sample of 105.0 exceeds mean + 3.0 * std_dev and is rejected.
    assert_eq!(acc.process(105.0), None);
    assert_eq!(acc.count(), 10);

    // Normal sample within bounds
    assert_eq!(acc.process(100.0), Some(100.0));
    assert_eq!(acc.count(), 11);
}

#[test]
fn test_variance_aware_rejection() {
    let mut acc = OutlierFilteredAccumulator::new();
    // Feed samples with moderate variance: 10, 12, 8, 11, 9 (mean = 10, std_dev ~ 1.414)
    acc.process(10.0);
    acc.process(12.0);
    acc.process(8.0);
    acc.process(11.0);
    acc.process(9.0);

    // Bound is ~10 +/- 4.24 ([5.76, 14.24])
    // 13.0 should be accepted
    assert_eq!(acc.process(13.0), Some(13.0));
    // 50.0 is an extreme outlier and must be rejected
    assert_eq!(acc.process(50.0), None);
    assert_eq!(acc.process(-20.0), None);
}
