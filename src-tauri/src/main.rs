#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Err(error) = orbit_lib::run() {
        eprintln!("failed to run ORBIT: {error}");
        std::process::exit(1);
    }
}
