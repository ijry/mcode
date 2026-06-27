use mcode_desktop_lib::gateway::upstream::build_event_push_frames;
use mcode_desktop_lib::runtime::normalize_cli_output_events;
use serde_json::json;

#[test]
fn p9_normalizes_cli_jsonl_to_acp_events() {
    let stdout = [
        r#"{"type":"content_delta","text":"hello"}"#,
        r#"{"type":"tool_call","id":"call-1","name":"shell","input":{"cmd":"ls"}}"#,
        r#"{"type":"tool_call_update","id":"call-1","output":"ok","status":"completed"}"#,
        r#"{"type":"usage_update","inputTokens":3,"outputTokens":5}"#,
    ]
    .join("\n");

    let events = normalize_cli_output_events("codex-cli", "cli-1", &stdout);
    let event_types = events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();

    assert!(event_types.contains(&"stream_batch"));
    assert!(event_types.contains(&"tool_call"));
    assert!(event_types.contains(&"tool_call_update"));
    assert!(event_types.contains(&"usage_update"));
    assert!(event_types.contains(&"turn_complete"));
    assert_eq!(events[0].connection_id, "cli-1");
    assert_eq!(events[0].data["delta"], "hello");
}

#[test]
fn p9_normalizes_permission_question_and_plain_text_events() {
    let stdout = [
        "plain assistant text",
        r#"{"type":"permission_request","requestId":"perm-1","description":"Run command?"}"#,
        r#"{"type":"question_request","questionId":"q-1","questions":[{"id":"choice","question":"Pick one"}]}"#,
    ]
    .join("\n");

    let events = normalize_cli_output_events("claude-cli", "cli-2", &stdout);

    assert_eq!(events[0].event_type, "stream_batch");
    assert_eq!(events[0].data["delta"], "plain assistant text");
    assert!(events
        .iter()
        .any(|event| event.event_type == "permission_request" && event.data["id"] == "perm-1"));
    assert!(events
        .iter()
        .any(|event| event.event_type == "question_request" && event.data["questionId"] == "q-1"));
}

#[test]
fn p9_wraps_proxy_response_events_as_relay_event_push_frames() {
    let frames = build_event_push_frames(&json!({
        "events": [
            {
                "type": "stream_batch",
                "connectionId": "cli-1",
                "data": { "delta": "hello", "contentType": "text" }
            }
        ]
    }));

    assert_eq!(frames.len(), 1);
    assert_eq!(frames[0]["type"], "event_push");
    assert_eq!(frames[0]["event"]["type"], "stream_batch");
    assert_eq!(frames[0]["event"]["connectionId"], "cli-1");
}

#[test]
fn p9_skips_events_that_were_already_streamed_realtime() {
    let frames = build_event_push_frames(&json!({
        "streamedEventCount": 1,
        "events": [
            {
                "type": "stream_batch",
                "connectionId": "cli-1",
                "data": { "delta": "already sent", "contentType": "text" }
            },
            {
                "type": "turn_complete",
                "connectionId": "cli-1",
                "data": { "stopReason": "completed" }
            }
        ]
    }));

    assert_eq!(frames.len(), 1);
    assert_eq!(frames[0]["event"]["type"], "turn_complete");
}
