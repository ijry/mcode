use mcode_desktop_lib::tunnel::TunnelBinding;

#[test]
fn binds_code_preview_to_loopback_port_1080() {
    let binding = TunnelBinding::for_code_preview(1080, "http://127.0.0.1:3000");

    assert_eq!(binding.local_bind, "127.0.0.1:1080");
    assert_eq!(binding.upstream_origin, "http://127.0.0.1:3000");
    assert_eq!(binding.public_port, 1080);
}
