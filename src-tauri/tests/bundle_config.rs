#![allow(clippy::expect_used)]

use serde_json::Value;

fn config() -> Value {
    let text = std::fs::read_to_string("tauri.conf.json").expect("reads tauri config");
    serde_json::from_str(&text).expect("parses tauri config")
}

#[test]
fn the_identifier_does_not_end_with_the_macos_bundle_extension() {
    let config = config();
    let identifier = config["identifier"].as_str().expect("identifier");

    assert_eq!(identifier, "dev.orbit.desktop");
    assert!(!identifier.ends_with(".app"));
}

#[test]
fn the_app_version_matches_the_cargo_package_version() {
    let config = config();

    assert_eq!(
        config["version"].as_str().expect("version"),
        env!("CARGO_PKG_VERSION")
    );
}

#[test]
fn the_bundle_declares_its_store_metadata() {
    let config = config();
    let bundle = &config["bundle"];

    for key in [
        "category",
        "shortDescription",
        "longDescription",
        "publisher",
        "copyright",
        "license",
    ] {
        let value = bundle[key].as_str().unwrap_or("");
        assert!(!value.trim().is_empty(), "bundle.{key} is missing");
    }
}
