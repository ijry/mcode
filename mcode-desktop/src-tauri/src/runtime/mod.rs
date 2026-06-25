pub mod claude_cli;
pub mod codex_cli;

pub const CAPABILITY_CODEX_CLI: &str = "desktop.runtime.codex-cli";
pub const CAPABILITY_CLAUDE_CLI: &str = "desktop.runtime.claude-cli";
pub const CAPABILITY_TUNNEL_AVAILABLE: &str = "desktop.tunnel.available";

pub fn detect_capabilities(codex_path: Option<&str>, claude_path: Option<&str>) -> Vec<String> {
    let mut capabilities = vec![CAPABILITY_TUNNEL_AVAILABLE.to_string()];

    if has_binary_hint(codex_path) {
        capabilities.push(CAPABILITY_CODEX_CLI.to_string());
    }
    if has_binary_hint(claude_path) {
        capabilities.push(CAPABILITY_CLAUDE_CLI.to_string());
    }

    capabilities
}

fn has_binary_hint(path: Option<&str>) -> bool {
    path.map(|value| !value.trim().is_empty()).unwrap_or(false)
}
