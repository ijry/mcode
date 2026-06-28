use mcode_desktop_lib::recovery::OutboundEventQueue;
use serde_json::json;

use mcode_desktop_lib::app_state::AppState;
use mcode_desktop_lib::gateway::upstream::{
    build_event_push_frame, handle_upstream_frame, queue_event_for_upstream, RelayControlFrame,
};

#[test]
fn p19_queues_acks_and_replays_outbound_events_in_order() {
    let mut queue = OutboundEventQueue::new(3);

    let first = queue.enqueue(json!({ "type": "stream_batch", "data": { "delta": "one" } }));
    let second = queue.enqueue(json!({ "type": "stream_batch", "data": { "delta": "two" } }));

    assert_eq!(first.local_event_id, 1);
    assert_eq!(second.local_event_id, 2);
    assert_eq!(queue.pending().len(), 2);

    queue.ack(1, 41);
    assert_eq!(queue.pending().len(), 1);
    assert_eq!(queue.pending()[0].local_event_id, 2);
    assert_eq!(queue.last_ack_local_event_id(), Some(1));
    assert_eq!(queue.last_relay_event_id(), Some(41));
}

#[test]
fn p19_bounds_queue_and_reports_overflow() {
    let mut queue = OutboundEventQueue::new(2);

    queue.enqueue(json!({ "id": 1 }));
    queue.enqueue(json!({ "id": 2 }));
    queue.enqueue(json!({ "id": 3 }));

    assert_eq!(
        queue
            .pending()
            .iter()
            .map(|event| event.local_event_id)
            .collect::<Vec<_>>(),
        vec![2, 3]
    );
    assert_eq!(queue.overflow_count(), 1);
}

#[tokio::test]
async fn p19_ack_removes_queued_event_by_local_id() {
    let state = AppState::new_for_test();
    let queued = queue_event_for_upstream(&state, json!({ "type": "stream_batch" })).unwrap();

    handle_upstream_frame(
        &state,
        RelayControlFrame::Ack {
            event_id: 77,
            local_event_id: Some(queued.local_event_id),
        },
    )
    .await
    .unwrap();

    let queue = state.outbound_event_queue.lock().unwrap();
    assert_eq!(queue.pending().len(), 0);
    assert_eq!(queue.last_ack_local_event_id(), Some(queued.local_event_id));
    assert_eq!(queue.last_relay_event_id(), Some(77));
}

#[test]
fn p19_event_push_frame_includes_local_event_id() {
    let frame = build_event_push_frame(8, json!({ "type": "stream_batch" }));

    assert_eq!(frame["type"], "event_push");
    assert_eq!(frame["localEventId"], 8);
    assert_eq!(frame["event"]["type"], "stream_batch");
}
