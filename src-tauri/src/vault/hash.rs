use sha2::{Digest, Sha256};

pub fn content_hash(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_the_known_sha256_of_an_empty_input_and_of_abc() {
        assert_eq!(
            content_hash(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            content_hash(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn different_content_gives_different_hashes_and_the_same_content_the_same() {
        assert_eq!(content_hash(b"note"), content_hash(b"note"));
        assert_ne!(content_hash(b"note"), content_hash(b"note "));
    }

    #[test]
    fn the_hash_is_64_lowercase_hex_characters() {
        let hash = content_hash("acentuação".as_bytes());

        assert_eq!(hash.len(), 64);
        assert!(
            hash.chars()
                .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
        );
    }
}
