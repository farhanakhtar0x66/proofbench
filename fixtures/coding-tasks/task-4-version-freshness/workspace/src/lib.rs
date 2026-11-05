#![deny(deprecated)]

/// Executes up to `max_spins` spin-loop iterations signaling the CPU.
/// Returns the number of spin iterations actually executed.
pub fn spin_wait(max_spins: usize) -> usize {
    // TODO: implement spin wait using modern non-deprecated hint API
    0
}
