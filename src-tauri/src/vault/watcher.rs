use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher as _};

use super::indexer::{ATTACHMENTS_DIRECTORY, is_indexable_path, to_relative};
use crate::error::{AppError, AppResult};

/// Quiet time after the last file event before the changes are applied.
pub const DEFAULT_DEBOUNCE: Duration = Duration::from_millis(400);
/// A constant stream of events (a sync tool, a big copy) is still applied at least this often.
pub const MAX_WAIT: Duration = Duration::from_secs(3);

/// What changed in the vault since the last flush.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct ChangeBatch {
    /// Note files (relative, `/` separated) that were created, edited, moved or removed.
    pub files: BTreeSet<String>,
    /// A folder changed (created, renamed, moved or removed): the safest answer is a full scan.
    pub needs_full_scan: bool,
}

impl ChangeBatch {
    pub fn is_empty(&self) -> bool {
        self.files.is_empty() && !self.needs_full_scan
    }

    fn merge(&mut self, other: ChangeBatch) {
        self.files.extend(other.files);
        self.needs_full_scan |= other.needs_full_scan;
    }
}

/// Turns a file system event into the part of the vault it affects. Access events, hidden
/// paths, the attachments directory, temporary files and files that are not Markdown notes are
/// ignored; a path that is (or looks like) a folder asks for a full scan.
pub fn batch_from_event(vault_root: &Path, event: &Event) -> ChangeBatch {
    let mut batch = ChangeBatch::default();
    let is_access = matches!(event.kind, EventKind::Access(_));
    if is_access {
        return batch;
    }
    for path in &event.paths {
        let Some(relative) = to_relative(vault_root, path) else {
            continue;
        };
        if is_indexable_path(&relative) {
            batch.files.insert(relative);
        } else if is_folder_event(&relative, path) {
            batch.needs_full_scan = true;
        }
    }
    batch
}

fn is_folder_event(relative: &str, path: &Path) -> bool {
    let is_ignorable = relative.split('/').any(|segment| segment.starts_with('.'))
        || relative.split('/').next() == Some(ATTACHMENTS_DIRECTORY);
    if is_ignorable {
        return false;
    }
    let looks_like_a_folder = path.extension().is_none();
    path.is_dir() || looks_like_a_folder
}

enum Message {
    Event(Event),
    Stop,
}

/// Watches the vault directory and hands debounced batches of changes to a callback. Dropping it
/// stops watching.
pub struct VaultWatcher {
    watcher: Option<RecommendedWatcher>,
    sender: Sender<Message>,
    worker: Option<JoinHandle<()>>,
}

impl VaultWatcher {
    pub fn start<F>(vault_root: PathBuf, debounce: Duration, on_changes: F) -> AppResult<Self>
    where
        F: Fn(ChangeBatch) + Send + 'static,
    {
        let (sender, receiver) = mpsc::channel::<Message>();
        let event_sender = sender.clone();
        let mut watcher =
            notify::recommended_watcher(move |result: notify::Result<Event>| match result {
                Ok(event) => {
                    let _ = event_sender.send(Message::Event(event));
                }
                Err(error) => log::warn!("vault watcher error: {error}"),
            })
            .map_err(watch_error)?;
        watcher
            .watch(&vault_root, RecursiveMode::Recursive)
            .map_err(watch_error)?;

        let worker = thread::Builder::new()
            .name("vault-watcher".into())
            .spawn(move || run_debouncer(&vault_root, debounce, &receiver, &on_changes))?;
        Ok(Self {
            watcher: Some(watcher),
            sender,
            worker: Some(worker),
        })
    }
}

impl Drop for VaultWatcher {
    fn drop(&mut self) {
        // Dropping the notify watcher first stops new events from arriving.
        self.watcher.take();
        let _ = self.sender.send(Message::Stop);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn watch_error(error: notify::Error) -> AppError {
    log::error!("could not watch the vault: {error}");
    AppError::Io
}

fn run_debouncer<F>(
    vault_root: &Path,
    debounce: Duration,
    receiver: &mpsc::Receiver<Message>,
    on_changes: &F,
) where
    F: Fn(ChangeBatch),
{
    let mut pending = ChangeBatch::default();
    let mut first_event_at: Option<Instant> = None;
    loop {
        let received = if pending.is_empty() {
            receiver.recv().map_err(|_| RecvTimeoutError::Disconnected)
        } else {
            receiver.recv_timeout(debounce)
        };
        match received {
            Ok(Message::Event(event)) => {
                let batch = batch_from_event(vault_root, &event);
                if !batch.is_empty() {
                    pending.merge(batch);
                    first_event_at.get_or_insert_with(Instant::now);
                }
                let waited_too_long =
                    first_event_at.is_some_and(|start| start.elapsed() >= MAX_WAIT);
                if waited_too_long {
                    flush(&mut pending, &mut first_event_at, on_changes);
                }
            }
            Ok(Message::Stop) | Err(RecvTimeoutError::Disconnected) => {
                flush(&mut pending, &mut first_event_at, on_changes);
                return;
            }
            Err(RecvTimeoutError::Timeout) => flush(&mut pending, &mut first_event_at, on_changes),
        }
    }
}

fn flush<F>(pending: &mut ChangeBatch, first_event_at: &mut Option<Instant>, on_changes: &F)
where
    F: Fn(ChangeBatch),
{
    *first_event_at = None;
    if pending.is_empty() {
        return;
    }
    on_changes(std::mem::take(pending));
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, CreateKind, ModifyKind, RemoveKind};
    use std::fs;
    use std::sync::{Arc, Mutex};

    fn write(root: &Path, relative: &str, content: &str) {
        let path = root.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("creates dirs");
        }
        fs::write(path, content).expect("writes");
    }

    fn event(kind: EventKind, paths: &[PathBuf]) -> Event {
        let mut event = Event::new(kind);
        for path in paths {
            event = event.add_path(path.clone());
        }
        event
    }

    fn files(batch: &ChangeBatch) -> Vec<&str> {
        batch.files.iter().map(String::as_str).collect()
    }

    // ---- batch_from_event

    #[test]
    fn note_events_become_relative_paths_and_other_files_are_ignored() {
        let vault = tempfile::tempdir().expect("vault");
        let root = vault.path();
        let created = event(
            EventKind::Create(CreateKind::File),
            &[
                root.join("a.md"),
                root.join("dir").join("b.md"),
                root.join("picture.png"),
                root.join("notes.txt"),
            ],
        );

        let batch = batch_from_event(root, &created);

        assert_eq!(files(&batch), ["a.md", "dir/b.md"]);
        assert!(!batch.needs_full_scan);
    }

    #[test]
    fn access_events_hidden_paths_the_attachments_directory_and_temp_files_are_ignored() {
        let vault = tempfile::tempdir().expect("vault");
        let root = vault.path();
        let noisy = event(
            EventKind::Modify(ModifyKind::Any),
            &[
                root.join(".hidden").join("x.md"),
                root.join(".orbit-tmp-123"),
                root.join("attachments").join("image.png"),
                root.join("attachments").join("notes.md"),
                root.join(".git"),
            ],
        );
        let access = event(EventKind::Access(AccessKind::Any), &[root.join("a.md")]);

        assert!(batch_from_event(root, &noisy).is_empty());
        assert!(batch_from_event(root, &access).is_empty());
    }

    #[test]
    fn a_folder_event_asks_for_a_full_scan() {
        let vault = tempfile::tempdir().expect("vault");
        let root = vault.path();
        fs::create_dir(root.join("Projects")).expect("creates dir");

        let created = batch_from_event(
            root,
            &event(
                EventKind::Create(CreateKind::Folder),
                &[root.join("Projects")],
            ),
        );
        let removed = batch_from_event(
            root,
            &event(EventKind::Remove(RemoveKind::Folder), &[root.join("Gone")]),
        );

        assert!(created.needs_full_scan);
        assert!(removed.needs_full_scan);
        assert!(created.files.is_empty());
    }

    #[test]
    fn paths_outside_the_vault_are_ignored() {
        let vault = tempfile::tempdir().expect("vault");
        let elsewhere = tempfile::tempdir().expect("elsewhere");

        let batch = batch_from_event(
            vault.path(),
            &event(
                EventKind::Create(CreateKind::File),
                &[elsewhere.path().join("a.md")],
            ),
        );

        assert!(batch.is_empty());
    }

    #[test]
    fn batches_merge_without_duplicates() {
        let mut first = ChangeBatch::default();
        first.files.insert("a.md".into());
        let mut second = ChangeBatch::default();
        second.files.insert("a.md".into());
        second.files.insert("b.md".into());
        second.needs_full_scan = true;

        first.merge(second);

        assert_eq!(files(&first), ["a.md", "b.md"]);
        assert!(first.needs_full_scan);
        assert!(!first.is_empty());
        assert!(ChangeBatch::default().is_empty());
    }

    // ---- the live watcher

    type Received = Arc<Mutex<Vec<ChangeBatch>>>;

    fn collecting_watcher(root: &Path, debounce: Duration) -> (VaultWatcher, Received) {
        let received: Received = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&received);
        let watcher = VaultWatcher::start(root.to_path_buf(), debounce, move |batch| {
            sink.lock().expect("lock").push(batch);
        })
        .expect("starts");
        (watcher, received)
    }

    fn wait_until(mut condition: impl FnMut() -> bool) -> bool {
        let deadline = Instant::now() + Duration::from_secs(15);
        while Instant::now() < deadline {
            if condition() {
                return true;
            }
            thread::sleep(Duration::from_millis(50));
        }
        false
    }

    fn seen_files(received: &Received) -> BTreeSet<String> {
        received
            .lock()
            .expect("lock")
            .iter()
            .flat_map(|batch| batch.files.iter().cloned())
            .collect()
    }

    #[test]
    fn a_note_written_while_watching_arrives_as_one_debounced_batch() {
        let vault = tempfile::tempdir().expect("vault");
        let (watcher, received) = collecting_watcher(vault.path(), Duration::from_millis(150));

        for index in 0..5 {
            write(vault.path(), "burst.md", &format!("# Version {index}\n"));
        }
        let arrived = wait_until(|| seen_files(&received).contains("burst.md"));
        drop(watcher);

        assert!(arrived, "the watcher never reported burst.md");
        let batches = received.lock().expect("lock");
        assert!(
            batches.len() <= 2,
            "a burst of writes should be coalesced, got {}",
            batches.len()
        );
    }

    #[test]
    fn nested_notes_deletions_and_new_folders_are_reported() {
        let vault = tempfile::tempdir().expect("vault");
        write(vault.path(), "dir/old.md", "# Old\n");
        let (watcher, received) = collecting_watcher(vault.path(), Duration::from_millis(100));

        write(vault.path(), "dir/nested.md", "# Nested\n");
        fs::remove_file(vault.path().join("dir/old.md")).expect("removes");
        fs::create_dir(vault.path().join("fresh")).expect("creates dir");
        let arrived = wait_until(|| {
            let seen = seen_files(&received);
            let folder_seen = received
                .lock()
                .expect("lock")
                .iter()
                .any(|batch| batch.needs_full_scan);
            seen.contains("dir/nested.md") && seen.contains("dir/old.md") && folder_seen
        });
        drop(watcher);

        assert!(arrived, "missing events: {:?}", seen_files(&received));
    }

    #[test]
    fn nothing_is_reported_for_files_that_are_not_notes() {
        let vault = tempfile::tempdir().expect("vault");
        let (watcher, received) = collecting_watcher(vault.path(), Duration::from_millis(100));

        write(vault.path(), "picture.png", "binary-ish");
        write(vault.path(), "attachments/pasted.png", "binary-ish");
        write(vault.path(), "real.md", "# Real\n");
        let arrived = wait_until(|| seen_files(&received).contains("real.md"));
        drop(watcher);

        assert!(arrived);
        assert_eq!(
            seen_files(&received),
            BTreeSet::from(["real.md".to_string()])
        );
    }

    #[test]
    fn dropping_the_watcher_flushes_what_is_pending_and_stops_cleanly() {
        let vault = tempfile::tempdir().expect("vault");
        let (watcher, received) = collecting_watcher(vault.path(), Duration::from_secs(30));

        write(vault.path(), "late.md", "# Late\n");
        let queued = wait_until(|| {
            thread::sleep(Duration::from_millis(300));
            true
        });
        drop(watcher);

        assert!(queued);
        assert!(seen_files(&received).contains("late.md"));
        write(vault.path(), "after.md", "# After\n");
        thread::sleep(Duration::from_millis(500));
        assert!(!seen_files(&received).contains("after.md"));
    }

    #[test]
    fn starting_on_a_missing_directory_fails_with_an_io_error() {
        let vault = tempfile::tempdir().expect("vault");
        let missing = vault.path().join("ghost");

        let result = VaultWatcher::start(missing, DEFAULT_DEBOUNCE, |_| {});

        assert!(matches!(result, Err(AppError::Io)));
    }
}
