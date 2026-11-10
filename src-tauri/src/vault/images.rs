#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageKind {
    Png,
    Jpeg,
    Gif,
    Webp,
    Bmp,
}

impl ImageKind {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::Gif => "gif",
            Self::Webp => "webp",
            Self::Bmp => "bmp",
        }
    }

    pub fn mime_type(self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Jpeg => "image/jpeg",
            Self::Gif => "image/gif",
            Self::Webp => "image/webp",
            Self::Bmp => "image/bmp",
        }
    }

    pub fn from_extension(extension: &str) -> Option<Self> {
        match extension.to_lowercase().as_str() {
            "png" => Some(Self::Png),
            "jpg" | "jpeg" => Some(Self::Jpeg),
            "gif" => Some(Self::Gif),
            "webp" => Some(Self::Webp),
            "bmp" => Some(Self::Bmp),
            _ => None,
        }
    }
}

pub fn detect(bytes: &[u8]) -> Option<ImageKind> {
    let is_png = bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);
    let is_jpeg = bytes.starts_with(&[0xFF, 0xD8, 0xFF]);
    let is_gif = bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a");
    let is_webp = bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP";
    let is_bmp = bytes.starts_with(b"BM") && bytes.len() >= 14;
    match (is_png, is_jpeg, is_gif, is_webp, is_bmp) {
        (true, ..) => Some(ImageKind::Png),
        (_, true, ..) => Some(ImageKind::Jpeg),
        (_, _, true, ..) => Some(ImageKind::Gif),
        (_, _, _, true, _) => Some(ImageKind::Webp),
        (_, _, _, _, true) => Some(ImageKind::Bmp),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];

    #[test]
    fn every_supported_format_is_recognized_by_its_signature() {
        assert_eq!(detect(PNG), Some(ImageKind::Png));
        assert_eq!(
            detect(&[0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10]),
            Some(ImageKind::Jpeg)
        );
        assert_eq!(detect(b"GIF89a\x01\x00"), Some(ImageKind::Gif));
        assert_eq!(detect(b"GIF87a\x01\x00"), Some(ImageKind::Gif));
        assert_eq!(
            detect(b"RIFF\x24\x00\x00\x00WEBPVP8 "),
            Some(ImageKind::Webp)
        );
        assert_eq!(
            detect(b"BM\x36\x00\x00\x00\x00\x00\x00\x00\x36\x00\x00\x00"),
            Some(ImageKind::Bmp)
        );
    }

    #[test]
    fn other_content_is_not_an_image_whatever_it_claims_to_be() {
        assert_eq!(detect(b""), None);
        assert_eq!(
            detect(b"<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"),
            None
        );
        assert_eq!(detect(b"<html><script>alert(1)</script></html>"), None);
        assert_eq!(detect(b"MZ\x90\x00 an executable"), None);
        assert_eq!(detect(b"plain text pretending to be a png"), None);
        assert_eq!(detect(b"RIFF\x24\x00\x00\x00WAVEfmt "), None);
        assert_eq!(detect(b"BM"), None, "too short to be a bitmap");
        assert_eq!(
            detect(&[0x89, b'P', b'N', b'G']),
            None,
            "truncated png signature"
        );
    }

    #[test]
    fn extensions_and_mime_types_are_consistent_per_kind() {
        for (kind, extension, mime) in [
            (ImageKind::Png, "png", "image/png"),
            (ImageKind::Jpeg, "jpg", "image/jpeg"),
            (ImageKind::Gif, "gif", "image/gif"),
            (ImageKind::Webp, "webp", "image/webp"),
            (ImageKind::Bmp, "bmp", "image/bmp"),
        ] {
            assert_eq!(kind.extension(), extension);
            assert_eq!(kind.mime_type(), mime);
            assert_eq!(ImageKind::from_extension(extension), Some(kind));
        }
    }

    #[test]
    fn from_extension_ignores_case_accepts_jpeg_and_rejects_everything_else() {
        assert_eq!(ImageKind::from_extension("JPEG"), Some(ImageKind::Jpeg));
        assert_eq!(ImageKind::from_extension("PNG"), Some(ImageKind::Png));
        for other in ["svg", "html", "exe", "txt", "md", ""] {
            assert_eq!(ImageKind::from_extension(other), None, "{other:?}");
        }
    }
}
