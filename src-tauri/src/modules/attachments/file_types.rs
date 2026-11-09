/// Attachments are opened with the system default app, so only a fixed list of inert file types
/// is accepted. Anything that can run code (executables, scripts, installers, shortcuts) or
/// render active content (HTML, SVG) is deliberately absent.
const ALLOWED_TYPES: &[(&str, &str)] = &[
    // images
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
    ("bmp", "image/bmp"),
    // documents
    ("pdf", "application/pdf"),
    ("txt", "text/plain"),
    ("md", "text/markdown"),
    ("csv", "text/csv"),
    ("json", "application/json"),
    ("rtf", "application/rtf"),
    ("doc", "application/msword"),
    (
        "docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
    ("xls", "application/vnd.ms-excel"),
    (
        "xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
    ("ppt", "application/vnd.ms-powerpoint"),
    (
        "pptx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ),
    ("odt", "application/vnd.oasis.opendocument.text"),
    ("ods", "application/vnd.oasis.opendocument.spreadsheet"),
    ("odp", "application/vnd.oasis.opendocument.presentation"),
    // archives and media
    ("zip", "application/zip"),
    ("mp3", "audio/mpeg"),
    ("wav", "audio/wav"),
    ("mp4", "video/mp4"),
    ("mov", "video/quicktime"),
    ("webm", "video/webm"),
];

/// Lower-cased extension of `file_name` (without the dot), if it has one.
pub fn extension_of(file_name: &str) -> Option<String> {
    let (stem, extension) = file_name.rsplit_once('.')?;
    let has_extension = !stem.is_empty() && !extension.is_empty();
    has_extension.then(|| extension.to_lowercase())
}

/// MIME type for an allowed extension, ignoring case.
pub fn mime_for_extension(extension: &str) -> Option<&'static str> {
    let lowered = extension.to_lowercase();
    ALLOWED_TYPES
        .iter()
        .find(|(allowed, _)| *allowed == lowered)
        .map(|(_, mime)| *mime)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extension_is_lowercased_and_taken_after_the_last_dot() {
        assert_eq!(extension_of("report.PDF").as_deref(), Some("pdf"));
        assert_eq!(extension_of("archive.tar.zip").as_deref(), Some("zip"));
        assert_eq!(extension_of("my.photo.JPeG").as_deref(), Some("jpeg"));
    }

    #[test]
    fn names_without_a_real_extension_have_none() {
        assert_eq!(extension_of("README"), None);
        assert_eq!(extension_of(".gitignore"), None);
        assert_eq!(extension_of("trailing."), None);
        assert_eq!(extension_of(""), None);
    }

    #[test]
    fn every_listed_type_maps_to_a_mime_ignoring_case() {
        for (extension, mime) in ALLOWED_TYPES {
            assert_eq!(mime_for_extension(extension), Some(*mime));
            assert_eq!(mime_for_extension(&extension.to_uppercase()), Some(*mime));
        }
    }

    #[test]
    fn the_allowed_list_has_no_duplicates_and_only_lowercase_extensions() {
        let mut names: Vec<&str> = ALLOWED_TYPES.iter().map(|(name, _)| *name).collect();
        let total = names.len();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), total);
        assert!(
            ALLOWED_TYPES
                .iter()
                .all(|(name, _)| *name == name.to_lowercase())
        );
    }

    #[test]
    fn executables_scripts_and_active_content_are_not_allowed() {
        for extension in [
            "exe", "bat", "cmd", "com", "msi", "dll", "scr", "lnk", "ps1", "vbs", "sh", "js",
            "jar", "html", "htm", "svg", "app", "dmg", "deb", "reg",
        ] {
            assert_eq!(
                mime_for_extension(extension),
                None,
                "{extension} must be rejected"
            );
        }
    }
}
