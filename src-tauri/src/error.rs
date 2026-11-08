use serde::{Serialize, Serializer};
use specta::{Type, Types, datatype::DataType};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0} not found")]
    NotFound(String),
    #[error("{0}")]
    Validation(String),
    #[error("{0}")]
    Conflict(String),
    #[error("the requested move is not allowed")]
    InvalidMove,
    #[error("a file operation failed")]
    Io,
    #[error("a database operation failed")]
    Database,
    #[error("an unexpected error occurred")]
    Internal,
}

pub type AppResult<T> = Result<T, AppError>;

#[derive(Serialize, Type)]
struct ErrorPayload {
    code: &'static str,
    message: String,
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::NotFound(_) => "NOT_FOUND",
            Self::Validation(_) => "VALIDATION",
            Self::Conflict(_) => "CONFLICT",
            Self::InvalidMove => "INVALID_MOVE",
            Self::Io => "IO",
            Self::Database => "DATABASE",
            Self::Internal => "INTERNAL",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let payload = ErrorPayload {
            code: self.code(),
            message: self.to_string(),
        };
        payload.serialize(serializer)
    }
}

impl Type for AppError {
    fn definition(types: &mut Types) -> DataType {
        ErrorPayload::definition(types)
    }
}

impl From<std::io::Error> for AppError {
    fn from(source: std::io::Error) -> Self {
        log::error!("io error: {source}");
        Self::Io
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(source: rusqlite::Error) -> Self {
        log::error!("database error: {source}");
        Self::Database
    }
}

impl From<rusqlite_migration::Error> for AppError {
    fn from(source: rusqlite_migration::Error) -> Self {
        log::error!("migration error: {source}");
        Self::Database
    }
}

impl From<serde_json::Error> for AppError {
    fn from(source: serde_json::Error) -> Self {
        log::error!("json error: {source}");
        Self::Internal
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn serialized(error: &AppError) -> serde_json::Value {
        serde_json::to_value(error).expect("error serializes")
    }

    #[test]
    fn serializes_as_code_and_message() {
        let error = AppError::NotFound("task".into());

        let expected = serde_json::json!({ "code": "NOT_FOUND", "message": "task not found" });

        assert_eq!(serialized(&error), expected);
    }

    #[test]
    fn every_variant_has_a_distinct_code() {
        let errors = [
            AppError::NotFound(String::new()),
            AppError::Validation(String::new()),
            AppError::Conflict(String::new()),
            AppError::InvalidMove,
            AppError::Io,
            AppError::Database,
            AppError::Internal,
        ];

        let mut codes: Vec<_> = errors.iter().map(AppError::code).collect();
        codes.sort_unstable();
        codes.dedup();

        assert_eq!(codes.len(), errors.len());
    }

    #[test]
    fn database_error_hides_internal_details() {
        let error = AppError::from(rusqlite::Error::InvalidQuery);

        let payload = serialized(&error);

        assert_eq!(payload["message"], "a database operation failed");
    }

    #[test]
    fn json_error_hides_internal_details() {
        let source = serde_json::from_str::<serde_json::Value>("{ secret").unwrap_err();

        let payload = serialized(&AppError::from(source));

        assert_eq!(payload["code"], "INTERNAL");
        assert_eq!(payload["message"], "an unexpected error occurred");
    }

    #[test]
    fn io_error_hides_internal_details() {
        let source = std::io::Error::other("secret path /private/data");

        let payload = serialized(&AppError::from(source));

        assert_eq!(payload["message"], "a file operation failed");
    }
}
