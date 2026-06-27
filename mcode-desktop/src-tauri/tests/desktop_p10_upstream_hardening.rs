use std::sync::atomic::Ordering;

use mcode_desktop_lib::app_state::AppState;
use mcode_desktop_lib::gateway::upstream::{
    handle_upstream_frame, mark_upstream_online, parse_upstream_frame, record_upstream_retry,
    request_upstream_shutdown, RelayControlFrame,
};
use mcode_desktop_lib::health::build_health_snapshot;

#[tokio::test]
async fn p10_tracks_ack_and_active_controller_frames() {
    let state = AppState::new_for_test();

    handle_upstream_frame(&state, RelayControlFrame::Ack { event_id: 42 })
        .await
        .unwrap();
    handle_upstream_frame(
        &state,
        RelayControlFrame::ControllerAttached {
            controller_id: "mobile-1".to_string(),
        },
    )
    .await
    .unwrap();

    let snapshot = build_health_snapshot(&state);
    assert_eq!(snapshot.last_ack_event_id, Some(42));
    assert_eq!(snapshot.active_controller_id.as_deref(), Some("mobile-1"));
    assert!(snapshot
        .diagnostics
        .iter()
        .any(|entry| entry.message.contains("controller attached")));
}

#[tokio::test]
async fn p10_records_retry_state_and_resets_when_online() {
    let state = AppState::new_for_test();

    record_upstream_retry(&state, 3, 4_000);
    let retry_snapshot = build_health_snapshot(&state);
    assert_eq!(retry_snapshot.upstream_reconnect_attempt, 3);
    assert_eq!(retry_snapshot.upstream_next_retry_delay_ms, Some(4_000));

    mark_upstream_online(&state).await;
    let online_snapshot = build_health_snapshot(&state);
    assert_eq!(online_snapshot.upstream_reconnect_attempt, 0);
    assert_eq!(online_snapshot.upstream_next_retry_delay_ms, None);
}

#[test]
fn p10_marks_shutdown_requested_for_safe_exit() {
    let state = AppState::new_for_test();

    record_upstream_retry(&state, 1, 1_000);
    request_upstream_shutdown(&state);

    assert!(state.shutdown_requested.load(Ordering::SeqCst));
    let snapshot = build_health_snapshot(&state);
    assert!(snapshot.shutdown_requested);
    assert_eq!(snapshot.upstream_next_retry_delay_ms, None);
}

#[test]
fn p10_parses_ack_and_controller_frames() {
    let ack = parse_upstream_frame(r#"{"type":"ack","eventId":7}"#).unwrap();
    assert_eq!(ack, RelayControlFrame::Ack { event_id: 7 });

    let controller =
        parse_upstream_frame(r#"{"type":"controller_attached","controllerId":"phone"}"#).unwrap();
    assert_eq!(
        controller,
        RelayControlFrame::ControllerAttached {
            controller_id: "phone".to_string()
        }
    );
}
