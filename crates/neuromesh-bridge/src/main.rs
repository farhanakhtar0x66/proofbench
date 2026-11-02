//! New hackathon code. No original NeuroMesh source is linked or copied.
//! A native boundary probe, not an execution engine or sandbox.
fn capability_response() -> &'static str {
    r#"{"version":"1","nativeExecution":false,"error":"not_integrated"}"#
}
fn main() {
    println!("{}", capability_response());
}
#[cfg(test)]
mod tests {
    #[test]
    fn never_claims_native_execution() {
        assert!(super::capability_response().contains("\"nativeExecution\":false"));
    }
}
