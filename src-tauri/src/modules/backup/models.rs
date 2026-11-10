use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExportBackupInput {
    pub destination_path: String,
    #[serde(default)]
    pub overwrite: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    pub path: String,
    pub size_bytes: u32,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ImportBackupInput {
    pub source_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub backup_schema_version: u32,
    pub current_schema_version: u32,
    pub was_upgraded: bool,
    pub safety_backup_path: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_input_defaults_to_not_overwriting() {
        let input: ExportBackupInput =
            serde_json::from_str(r#"{ "destinationPath": "/tmp/orbit.db" }"#).expect("parses");
        let overwriting: ExportBackupInput =
            serde_json::from_str(r#"{ "destinationPath": "/tmp/orbit.db", "overwrite": true }"#)
                .expect("parses");
        let missing: Result<ExportBackupInput, _> = serde_json::from_str("{}");

        assert!(!input.overwrite);
        assert!(overwriting.overwrite);
        assert!(missing.is_err());
    }

    #[test]
    fn import_input_requires_a_source_path() {
        let input: ImportBackupInput =
            serde_json::from_str(r#"{ "sourcePath": "/tmp/orbit.db" }"#).expect("parses");
        let missing: Result<ImportBackupInput, _> = serde_json::from_str("{}");

        assert_eq!(input.source_path, "/tmp/orbit.db");
        assert!(missing.is_err());
    }

    #[test]
    fn results_serialize_with_camel_case_keys() {
        let file = serde_json::to_value(BackupFile {
            path: "a.db".into(),
            size_bytes: 10,
        })
        .expect("serializes");
        let report = serde_json::to_value(ImportReport {
            backup_schema_version: 9,
            current_schema_version: 12,
            was_upgraded: true,
            safety_backup_path: None,
        })
        .expect("serializes");

        assert_eq!(file["sizeBytes"], 10);
        assert_eq!(report["backupSchemaVersion"], 9);
        assert_eq!(report["currentSchemaVersion"], 12);
        assert_eq!(report["wasUpgraded"], true);
        assert_eq!(report["safetyBackupPath"], serde_json::Value::Null);
    }
}
