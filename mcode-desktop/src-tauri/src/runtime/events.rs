use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Map, Value};

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpEventEnvelope {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(rename = "connectionId")]
    pub connection_id: String,
    pub data: Value,
}

impl AcpEventEnvelope {
    fn new(connection_id: &str, event_type: &str, data: Value) -> Self {
        Self {
            event_type: event_type.to_string(),
            connection_id: connection_id.to_string(),
            data,
        }
    }
}

pub fn normalize_cli_output_events(
    runtime: &str,
    connection_id: &str,
    stdout: &str,
) -> Vec<AcpEventEnvelope> {
    let mut events = Vec::new();

    for line in stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        match serde_json::from_str::<Value>(line) {
            Ok(Value::Object(record)) => {
                if let Some(event) = normalize_json_record(runtime, connection_id, &record) {
                    events.push(event);
                }
            }
            Ok(other) => {
                if let Some(text) = extract_text_value(&other) {
                    events.push(stream_batch(connection_id, &text, "text"));
                }
            }
            Err(_) => events.push(stream_batch(connection_id, line, "text")),
        }
    }

    if !events.is_empty()
        && !events
            .iter()
            .any(|event| event.event_type == "turn_complete")
    {
        events.push(AcpEventEnvelope::new(
            connection_id,
            "status_changed",
            json!({
                "status": "idle",
                "scope": "connection",
                "runtime": runtime,
            }),
        ));
        events.push(AcpEventEnvelope::new(
            connection_id,
            "turn_complete",
            json!({
                "sessionId": connection_id,
                "stopReason": "completed",
                "runtime": runtime,
                "timestamp": now_ms(),
            }),
        ));
    }

    events
}

pub fn normalize_cli_output_line_events(
    runtime: &str,
    connection_id: &str,
    line: &str,
) -> Vec<AcpEventEnvelope> {
    let line = line.trim();
    if line.is_empty() {
        return Vec::new();
    }
    match serde_json::from_str::<Value>(line) {
        Ok(Value::Object(record)) => normalize_json_record(runtime, connection_id, &record)
            .into_iter()
            .collect(),
        Ok(other) => extract_text_value(&other)
            .map(|text| vec![stream_batch(connection_id, &text, "text")])
            .unwrap_or_default(),
        Err(_) => vec![stream_batch(connection_id, line, "text")],
    }
}

fn normalize_json_record(
    runtime: &str,
    connection_id: &str,
    record: &Map<String, Value>,
) -> Option<AcpEventEnvelope> {
    let raw_type = first_string(record, &["type", "event", "event_type"]).unwrap_or_default();
    let normalized_type = raw_type.replace('.', "_").replace('-', "_");

    if normalized_type.contains("permission") {
        return Some(permission_event(connection_id, record, &normalized_type));
    }
    if normalized_type.contains("question") {
        return Some(question_event(connection_id, record, &normalized_type));
    }
    if normalized_type.contains("tool")
        && (normalized_type.contains("result") || normalized_type.contains("update"))
    {
        return Some(tool_update_event(connection_id, record));
    }
    if normalized_type.contains("tool") && normalized_type.contains("call") {
        return Some(tool_call_event(connection_id, record));
    }
    if normalized_type.contains("usage") || record.contains_key("usage") {
        return Some(usage_event(connection_id, record));
    }
    if normalized_type.contains("error") || record.contains_key("error") {
        return Some(error_event(runtime, connection_id, record));
    }
    if normalized_type.contains("status") {
        return Some(status_event(runtime, connection_id, record));
    }
    if normalized_type.contains("complete") || normalized_type.contains("completed") {
        return Some(AcpEventEnvelope::new(
            connection_id,
            "turn_complete",
            json!({
                "sessionId": connection_id,
                "stopReason": first_string(record, &["stop_reason", "stopReason", "reason"]).unwrap_or_else(|| "completed".to_string()),
                "runtime": runtime,
                "timestamp": first_number(record, &["timestamp", "created_at", "createdAt"]).unwrap_or_else(now_ms),
            }),
        ));
    }
    if normalized_type.contains("thinking") {
        return extract_text_record(record)
            .map(|text| stream_batch(connection_id, &text, "thinking"));
    }
    if normalized_type.contains("delta")
        || normalized_type.contains("message")
        || normalized_type.contains("text")
        || normalized_type.is_empty()
    {
        return extract_text_record(record).map(|text| stream_batch(connection_id, &text, "text"));
    }

    extract_text_record(record).map(|text| stream_batch(connection_id, &text, "text"))
}

fn stream_batch(connection_id: &str, delta: &str, content_type: &str) -> AcpEventEnvelope {
    AcpEventEnvelope::new(
        connection_id,
        "stream_batch",
        json!({
            "delta": delta,
            "contentType": content_type,
        }),
    )
}

fn tool_call_event(connection_id: &str, record: &Map<String, Value>) -> AcpEventEnvelope {
    AcpEventEnvelope::new(
        connection_id,
        "tool_call",
        json!({
            "id": first_string(record, &["tool_call_id", "toolCallId", "call_id", "id"]).unwrap_or_else(|| "tool-call".to_string()),
            "name": first_string(record, &["name", "tool_name", "toolName", "title"]).unwrap_or_else(|| "tool".to_string()),
            "input": first_value(record, &["input", "arguments", "raw_input", "rawInput"]).map(normalize_tool_input).unwrap_or_else(|| json!({})),
            "status": "running",
            "raw": Value::Object(record.clone()),
        }),
    )
}

fn tool_update_event(connection_id: &str, record: &Map<String, Value>) -> AcpEventEnvelope {
    AcpEventEnvelope::new(
        connection_id,
        "tool_call_update",
        json!({
            "id": first_string(record, &["tool_call_id", "toolCallId", "call_id", "id"]).unwrap_or_else(|| "tool-call".to_string()),
            "output": first_string(record, &["output", "content", "raw_output", "rawOutput"]),
            "error": first_string(record, &["error", "message"]),
            "status": map_tool_status(first_string(record, &["status", "state"]).as_deref()),
            "raw": Value::Object(record.clone()),
        }),
    )
}

fn permission_event(
    connection_id: &str,
    record: &Map<String, Value>,
    normalized_type: &str,
) -> AcpEventEnvelope {
    if normalized_type.contains("resolved") {
        return AcpEventEnvelope::new(
            connection_id,
            "permission_resolved",
            json!({
                "requestId": first_string(record, &["request_id", "requestId", "id"]).unwrap_or_default(),
            }),
        );
    }

    AcpEventEnvelope::new(
        connection_id,
        "permission_request",
        json!({
            "id": first_string(record, &["request_id", "requestId", "id"]).unwrap_or_else(|| "permission".to_string()),
            "type": first_string(record, &["permission_type", "permissionType", "kind"]).unwrap_or_else(|| "command".to_string()),
            "description": first_string(record, &["description", "message", "title"]).unwrap_or_else(|| "Permission required".to_string()),
            "details": first_value(record, &["details", "tool_call", "toolCall"]).unwrap_or_else(|| Value::Object(record.clone())),
            "options": normalize_permission_options(record),
        }),
    )
}

fn question_event(
    connection_id: &str,
    record: &Map<String, Value>,
    normalized_type: &str,
) -> AcpEventEnvelope {
    if normalized_type.contains("resolved") {
        return AcpEventEnvelope::new(
            connection_id,
            "question_resolved",
            json!({
                "questionId": first_string(record, &["question_id", "questionId", "id"]).unwrap_or_default(),
            }),
        );
    }

    AcpEventEnvelope::new(
        connection_id,
        "question_request",
        json!({
            "questionId": first_string(record, &["question_id", "questionId", "id"]).unwrap_or_else(|| "question".to_string()),
            "questions": first_value(record, &["questions"]).unwrap_or_else(|| json!([])),
            "createdAt": first_string(record, &["created_at", "createdAt"]).unwrap_or_else(now_iso_like),
        }),
    )
}

fn usage_event(connection_id: &str, record: &Map<String, Value>) -> AcpEventEnvelope {
    let usage = record.get("usage").and_then(Value::as_object);
    let input = first_number(record, &["inputTokens", "input_tokens"])
        .or_else(|| usage.and_then(|usage| first_number(usage, &["inputTokens", "input_tokens"])))
        .unwrap_or(0);
    let output = first_number(record, &["outputTokens", "output_tokens"])
        .or_else(|| usage.and_then(|usage| first_number(usage, &["outputTokens", "output_tokens"])))
        .unwrap_or(0);
    let total = first_number(record, &["totalTokens", "total_tokens"])
        .or_else(|| usage.and_then(|usage| first_number(usage, &["totalTokens", "total_tokens"])))
        .unwrap_or(input + output);

    AcpEventEnvelope::new(
        connection_id,
        "usage_update",
        json!({
            "inputTokens": input,
            "outputTokens": output,
            "totalTokens": total,
        }),
    )
}

fn error_event(
    runtime: &str,
    connection_id: &str,
    record: &Map<String, Value>,
) -> AcpEventEnvelope {
    AcpEventEnvelope::new(
        connection_id,
        "error",
        json!({
            "message": first_string(record, &["error", "message"]).unwrap_or_else(|| "CLI adapter error".to_string()),
            "agentType": runtime,
            "raw": Value::Object(record.clone()),
        }),
    )
}

fn status_event(
    runtime: &str,
    connection_id: &str,
    record: &Map<String, Value>,
) -> AcpEventEnvelope {
    AcpEventEnvelope::new(
        connection_id,
        "status_changed",
        json!({
            "status": map_runtime_status(first_string(record, &["status", "state"]).as_deref()),
            "message": first_string(record, &["message", "description"]),
            "scope": "connection",
            "runtime": runtime,
        }),
    )
}

fn normalize_permission_options(record: &Map<String, Value>) -> Value {
    let Some(Value::Array(options)) = first_value(record, &["options"]) else {
        return json!([
            { "id": "allow", "label": "Allow" },
            { "id": "deny", "label": "Deny" }
        ]);
    };

    Value::Array(
        options
            .iter()
            .map(|option| {
                let option = option.as_object();
                json!({
                    "id": option.and_then(|value| first_string(value, &["option_id", "id", "value"])).unwrap_or_else(|| "option".to_string()),
                    "label": option.and_then(|value| first_string(value, &["label", "name", "value"])).unwrap_or_else(|| "Option".to_string()),
                    "description": option.and_then(|value| first_string(value, &["description", "kind"])),
                })
            })
            .collect(),
    )
}

fn normalize_tool_input(value: Value) -> Value {
    if value.is_object() {
        return value;
    }
    if let Some(text) = value.as_str() {
        return serde_json::from_str::<Value>(text).unwrap_or_else(|_| json!({ "value": text }));
    }
    json!({ "value": value })
}

fn extract_text_record(record: &Map<String, Value>) -> Option<String> {
    for key in [
        "delta",
        "text",
        "content",
        "output_text",
        "outputText",
        "message",
    ] {
        if let Some(text) = record.get(key).and_then(extract_text_value) {
            return Some(text);
        }
    }
    None
}

fn extract_text_value(value: &Value) -> Option<String> {
    match value {
        Value::String(text) if !text.trim().is_empty() => Some(text.clone()),
        Value::Array(items) => {
            let text = items
                .iter()
                .filter_map(extract_text_value)
                .collect::<Vec<_>>()
                .join("");
            (!text.trim().is_empty()).then_some(text)
        }
        Value::Object(record) => extract_text_record(record),
        _ => None,
    }
}

fn first_value(record: &Map<String, Value>, keys: &[&str]) -> Option<Value> {
    keys.iter().find_map(|key| record.get(*key).cloned())
}

fn first_string(record: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        record
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
    })
}

fn first_number(record: &Map<String, Value>, keys: &[&str]) -> Option<u64> {
    keys.iter().find_map(|key| {
        let value = record.get(*key)?;
        if let Some(number) = value.as_u64() {
            return Some(number);
        }
        value
            .as_str()
            .and_then(|text| text.trim().parse::<u64>().ok())
    })
}

fn map_tool_status(status: Option<&str>) -> &'static str {
    match status {
        Some("completed") | Some("success") | Some("succeeded") => "completed",
        Some("failed") | Some("error") => "error",
        _ => "running",
    }
}

fn map_runtime_status(status: Option<&str>) -> &'static str {
    match status {
        Some("waiting_permission") | Some("requires_permission") => "waiting_permission",
        Some("waiting_question") | Some("requires_input") => "waiting_question",
        Some("running_tool") | Some("tool_running") => "running_tool",
        Some("running") | Some("in_progress") | Some("thinking") => "thinking",
        Some("error") | Some("failed") => "error",
        Some("completed") | Some("idle") => "idle",
        _ => "connected",
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn now_iso_like() -> String {
    now_ms().to_string()
}
