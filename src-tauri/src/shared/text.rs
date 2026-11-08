use crate::error::{AppError, AppResult};

pub fn require_text(label: &str, value: &str, max_length: usize) -> AppResult<String> {
    let trimmed = value.trim();
    let is_blank = trimmed.is_empty();
    if is_blank {
        return Err(AppError::Validation(format!("{label} cannot be empty")));
    }
    let is_too_long = trimmed.chars().count() > max_length;
    if is_too_long {
        return Err(AppError::Validation(format!(
            "{label} cannot exceed {max_length} characters"
        )));
    }
    Ok(trimmed.to_string())
}

pub fn optional_text(value: Option<String>) -> Option<String> {
    let trimmed = value.map(|text| text.trim().to_string())?;
    let is_blank = trimmed.is_empty();
    if is_blank {
        return None;
    }
    Some(trimmed)
}

pub fn text_or_empty(value: Option<String>) -> String {
    value
        .map(|text| text.trim().to_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn require_text_trims_and_returns_the_value() {
        assert_eq!(require_text("name", "  ORBIT  ", 10).unwrap(), "ORBIT");
    }

    #[test]
    fn require_text_rejects_blank_values_naming_the_field() {
        let error = require_text("board name", "   ", 10).unwrap_err();

        assert!(
            matches!(&error, AppError::Validation(message) if message == "board name cannot be empty")
        );
    }

    #[test]
    fn require_text_enforces_the_maximum_length_in_characters() {
        assert!(require_text("name", "ççççç", 5).is_ok());
        assert!(matches!(
            require_text("name", "çççççç", 5),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn require_text_measures_length_after_trimming() {
        assert!(require_text("name", "  abc  ", 3).is_ok());
    }

    #[test]
    fn optional_text_turns_blank_into_none_and_trims_the_rest() {
        assert_eq!(optional_text(None), None);
        assert_eq!(optional_text(Some("   ".into())), None);
        assert_eq!(optional_text(Some(String::new())), None);
        assert_eq!(optional_text(Some(" x ".into())), Some("x".to_string()));
    }

    #[test]
    fn text_or_empty_defaults_to_an_empty_string() {
        assert_eq!(text_or_empty(None), "");
        assert_eq!(text_or_empty(Some("  hi ".into())), "hi");
    }
}
