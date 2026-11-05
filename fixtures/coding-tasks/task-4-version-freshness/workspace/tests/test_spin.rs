#![deny(deprecated)]
use task_spin::spin_wait;

#[test]
fn test_zero_spins() {
    assert_eq!(spin_wait(0), 0);
}

#[test]
fn test_spins_execution() {
    let count = spin_wait(50);
    assert_eq!(count, 50);
}

#[test]
fn test_larger_spins() {
    let count = spin_wait(100);
    assert_eq!(count, 100);
}
