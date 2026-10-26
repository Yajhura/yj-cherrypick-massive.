use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("git is not installed or not in PATH: {0}")]
    GitMissing(String),
    #[error("git {args} failed: {stderr}")]
    Git { args: String, stderr: String },
    #[error("{0}")]
    Invalid(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("serialization error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("export error: {0}")]
    Export(String),
}

pub type AppResult<T> = Result<T, AppError>;

// Tauri commands return errors to the UI as plain messages.
impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
