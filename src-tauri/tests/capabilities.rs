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
fn the_main_window_only_gets_the_core_defaults_and_the_file_picker() {
    let permissions = default_permissions();

    assert_eq!(permissions, ["core:default", "dialog:allow-open"]);
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
