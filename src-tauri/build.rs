use std::error::Error;

const COMMON_CONTROLS_DEPENDENCY: &str = "/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'";

fn is_msvc_target() -> bool {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    let is_windows = target_os == "windows";
    let is_msvc = target_env == "msvc";
    is_windows && is_msvc
}

fn embed_manifest_in_every_target() {
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg={COMMON_CONTROLS_DEPENDENCY}");
}

fn tauri_attributes(has_own_manifest: bool) -> tauri_build::Attributes {
    let attributes = tauri_build::Attributes::new();
    if has_own_manifest {
        let windows_attributes = tauri_build::WindowsAttributes::new_without_app_manifest();
        return attributes.windows_attributes(windows_attributes);
    }
    attributes
}

fn main() -> Result<(), Box<dyn Error>> {
    let should_embed_own_manifest = is_msvc_target();
    if should_embed_own_manifest {
        embed_manifest_in_every_target();
    }
    tauri_build::try_build(tauri_attributes(should_embed_own_manifest))?;
    Ok(())
}
