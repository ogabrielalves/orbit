use crate::error::{AppError, AppResult};

const DIGITS: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE: usize = DIGITS.len();
const ZERO_DIGIT: u8 = DIGITS[0];

pub fn first() -> String {
    to_text(midpoint(&[], None))
}

pub fn after(position: &str) -> AppResult<String> {
    validate(position)?;
    Ok(to_text(midpoint(position.as_bytes(), None)))
}

pub fn before(position: &str) -> AppResult<String> {
    validate(position)?;
    Ok(to_text(midpoint(&[], Some(position.as_bytes()))))
}

pub fn between(lower: &str, upper: &str) -> AppResult<String> {
    validate(lower)?;
    validate(upper)?;
    let is_ordered = lower < upper;
    if !is_ordered {
        return Err(AppError::Validation(
            "lower position must sort before upper position".into(),
        ));
    }
    Ok(to_text(midpoint(lower.as_bytes(), Some(upper.as_bytes()))))
}

fn validate(position: &str) -> AppResult<()> {
    let bytes = position.as_bytes();
    let is_empty = bytes.is_empty();
    let has_invalid_digit = bytes.iter().any(|byte| !DIGITS.contains(byte));
    let has_trailing_zero = bytes.last() == Some(&ZERO_DIGIT);
    let is_invalid = is_empty || has_invalid_digit || has_trailing_zero;
    if is_invalid {
        return Err(AppError::Validation(format!(
            "invalid position '{position}'"
        )));
    }
    Ok(())
}

fn to_text(bytes: Vec<u8>) -> String {
    bytes.into_iter().map(char::from).collect()
}

fn digit_value(byte: &u8) -> usize {
    DIGITS.iter().position(|digit| digit == byte).unwrap_or(0)
}

fn shared_prefix_length(lower: &[u8], upper: &[u8]) -> usize {
    (0..upper.len())
        .take_while(|&index| lower.get(index).copied().unwrap_or(ZERO_DIGIT) == upper[index])
        .count()
}

fn midpoint(lower: &[u8], upper: Option<&[u8]>) -> Vec<u8> {
    if let Some(upper) = upper {
        let prefix_length = shared_prefix_length(lower, upper);
        let has_shared_prefix = prefix_length > 0;
        if has_shared_prefix {
            let lower_rest = lower.get(prefix_length..).unwrap_or(&[]);
            let mut result = upper[..prefix_length].to_vec();
            result.extend(midpoint(lower_rest, Some(&upper[prefix_length..])));
            return result;
        }
    }

    let lower_digit = lower.first().map_or(0, digit_value);
    let upper_digit = upper
        .and_then(|bytes| bytes.first())
        .map_or(BASE, digit_value);

    let has_room_between = upper_digit - lower_digit > 1;
    if has_room_between {
        let middle_digit = (lower_digit + upper_digit).div_ceil(2);
        return vec![DIGITS[middle_digit]];
    }

    if let Some(upper) = upper {
        let upper_has_more_digits = upper.len() > 1;
        if upper_has_more_digits {
            return vec![upper[0]];
        }
    }

    let mut result = vec![DIGITS[lower_digit]];
    result.extend(midpoint(lower.get(1..).unwrap_or(&[]), None));
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sorted_copy(positions: &[String]) -> Vec<String> {
        let mut copy = positions.to_vec();
        copy.sort();
        copy
    }

    fn has_no_duplicates(positions: &[String]) -> bool {
        let mut unique = positions.to_vec();
        unique.sort();
        unique.dedup();
        unique.len() == positions.len()
    }

    #[test]
    fn first_position_is_valid() {
        assert!(validate(&first()).is_ok());
    }

    #[test]
    fn after_sorts_after_the_given_position() {
        let position = first();

        let next = after(&position).expect("after works");

        assert!(next > position);
    }

    #[test]
    fn before_sorts_before_the_given_position() {
        let position = first();

        let previous = before(&position).expect("before works");

        assert!(previous < position);
    }

    #[test]
    fn between_sorts_strictly_between_neighbors() {
        let middle = between("a", "b").expect("between works");

        assert!("a" < middle.as_str());
        assert!(middle.as_str() < "b");
    }

    #[test]
    fn between_adjacent_digits_extends_the_key() {
        let middle = between("V", "W").expect("between works");

        assert!("V" < middle.as_str());
        assert!(middle.as_str() < "W");
        assert!(middle.len() > 1);
    }

    #[test]
    fn repeated_after_keeps_order() {
        let mut positions = vec![first()];
        for _ in 0..500 {
            let last = positions.last().expect("not empty");
            let next = after(last).expect("after works");
            positions.push(next);
        }

        assert_eq!(positions, sorted_copy(&positions));
        assert!(has_no_duplicates(&positions));
    }

    #[test]
    fn repeated_before_keeps_order() {
        let mut positions = vec![first()];
        for _ in 0..500 {
            let head = positions.first().expect("not empty");
            let previous = before(head).expect("before works");
            positions.insert(0, previous);
        }

        assert_eq!(positions, sorted_copy(&positions));
        assert!(has_no_duplicates(&positions));
    }

    #[test]
    fn repeated_insert_at_same_spot_keeps_order_and_uniqueness() {
        let head = first();
        let tail = after(&head).expect("after works");
        let mut positions = vec![head, tail];
        for _ in 0..200 {
            let middle = between(&positions[0], &positions[1]).expect("between works");
            positions.insert(1, middle);
        }

        assert_eq!(positions, sorted_copy(&positions));
        assert!(has_no_duplicates(&positions));
    }

    #[test]
    fn random_insertions_keep_order() {
        let mut seed: u64 = 42;
        let mut next_random = move |limit: usize| {
            seed = seed
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            ((seed >> 33) as usize) % limit
        };
        let mut positions = vec![first()];
        for _ in 0..1000 {
            let slot = next_random(positions.len() + 1);
            let is_head = slot == 0;
            let is_tail = slot == positions.len();
            let created = if is_head {
                before(&positions[0])
            } else if is_tail {
                after(&positions[slot - 1])
            } else {
                between(&positions[slot - 1], &positions[slot])
            };
            positions.insert(slot, created.expect("insertion works"));
        }

        assert_eq!(positions, sorted_copy(&positions));
        assert!(has_no_duplicates(&positions));
    }

    #[test]
    fn rejects_unordered_bounds() {
        assert!(between("b", "a").is_err());
        assert!(between("a", "a").is_err());
    }

    #[test]
    fn rejects_invalid_positions() {
        assert!(after("").is_err());
        assert!(after("a0").is_err());
        assert!(after("a-b").is_err());
        assert!(before("").is_err());
    }
}
