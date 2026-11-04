//! Decoy utility module: CRC and simple cryptographic checksums.
//! Not needed for outlier accumulator logic.

pub fn compute_crc32(data: &[u8]) -> u32 {
    let mut crc = 0xFFFFFFFFu32;
    for &byte in data {
        crc ^= byte as u32;
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xEDB88320 & mask);
        }
    }
    !crc
}

pub fn rolling_fnv1a(data: &[u8], seed: u64) -> u64 {
    const FNV_PRIME: u64 = 0x100000001B3;
    let mut hash = seed ^ 0xCBF29CE484222325;
    for &b in data {
        hash ^= b as u64;
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

pub fn obfuscate_token(raw: &str, salt: u32) -> String {
    let mut out = String::with_capacity(raw.len() * 2);
    for (i, b) in raw.bytes().enumerate() {
        let masked = b ^ ((salt >> (i % 4)) as u8);
        out.push_str(&format!("{:02x}", masked));
    }
    out
}
