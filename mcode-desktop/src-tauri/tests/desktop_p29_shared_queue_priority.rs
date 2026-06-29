use std::sync::{Arc, Mutex};

use mcode_desktop_lib::app_state::AppState;
use mcode_desktop_lib::health::build_health_snapshot;
use mcode_desktop_lib::recovery::{apply_recovery_snapshot, build_recovery_snapshot};
use mcode_desktop_lib::runtime::{
    begin_hosted_turn_for_test, dispatch_desktop_proxy_with_event_sink,
    dispatch_desktop_proxy_with_event_sink_arc, dispatch_desktop_proxy_with_state,
    end_hosted_turn, start_next_queued_prompt_if_idle, AcpEventEnvelope,
    CAPABILITY_QUEUE_PRIORITY, CAPABILITY_QUEUE_REORDER,
};
use serde_json::json;

fn queued_prompt(session_id: &str, prompt: &str) -> serde_json::Value {
    json!({
        "sessionId": session_id,
        "prompt": prompt,
    })
}

#[tokio::test]
async fn p29_connect_and_health_expose_queue_mutation_capabilities() {
    let state = AppState::new_for_test();
    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();

    let capabilities = connected["capabilities"].as_array().cloned().unwrap();
    assert!(capabilities.iter().any(|value| value == CAPABILITY_QUEUE_REORDER));
    assert!(capabilities.iter().any(|value| value == CAPABILITY_QUEUE_PRIORITY));

    let health = build_health_snapshot(&state);
    assert!(health
        .capabilities
        .iter()
        .any(|value| value == CAPABILITY_QUEUE_REORDER));
    assert!(health
        .capabilities
        .iter()
        .any(|value| value == CAPABILITY_QUEUE_PRIORITY));
}

#[tokio::test]
async fn p29_reorder_and_priority_change_emit_full_queue_snapshot() {
    let state = AppState::new_for_test();
    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap().to_string();
    begin_hosted_turn_for_test(&state, &session_id, "turn-live", None).unwrap();

    for prompt in ["first", "second", "third"] {
        dispatch_desktop_proxy_with_state(&state, "acp_prompt", queued_prompt(&session_id, prompt))
            .await
            .unwrap();
    }

    let events = Arc::new(Mutex::new(Vec::<AcpEventEnvelope>::new()));
    let sink_events = Arc::clone(&events);
    let queue_item_id = dispatch_desktop_proxy_with_event_sink(
        &state,
        "acp_prompt",
        queued_prompt(&session_id, "fourth"),
        Some(Arc::new(move |event| {
            sink_events.lock().unwrap().push(event);
        })),
    )
    .await
    .unwrap()["queueItemId"]
        .as_str()
        .unwrap()
        .to_string();
    assert!(!queue_item_id.is_empty());

    let first_queue_item_id = build_health_snapshot(&state).prompt_queue[0]
        .queue_item_id
        .clone();
    let reorder_events = Arc::clone(&events);

    let reorder_response = dispatch_desktop_proxy_with_event_sink(
        &state,
        "acp_reorder_queued_prompt",
        json!({
            "sessionId": session_id,
            "queueItemId": first_queue_item_id,
            "action": "move_bottom",
        }),
        Some(Arc::new(move |event| {
            reorder_events.lock().unwrap().push(event);
        })),
    )
    .await
    .unwrap();
    assert_eq!(reorder_response["status"], "reordered");
    assert_eq!(reorder_response["queueLength"], 4);
    assert_eq!(reorder_response["queuePosition"], 4);

    let snapshot_after_reorder = build_health_snapshot(&state);
    assert_eq!(snapshot_after_reorder.prompt_queue.len(), 4);
    assert_eq!(snapshot_after_reorder.prompt_queue[3].queue_item_id, first_queue_item_id);
    let priority_events = Arc::clone(&events);

    let priority_response = dispatch_desktop_proxy_with_event_sink(
        &state,
        "acp_set_queued_prompt_priority",
        json!({
            "sessionId": session_id,
            "queueItemId": first_queue_item_id,
            "priorityTier": "high",
        }),
        Some(Arc::new(move |event| {
            priority_events.lock().unwrap().push(event);
        })),
    )
    .await
    .unwrap();
    assert_eq!(priority_response["status"], "updated");
    assert_eq!(priority_response["priorityTier"], "high");

    let snapshot_after_priority = build_health_snapshot(&state);
    assert_eq!(snapshot_after_priority.prompt_queue.len(), 4);
    assert_eq!(snapshot_after_priority.prompt_queue[0].queue_item_id, first_queue_item_id);
    assert_eq!(snapshot_after_priority.prompt_queue[0].priority_tier, mcode_desktop_lib::runtime::PromptPriorityTier::High);

    let captured = events.lock().unwrap().clone();
    assert!(captured.iter().any(|event| event.event_type == "turn_queue_reordered"));
    assert!(captured.iter().any(|event| event.event_type == "turn_queue_priority_changed"));
    let reorder_event = captured
        .iter()
        .find(|event| event.event_type == "turn_queue_reordered")
        .unwrap();
    assert_eq!(reorder_event.data["queueSnapshot"].as_array().unwrap().len(), 4);
}

#[tokio::test]
async fn p29_recovery_preserves_queue_order_and_priority() {
    let state = AppState::new_for_test();
    let connected = dispatch_desktop_proxy_with_state(
        &state,
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap().to_string();
    begin_hosted_turn_for_test(&state, &session_id, "turn-live", None).unwrap();

    for prompt in ["first", "second", "third"] {
        dispatch_desktop_proxy_with_state(&state, "acp_prompt", queued_prompt(&session_id, prompt))
            .await
            .unwrap();
    }

    let queue_item_id = build_health_snapshot(&state).prompt_queue[1]
        .queue_item_id
        .clone();
    dispatch_desktop_proxy_with_state(
        &state,
        "acp_set_queued_prompt_priority",
        json!({
            "sessionId": session_id,
            "queueItemId": queue_item_id,
            "priorityTier": "high",
        }),
    )
    .await
    .unwrap();

    let snapshot = build_recovery_snapshot(&state).unwrap();
    let restored = AppState::new_for_test();
    apply_recovery_snapshot(&restored, snapshot).unwrap();

    let health = build_health_snapshot(&restored);
    assert_eq!(health.prompt_queue.len(), 3);
    assert_eq!(health.prompt_queue[0].priority_tier, mcode_desktop_lib::runtime::PromptPriorityTier::High);
}

#[tokio::test]
async fn p29_reorder_rejects_items_that_are_no_longer_queued() {
    let state = Arc::new(AppState::new_for_test());
    let connected = dispatch_desktop_proxy_with_event_sink_arc(
        Arc::clone(&state),
        "acp_connect",
        json!({ "agentType": "claude_code", "workingDir": env!("CARGO_MANIFEST_DIR") }),
        None,
    )
    .await
    .unwrap();
    let session_id = connected["sessionId"].as_str().unwrap().to_string();
    begin_hosted_turn_for_test(&state, &session_id, "turn-live", None).unwrap();
    let queued = dispatch_desktop_proxy_with_event_sink_arc(
        Arc::clone(&state),
        "acp_prompt",
        queued_prompt(&session_id, "queued"),
        None,
    )
    .await
    .unwrap();
    let queue_item_id = queued["queueItemId"].as_str().unwrap().to_string();

    end_hosted_turn(&state, &session_id);
    start_next_queued_prompt_if_idle(Arc::clone(&state), session_id.clone(), None);

    let error = dispatch_desktop_proxy_with_state(
        &state,
        "acp_reorder_queued_prompt",
        json!({
            "sessionId": session_id,
            "queueItemId": queue_item_id,
            "action": "move_top",
        }),
    )
    .await
    .unwrap_err();

    assert!(error.to_string().contains("\"code\":\"invalid_queue_state\""));
}
