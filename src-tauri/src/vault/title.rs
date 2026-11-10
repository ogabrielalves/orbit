pub fn title_of(body: &str, fallback: &str) -> String {
    let mut in_fence = false;
    for line in body.lines() {
        let trimmed = line.trim_start();
        let toggles_fence = trimmed.starts_with("```") || trimmed.starts_with("~~~");
        if toggles_fence {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        if let Some(heading) = level_one_heading(line) {
            return heading;
        }
    }
    fallback.trim().to_string()
}

pub fn replace_title(body: &str, old_title: &str, new_title: &str) -> Option<String> {
    let mut in_fence = false;
    let mut offset = 0;
    for line in body.split_inclusive('\n') {
        let line_start = offset;
        offset += line.len();
        let trimmed = line.trim_start();
        let toggles_fence = trimmed.starts_with("```") || trimmed.starts_with("~~~");
        if toggles_fence {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        let Some(heading) = level_one_heading(line.trim_end_matches(['\n', '\r'])) else {
            continue;
        };
        if heading != old_title {
            return None;
        }
        let indent = &line[..line.len() - trimmed.len()];
        let terminator = &line[line.trim_end_matches(['\n', '\r']).len()..];
        let mut output = String::with_capacity(body.len() + new_title.len());
        output.push_str(&body[..line_start]);
        output.push_str(indent);
        output.push_str("# ");
        output.push_str(new_title);
        output.push_str(terminator);
        output.push_str(&body[offset..]);
        return Some(output);
    }
    None
}

fn level_one_heading(line: &str) -> Option<String> {
    let indent = line.len() - line.trim_start_matches(' ').len();
    let is_indented_code = indent >= 4;
    if is_indented_code {
        return None;
    }
    let rest = line.trim_start().strip_prefix('#')?;
    let starts_with_space = rest.starts_with(' ') || rest.starts_with('\t');
    if !starts_with_space {
        return None;
    }
    let text = rest.trim().trim_end_matches('#').trim();
    let has_text = !text.is_empty();
    has_text.then(|| text.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uses_the_first_level_one_heading() {
        assert_eq!(
            title_of("\n# Spring Boot\n\ntext\n# Later\n", "file"),
            "Spring Boot"
        );
    }

    #[test]
    fn falls_back_to_the_file_name_when_there_is_no_heading() {
        assert_eq!(title_of("just text\n", " My Note "), "My Note");
        assert_eq!(title_of("", "Empty"), "Empty");
    }

    #[test]
    fn deeper_headings_and_hashtags_are_not_titles() {
        assert_eq!(title_of("## Second level\n#hashtag\n", "file"), "file");
    }

    #[test]
    fn headings_inside_code_fences_are_ignored() {
        let body = "```\n# not a title\n```\n# Real title\n";

        assert_eq!(title_of(body, "file"), "Real title");
    }

    #[test]
    fn indented_code_is_not_a_heading() {
        assert_eq!(title_of("    # code\n", "file"), "file");
        assert_eq!(
            title_of("   # three spaces ok\n", "file"),
            "three spaces ok"
        );
    }

    #[test]
    fn closing_hashes_and_an_empty_heading_are_handled() {
        assert_eq!(title_of("# Title ##\n", "file"), "Title");
        assert_eq!(title_of("# \n# Next\n", "file"), "Next");
        assert_eq!(title_of("#\n", "file"), "file");
    }

    #[test]
    fn keeps_links_and_unicode_in_the_title() {
        assert_eq!(
            title_of("# Ação com [[Link]]\n", "file"),
            "Ação com [[Link]]"
        );
    }

    #[test]
    fn replace_title_rewrites_the_first_heading_and_keeps_the_rest() {
        let body = "\n# Old name\n\nSee [[Other]].\n# Old name\n";

        let replaced = replace_title(body, "Old name", "New name").expect("replaces");

        assert_eq!(replaced, "\n# New name\n\nSee [[Other]].\n# Old name\n");
    }

    #[test]
    fn replace_title_keeps_indentation_and_crlf_and_drops_closing_hashes() {
        let replaced = replace_title("  # Old ##\r\nbody\r\n", "Old", "New").expect("replaces");

        assert_eq!(replaced, "  # New\r\nbody\r\n");
    }

    #[test]
    fn replace_title_does_nothing_when_the_title_is_not_that_heading() {
        assert_eq!(replace_title("no heading\n", "Old", "New"), None);
        assert_eq!(replace_title("# Something else\n", "Old", "New"), None);
        assert_eq!(replace_title("```\n# Old\n```\n", "Old", "New"), None);
        assert_eq!(replace_title("## Old\n", "Old", "New"), None);
    }

    #[test]
    fn replace_title_handles_a_heading_on_the_last_line_without_a_newline() {
        assert_eq!(
            replace_title("# Old", "Old", "New").as_deref(),
            Some("# New")
        );
    }
}
