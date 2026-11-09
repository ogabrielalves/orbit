use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::shared::patch::distinguish_null_from_absent;

pub const KEY_LANGUAGE: &str = "language";
pub const KEY_VAULT_PATH: &str = "vault_path";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum Language {
    #[serde(rename = "en")]
    En,
    #[serde(rename = "pt-BR")]
    PtBr,
}

impl Language {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::En => "en",
            Self::PtBr => "pt-BR",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "en" => Some(Self::En),
            "pt-BR" => Some(Self::PtBr),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub language: Option<Language>,
    pub vault_path: Option<String>,
}

impl Settings {
    pub fn from_stored(stored: &HashMap<String, String>) -> Self {
        Self {
            language: stored
                .get(KEY_LANGUAGE)
                .and_then(|value| Language::parse(value)),
            vault_path: stored.get(KEY_VAULT_PATH).cloned(),
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateSettingsInput {
    #[serde(deserialize_with = "distinguish_null_from_absent")]
    #[specta(type = Option<Language>)]
    pub language: Option<Option<Language>>,
    /// Refused by `updateSettings` (it fails with a validation error): choose the vault with
    /// `setupVault`, which validates the directory first.
    pub vault_path: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn falls_back_to_defaults_when_nothing_is_stored() {
        let settings = Settings::from_stored(&HashMap::new());

        assert_eq!(settings, Settings::default());
    }

    #[test]
    fn follows_the_system_language_for_unknown_stored_language() {
        let stored = HashMap::from([(KEY_LANGUAGE.to_string(), "klingon".to_string())]);

        let settings = Settings::from_stored(&stored);

        assert_eq!(settings.language, None);
    }

    #[test]
    fn reads_a_stored_language() {
        let stored = HashMap::from([(KEY_LANGUAGE.to_string(), "pt-BR".to_string())]);

        let settings = Settings::from_stored(&stored);

        assert_eq!(settings.language, Some(Language::PtBr));
    }

    #[test]
    fn ignores_a_leftover_theme_key_in_storage() {
        let stored = HashMap::from([("theme".to_string(), "dark".to_string())]);

        let settings = Settings::from_stored(&stored);

        assert_eq!(settings, Settings::default());
    }

    #[test]
    fn serializes_with_camel_case_and_wire_values() {
        let settings = Settings {
            language: Some(Language::PtBr),
            vault_path: Some("vault".into()),
        };

        let json = serde_json::to_value(&settings).expect("serializes");

        assert_eq!(
            json,
            serde_json::json!({ "language": "pt-BR", "vaultPath": "vault" })
        );
    }

    #[test]
    fn serializes_a_missing_language_as_null() {
        let json = serde_json::to_value(Settings::default()).expect("serializes");

        assert_eq!(
            json,
            serde_json::json!({ "language": null, "vaultPath": null })
        );
    }

    #[test]
    fn update_input_with_a_language_sets_it() {
        let input: UpdateSettingsInput =
            serde_json::from_str(r#"{ "language": "en" }"#).expect("deserializes");

        assert_eq!(input.language, Some(Some(Language::En)));
        assert_eq!(input.vault_path, None);
    }

    #[test]
    fn update_input_with_null_language_clears_it() {
        let input: UpdateSettingsInput =
            serde_json::from_str(r#"{ "language": null }"#).expect("deserializes");

        assert_eq!(input.language, Some(None));
    }

    #[test]
    fn update_input_without_language_leaves_it_unchanged() {
        let input: UpdateSettingsInput =
            serde_json::from_str(r#"{ "vaultPath": "vault" }"#).expect("deserializes");

        assert_eq!(input.language, None);
    }
}
