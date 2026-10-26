use std::env;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};

use crate::error::{AppError, AppResult};
use crate::git::hide_console;

/// Finds `program` in `path_var`, trying each extension before the bare name
/// (VS Code ships both an extensionless shell script and `code.cmd`).
pub fn resolve_executable(program: &str, path_var: &str, exts: &[&str]) -> Option<PathBuf> {
    let mut names: Vec<String> = Vec::new();
    if Path::new(program).extension().is_none() {
        names.extend(exts.iter().map(|e| format!("{program}{e}")));
    }
    names.push(program.to_string());

    let program_path = Path::new(program);
    if program_path.is_absolute() {
        return names.into_iter().map(PathBuf::from).find(|p| p.is_file());
    }
    env::split_paths(path_var)
        .flat_map(|dir| names.iter().map(move |n| dir.join(n)))
        .find(|p| p.is_file())
}

/// Starts the editor directly, never through `cmd /C`, so shell metacharacters in
/// `targets` are passed as data. Rust escapes `.cmd`/`.bat` arguments itself and
/// refuses arguments it cannot escape safely.
pub fn launch(executable: &Path, targets: &[&str]) -> AppResult<Child> {
    let mut cmd = Command::new(executable);
    cmd.args(targets);
    hide_console(&mut cmd);
    cmd.spawn()
        .map_err(|e| AppError::Invalid(format!("could not launch '{}': {e}", executable.display())))
}

/// Shows `folder` in Windows Explorer.
pub fn reveal_folder(folder: &str) -> AppResult<()> {
    if !Path::new(folder).is_dir() {
        return Err(AppError::Invalid(format!("folder not found: {folder}")));
    }
    // Explorer only accepts backslashes; it is started directly, so the path is passed as data.
    Command::new("explorer")
        .arg(folder.replace('/', "\\"))
        .spawn()
        .map_err(|e| AppError::Invalid(format!("could not open Explorer: {e}")))?;
    Ok(())
}

/// Opens `folder` and then `files` inside it (VS Code opens the folder as the
/// workspace and the files as tabs).
pub fn open(editor: &str, folder: &str, files: &[String]) -> AppResult<()> {
    let pathext = env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
    let exts: Vec<&str> = pathext.split(';').filter(|e| !e.is_empty()).collect();
    let path_var = env::var("PATH").unwrap_or_default();
    let executable = resolve_executable(editor, &path_var, &exts)
        .ok_or_else(|| AppError::Invalid(format!("editor '{editor}' was not found in PATH")))?;
    let paths: Vec<String> = files
        .iter()
        .map(|f| Path::new(folder).join(f).to_string_lossy().into_owned())
        .collect();
    let mut targets = vec![folder];
    targets.extend(paths.iter().map(String::as_str));
    launch(&executable, &targets)?;
    Ok(())
}
