#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WikiLink {
    pub target: String,
    pub heading: Option<String>,
    pub alias: Option<String>,
    pub start: usize,
    pub end: usize,
}

pub fn title_key(title: &str) -> String {
    title
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

pub fn extract(text: &str) -> Vec<WikiLink> {
    let mut links = Vec::new();
    let mut in_fence = false;
    let mut line_start = 0;
    for line in text.split_inclusive('\n') {
        let trimmed = line.trim_start();
        let toggles_fence = trimmed.starts_with("```") || trimmed.starts_with("~~~");
        if toggles_fence {
            in_fence = !in_fence;
        } else if !in_fence {
            scan_line(line, line_start, &mut links);
        }
        line_start += line.len();
    }
    links
}

pub fn retarget(text: &str, old_title: &str, new_title: &str) -> (String, usize) {
    let wanted = title_key(old_title);
    let mut output = String::with_capacity(text.len());
    let mut cursor = 0;
    let mut changed = 0;
    for link in extract(text) {
        let points_at_old_title = title_key(&link.target) == wanted;
        if !points_at_old_title {
            continue;
        }
        output.push_str(&text[cursor..link.start]);
        output.push_str(&render(
            new_title,
            link.heading.as_deref(),
            link.alias.as_deref(),
        ));
        cursor = link.end;
        changed += 1;
    }
    output.push_str(&text[cursor..]);
    (output, changed)
}

pub fn render(target: &str, heading: Option<&str>, alias: Option<&str>) -> String {
    let mut link = format!("[[{target}");
    if let Some(heading) = heading {
        link.push('#');
        link.push_str(heading);
    }
    if let Some(alias) = alias {
        link.push('|');
        link.push_str(alias);
    }
    link.push_str("]]");
    link
}

fn scan_line(line: &str, line_start: usize, links: &mut Vec<WikiLink>) {
    let bytes = line.as_bytes();
    let mut index = 0;
    let mut in_code = false;
    while index < bytes.len() {
        let byte = bytes[index];
        if byte == b'`' {
            in_code = !in_code;
            index += 1;
            continue;
        }
        let opens_link = !in_code && byte == b'[' && bytes.get(index + 1) == Some(&b'[');
        if !opens_link {
            index += 1;
            continue;
        }
        let is_embed = index > 0 && bytes[index - 1] == b'!';
        let Some(inner_len) = line[index + 2..].find("]]") else {
            return;
        };
        let inner = &line[index + 2..index + 2 + inner_len];
        let end = index + 2 + inner_len + 2;
        let is_nested = inner.contains("[[");
        if is_embed || is_nested {
            index += 2;
            continue;
        }
        if let Some(link) = parse_inner(inner, line_start + index, line_start + end) {
            links.push(link);
        }
        index = end;
    }
}

fn parse_inner(inner: &str, start: usize, end: usize) -> Option<WikiLink> {
    let (target_part, alias) = match inner.split_once('|') {
        Some((target, alias)) => (target, Some(alias.trim().to_string())),
        None => (inner, None),
    };
    let (target, heading) = match target_part.split_once('#') {
        Some((target, heading)) => (target, Some(heading.trim().to_string())),
        None => (target_part, None),
    };
    let target = target.trim();
    let has_no_target = target.is_empty();
    if has_no_target {
        return None;
    }
    Some(WikiLink {
        target: target.to_string(),
        heading: heading.filter(|heading| !heading.is_empty()),
        alias: alias.filter(|alias| !alias.is_empty()),
        start,
        end,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn targets(text: &str) -> Vec<String> {
        extract(text).into_iter().map(|link| link.target).collect()
    }

    #[test]
    fn finds_simple_links_with_their_byte_ranges() {
        let text = "Uses [[Hibernate]] and [[Spring Boot]].";

        let links = extract(text);

        assert_eq!(links.len(), 2);
        assert_eq!(&text[links[0].start..links[0].end], "[[Hibernate]]");
        assert_eq!(&text[links[1].start..links[1].end], "[[Spring Boot]]");
        assert_eq!(links[0].target, "Hibernate");
    }

    #[test]
    fn splits_alias_and_heading() {
        let links = extract("[[Note|shown]] [[Note#Part|other]] [[Note#Part]]");

        assert_eq!(links[0].alias.as_deref(), Some("shown"));
        assert_eq!(links[0].heading, None);
        assert_eq!(links[1].target, "Note");
        assert_eq!(links[1].heading.as_deref(), Some("Part"));
        assert_eq!(links[1].alias.as_deref(), Some("other"));
        assert_eq!(links[2].alias, None);
    }

    #[test]
    fn trims_whitespace_and_ignores_empty_targets() {
        assert_eq!(targets("[[  Padded  ]]"), ["Padded"]);
        assert!(targets("[[]] [[   ]] [[|alias]] [[#heading]]").is_empty());
    }

    #[test]
    fn empty_alias_or_heading_counts_as_absent() {
        let links = extract("[[Note|]] [[Note#]]");

        assert_eq!(links[0].alias, None);
        assert_eq!(links[1].heading, None);
    }

    #[test]
    fn ignores_links_in_fenced_code_blocks() {
        let text = "[[Before]]\n```\n[[Inside]]\n```\n[[After]]\n~~~\n[[Tilde]]\n~~~\n";

        assert_eq!(targets(text), ["Before", "After"]);
    }

    #[test]
    fn ignores_links_in_inline_code() {
        let text = "Real [[One]] but `[[Two]]` is code, and [[Three]] again.";

        assert_eq!(targets(text), ["One", "Three"]);
    }

    #[test]
    fn ignores_embeds() {
        assert_eq!(targets("![[image.png]] and [[Note]]"), ["Note"]);
    }

    #[test]
    fn a_link_never_spans_lines_and_unclosed_brackets_are_ignored() {
        assert!(targets("[[broken\nlink]]").is_empty());
        assert!(targets("an [[unclosed link").is_empty());
        assert_eq!(targets("[single] [[Real]] ]]"), ["Real"]);
    }

    #[test]
    fn nested_openers_do_not_swallow_the_inner_link() {
        assert_eq!(targets("[[outer [[Inner]]"), ["Inner"]);
    }

    #[test]
    fn handles_non_ascii_text_around_and_inside_links() {
        let text = "Veja [[Ação Rápida]] — e também [[日本語|nihongo]].";

        let links = extract(text);

        assert_eq!(links[0].target, "Ação Rápida");
        assert_eq!(&text[links[1].start..links[1].end], "[[日本語|nihongo]]");
    }

    #[test]
    fn offsets_are_correct_across_lines() {
        let text = "first line\n  second [[Two]]\nthird [[Three]]\n";

        let links = extract(text);

        for link in &links {
            assert!(text[link.start..link.end].starts_with("[["));
            assert!(text[link.start..link.end].ends_with("]]"));
        }
        assert_eq!(links.len(), 2);
    }

    #[test]
    fn title_keys_ignore_case_and_extra_whitespace() {
        assert_eq!(title_key("  Spring   Boot "), title_key("spring boot"));
        assert_ne!(title_key("Spring Boot"), title_key("SpringBoot"));
    }

    #[test]
    fn retarget_rewrites_matching_links_and_keeps_headings_and_aliases() {
        let text = "See [[old name]], [[Old Name#Part]], [[ OLD  NAME |shown]] and [[Other]].";

        let (output, changed) = retarget(text, "Old Name", "New Name");

        assert_eq!(
            output,
            "See [[New Name]], [[New Name#Part]], [[New Name|shown]] and [[Other]]."
        );
        assert_eq!(changed, 3);
    }

    #[test]
    fn retarget_leaves_code_embeds_and_other_text_untouched() {
        let text = "`[[Old]]`\n```\n[[Old]]\n```\n![[Old]] plain Old text";

        let (output, changed) = retarget(text, "Old", "New");

        assert_eq!(output, text);
        assert_eq!(changed, 0);
    }

    #[test]
    fn retarget_without_matches_returns_the_same_text() {
        let (output, changed) = retarget("no links here", "Old", "New");

        assert_eq!((output.as_str(), changed), ("no links here", 0));
    }

    #[test]
    fn retarget_works_with_non_ascii_names() {
        let (output, changed) = retarget("[[Ação]] e [[ação|x]]", "ação", "Reação");

        assert_eq!(output, "[[Reação]] e [[Reação|x]]");
        assert_eq!(changed, 2);
    }

    #[test]
    fn render_builds_every_shape() {
        assert_eq!(render("A", None, None), "[[A]]");
        assert_eq!(render("A", Some("H"), None), "[[A#H]]");
        assert_eq!(render("A", None, Some("x")), "[[A|x]]");
        assert_eq!(render("A", Some("H"), Some("x")), "[[A#H|x]]");
    }
}
