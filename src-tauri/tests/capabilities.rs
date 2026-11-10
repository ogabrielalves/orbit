#![allow(clippy::expect_used)]

use serde_json::Value;

fn default_permissions() -> Vec<String> {
    let text = std::fs::read_to_string("capabilities/default.json").expect("reads capability");
    let capability: Value = serde_json::from_str(&text).expect("parses capability");
    capability["permissions"]
        .as_array()
        .expect("permissions list")
        .iter()
        .map(|permission| permission.as_str().expect("permission name").to_string())
        .collect()
}

#[test]
fn the_main_window_only_gets_the_core_defaults_the_close_permissions_and_the_file_picker() {
    let permissions = default_permissions();

    assert_eq!(
        permissions,
        [
            "core:default",
            "core:window:allow-close",
            "core:window:allow-destroy",
            "dialog:allow-open"
        ]
    );
}

#[test]
fn the_main_window_can_be_closed_and_destroyed_but_not_otherwise_controlled() {
    let permissions = default_permissions();
    let window_permissions: Vec<&String> = permissions
        .iter()
        .filter(|name| name.starts_with("core:window:"))
        .collect();

    assert_eq!(
        window_permissions,
        ["core:window:allow-close", "core:window:allow-destroy"]
    );
}

#[test]
fn the_webview_is_never_granted_the_opener_or_filesystem_plugins() {
    let permissions = default_permissions();

    assert!(
        permissions
            .iter()
            .all(|name| !name.starts_with("opener:") && !name.starts_with("fs:")),
        "unexpected permissions: {permissions:?}"
    );
}

#[test]
fn the_capability_applies_to_the_main_window_only() {
    let text = std::fs::read_to_string("capabilities/default.json").expect("reads capability");
    let capability: Value = serde_json::from_str(&text).expect("parses capability");

    assert_eq!(capability["windows"], serde_json::json!(["main"]));
}
