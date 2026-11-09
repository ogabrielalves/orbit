/// Title of a note: its first level-1 heading (`# Title`) outside code fences, or `fallback`
/// (normally the file name without extension) when there is none.
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
}
