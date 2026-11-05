use task_6_mechanical::compute_checksum;

#[test]
fn test_checksum_computation() {
    assert_eq!(compute_checksum(b"hello"), 532);
    assert_eq!(compute_checksum(b""), 0);
}
