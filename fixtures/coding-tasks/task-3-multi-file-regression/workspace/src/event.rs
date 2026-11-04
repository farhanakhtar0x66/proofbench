//! Event data structure and checksum calculation.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Event {
    pub id: String,
    pub payload: String,
    pub checksum: u32,
}

impl Event {
    pub fn new(id: impl Into<String>, payload: impl Into<String>, checksum: u32) -> Self {
        Self {
            id: id.into(),
            payload: payload.into(),
            checksum,
        }
    }
}

pub fn calculate_checksum(data: &str) -> u32 {
    let mut sum: u32 = 0;
    for b in data.bytes() {
        sum = sum.wrapping_add(b as u32);
    }
    sum
}
