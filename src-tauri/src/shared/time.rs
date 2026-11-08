use chrono::{DateTime, SecondsFormat, Utc};

pub fn now() -> String {
    format(Utc::now())
}

pub fn format(moment: DateTime<Utc>) -> String {
    moment.to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn moment(
        year: i32,
        month: u32,
        day: u32,
        hour: u32,
        minute: u32,
        second: u32,
    ) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(year, month, day, hour, minute, second)
            .single()
            .expect("valid date")
    }

    #[test]
    fn formats_as_iso_8601_utc_with_milliseconds() {
        let formatted = format(moment(2026, 11, 8, 10, 30, 5));

        assert_eq!(formatted, "2026-11-08T10:30:05.000Z");
    }

    #[test]
    fn now_can_be_parsed_back() {
        let parsed = DateTime::parse_from_rfc3339(&now());

        assert!(parsed.is_ok());
    }

    #[test]
    fn timestamps_sort_chronologically_as_text() {
        let earlier = format(moment(2026, 1, 2, 3, 4, 5));
        let later = format(moment(2026, 11, 8, 10, 30, 5));

        assert!(earlier < later);
    }
}
