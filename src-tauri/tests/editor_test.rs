use std::fs;
use std::time::{Duration, Instant};

use cherrypick_masive_lib::editor::{launch, resolve_executable};

const EXTS: [&str; 2] = [".EXE", ".CMD"];

#[test]
fn resolves_extension_before_bare_name_and_absolute_paths() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("code"), "#!/bin/sh").unwrap();
    fs::write(dir.path().join("code.CMD"), "@echo off").unwrap();
    let path_var = dir.path().to_string_lossy().into_owned();

    let found = resolve_executable("code", &path_var, &EXTS).unwrap();
    assert_eq!(found, dir.path().join("code.CMD"));

    let absolute = dir.path().join("code.CMD");
    assert_eq!(resolve_executable(absolute.to_str().unwrap(), "", &EXTS).unwrap(), absolute);
    assert!(resolve_executable("missing-editor", &path_var, &EXTS).is_none());
}

#[cfg(windows)]
#[test]
fn shell_metacharacters_in_target_are_not_executed() {
    let dir = tempfile::tempdir().unwrap();
    let script = dir.path().join("editor.cmd");
    // The fake editor only records that it ran; it ignores its argument.
    fs::write(&script, "@echo off\r\necho ran> \"%~dp0ran.txt\"\r\n").unwrap();
    let injected = dir.path().join("pwned.txt");
    // No whitespace, so nothing forces quoting: the dangerous case for `cmd /C`.
    let target = format!("C:\\repo\\R&D&type<nul>{}", injected.display());
    assert!(!target.contains(' '), "temp dir must not contain spaces: {target}");

    match launch(&script, &[&target]) {
        Ok(mut child) => {
            child.wait().unwrap();
            let deadline = Instant::now() + Duration::from_secs(5);
            while !dir.path().join("ran.txt").exists() && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(50));
            }
            assert!(dir.path().join("ran.txt").exists(), "editor did not run");
        }
        // Rust refuses arguments it cannot escape for batch files; that is also safe.
        Err(e) => assert!(e.to_string().contains("could not launch"), "{e}"),
    }
    assert!(!injected.exists(), "metacharacters in the target were executed");
}

#[cfg(windows)]
#[test]
fn opens_the_folder_and_then_each_file_inside_it() {
    use cherrypick_masive_lib::editor::open;
    let dir = tempfile::tempdir().unwrap();
    let script = dir.path().join("editor.cmd");
    fs::write(&script, "@echo off\r\necho %*> \"%~dp0args.txt\"\r\n").unwrap();
    let folder = dir.path().join("wt");
    let folder = folder.to_str().unwrap();

    open(script.to_str().unwrap(), folder, &["src/a.txt".into()]).unwrap();

    let out = dir.path().join("args.txt");
    let deadline = Instant::now() + Duration::from_secs(5);
    while !out.exists() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(50));
    }
    std::thread::sleep(Duration::from_millis(100));
    let args = fs::read_to_string(out).unwrap();
    let file = std::path::Path::new(folder).join("src/a.txt");
    assert_eq!(args.trim(), format!("{folder} {}", file.display()));
}
