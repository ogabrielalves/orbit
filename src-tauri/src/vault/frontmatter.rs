#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Frontmatter {
    pub id: Option<String>,
    pub created: Option<String>,
    pub tags: Vec<String>,
    extra: Vec<Entry>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Entry {
    key: String,
    lines: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedNote {
    pub frontmatter: Frontmatter,
    pub body: String,
    pub has_frontmatter: bool,
}

const FENCE: &str = "---";
const BOM: char = '\u{feff}';

impl Frontmatter {
    pub fn new(id: &str, created: &str) -> Self {
        Self {
            id: Some(id.to_string()),
            created: Some(created.to_string()),
            tags: Vec::new(),
            extra: Vec::new(),
        }
    }
}

pub fn parse(content: &str) -> ParsedNote {
    let text = content.strip_prefix(BOM).unwrap_or(content);
    let Some((block, body)) = split_block(text) else {
        return ParsedNote {
            frontmatter: Frontmatter::default(),
            body: text.to_string(),
            has_frontmatter: false,
        };
    };
    ParsedNote {
        frontmatter: parse_block(&block),
        body: body.to_string(),
        has_frontmatter: true,
    }
}

pub fn render(frontmatter: &Frontmatter, body: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    if let Some(id) = &frontmatter.id {
        lines.push(format!("id: {}", scalar(id)));
    }
    if let Some(created) = &frontmatter.created {
        lines.push(format!("created: {}", scalar(created)));
    }
    if !frontmatter.tags.is_empty() {
        let tags: Vec<String> = frontmatter.tags.iter().map(|tag| scalar(tag)).collect();
        lines.push(format!("tags: [{}]", tags.join(", ")));
    }
    for entry in &frontmatter.extra {
        lines.extend(entry.lines.iter().cloned());
    }

    let mut output = String::new();
    output.push_str(FENCE);
    output.push('\n');
    for line in lines {
        output.push_str(&line);
        output.push('\n');
    }
    output.push_str(FENCE);
    output.push('\n');
    output.push_str(body);
    output
}

fn split_block(text: &str) -> Option<(Vec<&str>, &str)> {
    let mut rest = text;
    let (first, after_first) = next_line(rest)?;
    if first.trim_end() != FENCE {
        return None;
    }
    rest = after_first;

    let mut block = Vec::new();
    loop {
        let (line, after) = next_line(rest)?;
        let trimmed = line.trim_end();
        let closes = trimmed == FENCE || trimmed == "...";
        if closes {
            return Some((block, after));
        }
        block.push(line.trim_end_matches('\r'));
        rest = after;
    }
}

fn next_line(text: &str) -> Option<(&str, &str)> {
    if text.is_empty() {
        return None;
    }
    match text.find('\n') {
        Some(index) => Some((&text[..index], &text[index + 1..])),
        None => Some((text, "")),
    }
}

fn parse_block(lines: &[&str]) -> Frontmatter {
    let mut entries: Vec<Entry> = Vec::new();
    for line in lines {
        match key_of(line) {
            Some(key) => entries.push(Entry {
                key,
                lines: vec![(*line).to_string()],
            }),
            None => {
                if let Some(last) = entries.last_mut() {
                    last.lines.push((*line).to_string());
                }
            }
        }
    }

    let mut frontmatter = Frontmatter::default();
    for entry in entries {
        match entry.key.as_str() {
            "id" => frontmatter.id = non_empty(single_value(&entry)),
            "created" => frontmatter.created = non_empty(single_value(&entry)),
            "tags" => frontmatter.tags = tag_list(&entry),
            _ => frontmatter.extra.push(entry),
        }
    }
    frontmatter
}

fn key_of(line: &str) -> Option<String> {
    let starts_a_key = line
        .chars()
        .next()
        .is_some_and(|c| c.is_ascii_alphabetic() || c == '_');
    if !starts_a_key {
        return None;
    }
    let (key, _) = line.split_once(':')?;
    let is_plain_key = key
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    is_plain_key.then(|| key.to_string())
}

fn value_after_key(entry: &Entry) -> &str {
    entry
        .lines
        .first()
        .and_then(|line| line.split_once(':'))
        .map_or("", |(_, value)| value.trim())
}

fn single_value(entry: &Entry) -> String {
    unquote(value_after_key(entry))
}

fn non_empty(value: String) -> Option<String> {
    (!value.is_empty()).then_some(value)
}

fn tag_list(entry: &Entry) -> Vec<String> {
    let inline = value_after_key(entry);
    let mut raw: Vec<String> = Vec::new();
    if let Some(list) = inline.strip_prefix('[') {
        let inside = list.strip_suffix(']').unwrap_or(list);
        raw.extend(split_outside_quotes(inside));
    } else if !inline.is_empty() {
        raw.extend(split_outside_quotes(inline));
    }
    for line in entry.lines.iter().skip(1) {
        if let Some(item) = line.trim().strip_prefix('-') {
            raw.push(item.trim().to_string());
        }
    }

    let mut tags: Vec<String> = Vec::new();
    for item in raw {
        let tag = unquote(item.trim())
            .trim_start_matches('#')
            .trim()
            .to_string();
        let is_new = !tag.is_empty() && !tags.contains(&tag);
        if is_new {
            tags.push(tag);
        }
    }
    tags
}

fn split_outside_quotes(text: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    for c in text.chars() {
        match (quote, c) {
            (None, ',') => parts.push(std::mem::take(&mut current)),
            (None, '"' | '\'') => {
                quote = Some(c);
                current.push(c);
            }
            (Some(open), _) if c == open => {
                quote = None;
                current.push(c);
            }
            _ => current.push(c),
        }
    }
    parts.push(current);
    parts
}

fn unquote(value: &str) -> String {
    let trimmed = value.trim();
    for quote in ['"', '\''] {
        let wrapped = trimmed.len() >= 2 && trimmed.starts_with(quote) && trimmed.ends_with(quote);
        if wrapped {
            let inner = &trimmed[1..trimmed.len() - 1];
            return if quote == '"' {
                inner.replace("\\\"", "\"").replace("\\\\", "\\")
            } else {
                inner.replace("''", "'")
            };
        }
    }
    trimmed.to_string()
}

fn scalar(value: &str) -> String {
    let starts_with_indicator = value
        .chars()
        .next()
        .is_some_and(|c| "-?[]{},#&*!|>'\"%@`".contains(c));
    let needs_quotes = value.is_empty()
        || value != value.trim()
        || starts_with_indicator
        || value.contains(": ")
        || value.ends_with(':')
        || value.contains(" #")
        || value.chars().any(|c| ",[]{}\"'\n".contains(c));
    if !needs_quotes {
        return value.to_string();
    }
    let escaped = value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', " ");
    format!("\"{escaped}\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "---\nid: 01933b6e-6b0e-7c4a-9f3e-2a4d1c8e5f10\ncreated: 2026-11-08T10:00:00Z\ntags: [java, backend]\n---\n\n# Spring Boot\n\nUses [[Hibernate]].\n";

    #[test]
    fn parses_the_documented_example() {
        let note = parse(SAMPLE);

        assert!(note.has_frontmatter);
        assert_eq!(
            note.frontmatter.id.as_deref(),
            Some("01933b6e-6b0e-7c4a-9f3e-2a4d1c8e5f10")
        );
        assert_eq!(
            note.frontmatter.created.as_deref(),
            Some("2026-11-08T10:00:00Z")
        );
        assert_eq!(note.frontmatter.tags, ["java", "backend"]);
        assert_eq!(note.body, "\n# Spring Boot\n\nUses [[Hibernate]].\n");
    }

    #[test]
    fn rendering_a_parsed_canonical_note_gives_back_the_same_text() {
        let note = parse(SAMPLE);

        assert_eq!(render(&note.frontmatter, &note.body), SAMPLE);
    }

    #[test]
    fn a_note_without_frontmatter_is_all_body() {
        let note = parse("# Just a title\n\ntext\n");

        assert!(!note.has_frontmatter);
        assert_eq!(note.frontmatter, Frontmatter::default());
        assert_eq!(note.body, "# Just a title\n\ntext\n");
    }

    #[test]
    fn an_unclosed_block_is_not_frontmatter() {
        let text = "---\nid: x\n\n# Heading with no closing fence\n";

        let note = parse(text);

        assert!(!note.has_frontmatter);
        assert_eq!(note.body, text);
    }

    #[test]
    fn an_empty_or_fence_only_input_is_handled() {
        assert!(!parse("").has_frontmatter);
        assert!(!parse("---").has_frontmatter);
        let empty_block = parse("---\n---\nbody");
        assert!(empty_block.has_frontmatter);
        assert_eq!(empty_block.body, "body");
        assert_eq!(empty_block.frontmatter, Frontmatter::default());
    }

    #[test]
    fn a_horizontal_rule_later_in_the_text_is_not_frontmatter() {
        let text = "intro\n---\nid: not-a-key\n---\n";

        assert!(!parse(text).has_frontmatter);
    }

    #[test]
    fn crlf_files_and_a_leading_bom_are_understood() {
        let text = "\u{feff}---\r\nid: abc\r\ncreated: 2026-01-01T00:00:00Z\r\n---\r\nbody\r\n";

        let note = parse(text);

        assert_eq!(note.frontmatter.id.as_deref(), Some("abc"));
        assert_eq!(
            note.frontmatter.created.as_deref(),
            Some("2026-01-01T00:00:00Z")
        );
        assert_eq!(note.body, "body\r\n");
    }

    #[test]
    fn the_closing_fence_may_be_three_dots() {
        let note = parse("---\nid: abc\n...\nbody");

        assert_eq!(note.frontmatter.id.as_deref(), Some("abc"));
        assert_eq!(note.body, "body");
    }

    #[test]
    fn tags_accept_inline_lists_block_lists_quotes_hashes_and_duplicates() {
        let inline = parse("---\ntags: [\"a, b\", 'c', #d, d, , e]\n---\n");
        let block = parse("---\ntags:\n  - one\n  - \"two\"\n- three\n---\n");
        let bare = parse("---\ntags: solo\n---\n");
        let empty = parse("---\ntags: []\n---\n");

        assert_eq!(inline.frontmatter.tags, ["a, b", "c", "d", "e"]);
        assert_eq!(block.frontmatter.tags, ["one", "two", "three"]);
        assert_eq!(bare.frontmatter.tags, ["solo"]);
        assert!(empty.frontmatter.tags.is_empty());
    }

    #[test]
    fn quoted_scalars_are_unquoted() {
        let note = parse("---\nid: \"abc-123\"\ncreated: '2026-11-08'\n---\n");

        assert_eq!(note.frontmatter.id.as_deref(), Some("abc-123"));
        assert_eq!(note.frontmatter.created.as_deref(), Some("2026-11-08"));
    }

    #[test]
    fn blank_values_count_as_missing() {
        let note = parse("---\nid:\ncreated:   \n---\n");

        assert_eq!(note.frontmatter.id, None);
        assert_eq!(note.frontmatter.created, None);
    }

    #[test]
    fn unknown_keys_including_multi_line_ones_survive_a_round_trip() {
        let text = "---\nid: abc\naliases:\n  - First\n  - Second\ncolor: red # note\ntags: [x]\n---\nbody\n";

        let mut note = parse(text);
        note.frontmatter.tags.push("y".into());
        let rendered = render(&note.frontmatter, &note.body);

        assert_eq!(
            rendered,
            "---\nid: abc\ntags: [x, y]\naliases:\n  - First\n  - Second\ncolor: red # note\n---\nbody\n"
        );
        let reparsed = parse(&rendered);
        assert_eq!(reparsed.frontmatter.tags, ["x", "y"]);
    }

    #[test]
    fn rendering_quotes_values_that_would_break_the_yaml() {
        let mut frontmatter = Frontmatter::new("id-1", "2026-11-08T10:00:00Z");
        frontmatter.tags = vec![
            "plain".into(),
            "with, comma".into(),
            "has \"quotes\"".into(),
            "#hash".into(),
            "-dash".into(),
        ];

        let rendered = render(&frontmatter, "");
        let reparsed = parse(&rendered);

        assert_eq!(
            reparsed.frontmatter.tags,
            ["plain", "with, comma", "has \"quotes\"", "hash", "-dash"]
        );
    }

    #[test]
    fn rendering_without_tags_omits_the_tags_line() {
        let frontmatter = Frontmatter::new("id-1", "2026-11-08T10:00:00Z");

        let rendered = render(&frontmatter, "text");

        assert_eq!(
            rendered,
            "---\nid: id-1\ncreated: 2026-11-08T10:00:00Z\n---\ntext"
        );
    }

    #[test]
    fn a_new_frontmatter_carries_only_id_and_creation_time() {
        let frontmatter = Frontmatter::new("abc", "2026-11-08T10:00:00Z");

        assert_eq!(frontmatter.id.as_deref(), Some("abc"));
        assert_eq!(frontmatter.created.as_deref(), Some("2026-11-08T10:00:00Z"));
        assert!(frontmatter.tags.is_empty());
    }

    #[test]
    fn colons_inside_values_do_not_create_keys() {
        let note =
            parse("---\ncreated: 2026-11-08T10:00:00Z\nsite: https://example.com/a:b\n---\n");

        assert_eq!(
            note.frontmatter.created.as_deref(),
            Some("2026-11-08T10:00:00Z")
        );
        let rendered = render(&note.frontmatter, &note.body);
        assert!(rendered.contains("site: https://example.com/a:b"));
    }
}
