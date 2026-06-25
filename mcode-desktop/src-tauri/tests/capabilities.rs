use mcode_desktop_lib::runtime::detect_capabilities;

#[test]
fn reports_codex_and_claude_capabilities_when_binaries_are_available() {
    let capabilities = detect_capabilities(Some("codex"), Some("claude"));

    assert!(capabilities.contains(&"desktop.runtime.codex-cli".to_string()));
    assert!(capabilities.contains(&"desktop.runtime.claude-cli".to_string()));
    assert!(capabilities.contains(&"desktop.tunnel.available".to_string()));
}
