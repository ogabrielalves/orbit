use serde::{Deserialize, Deserializer};

pub fn distinguish_null_from_absent<'de, T, D>(
    deserializer: D,
) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, Default, Deserialize)]
    #[serde(default)]
    struct Patch {
        #[serde(deserialize_with = "distinguish_null_from_absent")]
        value: Option<Option<String>>,
    }

    fn parse(json: &str) -> Patch {
        serde_json::from_str(json).expect("deserializes")
    }

    #[test]
    fn absent_field_means_unchanged() {
        assert_eq!(parse("{}").value, None);
    }

    #[test]
    fn null_field_means_clear() {
        assert_eq!(parse(r#"{ "value": null }"#).value, Some(None));
    }

    #[test]
    fn present_field_means_set() {
        assert_eq!(
            parse(r#"{ "value": "x" }"#).value,
            Some(Some("x".to_string()))
        );
    }

    #[test]
    fn rejects_a_value_of_the_wrong_type() {
        let result: Result<Patch, _> = serde_json::from_str(r#"{ "value": 1 }"#);

        assert!(result.is_err());
    }
}
