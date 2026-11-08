use std::ffi::OsStr;
use std::io::ErrorKind;
use std::path::Path;

pub fn remove_stored_files(directory: &Path, stored_names: &[String]) {
    for stored_name in stored_names {
        let is_plain_file_name =
            Path::new(stored_name).file_name() == Some(OsStr::new(stored_name));
        if !is_plain_file_name {
            log::warn!("skipping file with unsafe stored name '{stored_name}'");
            continue;
        }
        if let Err(error) = std::fs::remove_file(directory.join(stored_name)) {
            let was_already_gone = error.kind() == ErrorKind::NotFound;
            if !was_already_gone {
                log::warn!("could not remove stored file '{stored_name}': {error}");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(directory: &Path, name: &str) -> std::path::PathBuf {
        let path = directory.join(name);
        std::fs::write(&path, "data").expect("writes");
        path
    }

    #[test]
    fn removes_the_listed_files_and_keeps_the_others() {
        let directory = tempfile::tempdir().expect("temp dir");
        let doomed = write(directory.path(), "doomed");
        let kept = write(directory.path(), "kept");

        remove_stored_files(directory.path(), &["doomed".to_string()]);

        assert!(!doomed.exists());
        assert!(kept.exists());
    }

    #[test]
    fn ignores_files_that_are_already_gone() {
        let directory = tempfile::tempdir().expect("temp dir");
        let kept = write(directory.path(), "kept");

        remove_stored_files(
            directory.path(),
            &["missing".to_string(), "kept".to_string()],
        );

        assert!(!kept.exists());
    }

    #[test]
    fn never_deletes_outside_the_directory() {
        let directory = tempfile::tempdir().expect("temp dir");
        let outside = tempfile::tempdir().expect("outside dir");
        let precious = write(outside.path(), "precious");
        let outside_name = outside
            .path()
            .file_name()
            .expect("has a name")
            .to_string_lossy()
            .to_string();
        let escaping = format!("../{outside_name}/precious");

        remove_stored_files(directory.path(), &[escaping, "/etc/passwd".to_string()]);

        assert!(precious.exists());
    }

    #[test]
    fn rejects_nested_relative_paths() {
        let directory = tempfile::tempdir().expect("temp dir");
        std::fs::create_dir(directory.path().join("sub")).expect("creates sub");
        let nested = write(&directory.path().join("sub"), "file");

        remove_stored_files(directory.path(), &["sub/file".to_string()]);

        assert!(nested.exists());
    }

    #[test]
    fn handles_an_empty_list() {
        let directory = tempfile::tempdir().expect("temp dir");

        remove_stored_files(directory.path(), &[]);

        assert!(directory.path().exists());
    }
}
