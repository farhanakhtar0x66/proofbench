//! Line parser for formatted event strings.

use crate::event::{calculate_checksum, Event};

/// Parses a line formatted as `id|payload|checksum`.
/// Validates that `checksum` matches `calculate_checksum(payload)`.
pub fn parse_event(line: &str) -> Result<Event, String> {
    let parts: Vec<&str> = line.split('|').collect();
    if parts.len() != 3 {
        return Err("invalid event format: expected id|payload|checksum".to_string());
    }

    let id = parts[0].to_string();
    let payload = parts[1].to_string();

    let checksum = parts[2]
        .parse::<u32>()
        .map_err(|e| format!("invalid checksum format: {}", e))?;

    let expected_checksum = calculate_checksum(&payload);
    if checksum != expected_checksum {
        return Err(format!(
            "checksum mismatch: expected {}, got {}",
            expected_checksum, checksum
        ));
    }

    Ok(Event::new(id, payload, checksum))
}
