use std::collections::VecDeque;

use serde_json::Value;

pub const DESKTOP_STATE_SCHEMA: &str = "mcode.desktop.state.v1";
pub const DEFAULT_OUTBOUND_QUEUE_LIMIT: usize = 500;

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuedOutboundEvent {
    pub local_event_id: u64,
    pub event: Value,
    pub queued_at_ms: u64,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutboundEventQueue {
    next_local_event_id: u64,
    limit: usize,
    pending: VecDeque<QueuedOutboundEvent>,
    last_ack_local_event_id: Option<u64>,
    last_relay_event_id: Option<u64>,
    overflow_count: u64,
}

impl OutboundEventQueue {
    pub fn new(limit: usize) -> Self {
        Self {
            next_local_event_id: 1,
            limit,
            pending: VecDeque::new(),
            last_ack_local_event_id: None,
            last_relay_event_id: None,
            overflow_count: 0,
        }
    }

    pub fn enqueue(&mut self, event: Value) -> QueuedOutboundEvent {
        let queued = QueuedOutboundEvent {
            local_event_id: self.next_local_event_id,
            event,
            queued_at_ms: now_ms(),
        };
        self.next_local_event_id = self.next_local_event_id.saturating_add(1);
        self.pending.push_back(queued.clone());
        while self.pending.len() > self.limit {
            self.pending.pop_front();
            self.overflow_count = self.overflow_count.saturating_add(1);
        }
        queued
    }

    pub fn ack(&mut self, local_event_id: u64, relay_event_id: u64) {
        self.pending
            .retain(|event| event.local_event_id != local_event_id);
        self.last_ack_local_event_id = Some(local_event_id);
        self.last_relay_event_id = Some(relay_event_id);
    }

    pub fn pending(&self) -> Vec<QueuedOutboundEvent> {
        self.pending.iter().cloned().collect()
    }

    pub fn restore_pending(&mut self, events: Vec<QueuedOutboundEvent>) {
        self.pending = events.into_iter().collect();
        self.next_local_event_id = self
            .pending
            .iter()
            .map(|event| event.local_event_id)
            .max()
            .unwrap_or(0)
            .saturating_add(1);
    }

    pub fn last_ack_local_event_id(&self) -> Option<u64> {
        self.last_ack_local_event_id
    }

    pub fn last_relay_event_id(&self) -> Option<u64> {
        self.last_relay_event_id
    }

    pub fn oldest_local_event_id(&self) -> Option<u64> {
        self.pending.front().map(|event| event.local_event_id)
    }

    pub fn overflow_count(&self) -> u64 {
        self.overflow_count
    }
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
