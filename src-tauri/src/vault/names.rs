use crate::error::{AppError, AppResult};

/// Longest accepted file or folder name, in characters. Well under the 255 limit of common
/// file systems, which count bytes or UTF-16 units.
pub const NAME_MAX_LENGTH: usize = 120;

const FORBIDDEN_CHARACTERS: &str = "<>:\"/\\|?*";
const RESERVED_WINDOWS_NAMES: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Checks that `raw` can safely be a single file or folder name on every platform and returns
/// it trimmed. Rejects separators, traversal, hidden names, characters Windows forbids,
/// reserved Windows device names and trailing dots or spaces.
pub fn validate_name(label: &str, raw: &str) -> AppResult<String> {
    let name = raw.trim();
    let invalid = |reason: &str| AppError::Validation(format!("{label} {reason}"));

    if name.is_empty() {
        return Err(invalid("cannot be empty"));
    }
    if name.chars().count() > NAME_MAX_LENGTH {
        return Err(invalid(&format!(
            "cannot exceed {NAME_MAX_LENGTH} characters"
        )));
    }
    let has_forbidden_character = name
        .chars()
        .any(|c| FORBIDDEN_CHARACTERS.contains(c) || c.is_control());
    if has_forbidden_character {
        return Err(invalid("contains a character that is not allowed"));
    }
    if name.starts_with('.') {
        return Err(invalid("cannot start with a dot"));
    }
    if name.ends_with('.') {
        return Err(invalid("cannot end with a dot"));
    }
    let stem = name.split('.').next().unwrap_or(name).trim_end();
    let is_reserved = RESERVED_WINDOWS_NAMES
        .iter()
        .any(|reserved| reserved.eq_ignore_ascii_case(stem));
    if is_reserved {
        return Err(invalid("is a reserved name"));
    }
    Ok(name.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn accepts(name: &str) -> bool {
        validate_name("name", name).is_ok()
    }

    #[test]
    fn ordinary_names_are_accepted_and_trimmed() {
        assert_eq!(
            validate_name("name", "  Meeting notes  ").expect("valid"),
            "Meeting notes"
        );
        for good in [
            "a",
            "Spring Boot",
            "Ação rápida",
            "日本語",
            "v1.2",
            "notes (draft)",
            "a-b_c",
            "2026-11-08",
        ] {
            assert!(accepts(good), "{good} should be accepted");
        }
    }

    #[test]
    fn empty_and_blank_names_are_rejected() {
        assert!(!accepts(""));
        assert!(!accepts("   "));
    }

    #[test]
    fn separators_traversal_and_hidden_names_are_rejected() {
        for bad in [
            "a/b", "a\\b", "..", ".", ".hidden", "..sneaky", "/abs", "C:\\x",
        ] {
            assert!(!accepts(bad), "{bad} should be rejected");
        }
    }

    #[test]
    fn characters_windows_forbids_and_control_characters_are_rejected() {
        for bad in [
            "a<b",
            "a>b",
            "a:b",
            "a\"b",
            "a|b",
            "a?b",
            "a*b",
            "tab\there",
            "new\nline",
            "nul\0byte",
        ] {
            assert!(!accepts(bad), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn trailing_dots_and_reserved_device_names_are_rejected() {
        for bad in [
            "name.", "CON", "con", "Nul", "aux.txt", "COM1", "lpt9.md", "PRN ",
        ] {
            assert!(!accepts(bad), "{bad:?} should be rejected");
        }
        assert!(accepts("console"));
        assert!(accepts("COM10"));
    }

    #[test]
    fn the_length_limit_counts_characters_not_bytes() {
        let at_limit = "ç".repeat(NAME_MAX_LENGTH);
        let over_limit = "ç".repeat(NAME_MAX_LENGTH + 1);

        assert!(accepts(&at_limit));
        assert!(!accepts(&over_limit));
    }

    #[test]
    fn the_error_names_what_was_rejected() {
        let error = validate_name("folder name", "").expect_err("rejects");

        assert!(error.to_string().starts_with("folder name"));
    }
}
