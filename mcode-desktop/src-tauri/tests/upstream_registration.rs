use mcode_desktop_lib::gateway::upstream::DesktopUpstreamHello;

#[test]
fn builds_desktop_upstream_hello_with_target_metadata() {
    let hello = DesktopUpstreamHello::new(
        "desktop-1",
        "Work Mac Mini",
        vec!["desktop.runtime.codex-cli".to_string()],
    );

    assert_eq!(hello.target_id, "desktop-1");
    assert_eq!(hello.target_agent, "mcode-desktop");
    assert_eq!(hello.protocol_version, "1");

    let value = serde_json::to_value(&hello).expect("serialize hello");
    assert_eq!(value["targetAgent"], "mcode-desktop");
    assert_eq!(value["protocolVersion"], "1");
}
