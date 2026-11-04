use task_sliding_window::sliding_window_sums;

#[test]
fn test_basic_window() {
    let values = [1, 2, 3, 4, 5];
    assert_eq!(sliding_window_sums(&values, 3), vec![6, 9, 12]);
}

#[test]
fn test_window_equals_len() {
    let values = [10, 20];
    assert_eq!(sliding_window_sums(&values, 2), vec![30]);
}

#[test]
fn test_window_larger_than_len() {
    let values = [5];
    assert_eq!(sliding_window_sums(&values, 2), Vec::<i64>::new());
}

#[test]
fn test_empty_input() {
    assert_eq!(sliding_window_sums(&[], 3), Vec::<i64>::new());
}

#[test]
fn test_window_size_one() {
    let values = [7, 8, 9];
    assert_eq!(sliding_window_sums(&values, 1), vec![7, 8, 9]);
}
