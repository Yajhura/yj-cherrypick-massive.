use std::path::Path;

use rust_xlsxwriter::{Format, Workbook, XlsxError};
use serde::Deserialize;

use crate::commits::Commit;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Csv,
    Markdown,
    Xlsx,
}

const HEADERS: [&str; 7] = ["Hash", "Date", "Author", "Email", "Subject", "Tickets", "Merge"];

fn row(c: &Commit) -> [String; 7] {
    [
        c.hash.clone(),
        c.date.clone(),
        c.author_name.clone(),
        c.author_email.clone(),
        c.subject.clone(),
        c.tickets.join(", "),
        if c.is_merge { "yes".into() } else { "no".into() },
    ]
}

pub fn to_csv(commits: &[Commit]) -> AppResult<String> {
    let mut writer = csv::Writer::from_writer(Vec::new());
    let err = |e: csv::Error| AppError::Export(e.to_string());
    writer.write_record(HEADERS).map_err(err)?;
    for c in commits {
        writer.write_record(row(c)).map_err(err)?;
    }
    let bytes = writer.into_inner().map_err(|e| AppError::Export(e.to_string()))?;
    // BOM so Excel opens the file as UTF-8.
    Ok(format!("\u{FEFF}{}", String::from_utf8_lossy(&bytes)))
}

fn md_cell(value: &str) -> String {
    value.replace('\\', "\\\\").replace('|', "\\|").replace(['\r', '\n'], " ")
}

pub fn to_markdown(commits: &[Commit]) -> String {
    let mut out = format!("| {} |\n|{}\n", HEADERS.join(" | "), "---|".repeat(HEADERS.len()));
    for c in commits {
        let mut cells = row(c);
        cells[0] = c.short_hash.clone();
        let cells: Vec<String> = cells.iter().map(|v| md_cell(v)).collect();
        out.push_str(&format!("| {} |\n", cells.join(" | ")));
    }
    out
}

pub fn write_xlsx(commits: &[Commit], path: &Path) -> AppResult<()> {
    let err = |e: XlsxError| AppError::Export(e.to_string());
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    sheet.set_name("History").map_err(err)?;
    let bold = Format::new().set_bold();
    for (col, header) in HEADERS.iter().enumerate() {
        sheet.write_string_with_format(0, col as u16, *header, &bold).map_err(err)?;
    }
    for (i, c) in commits.iter().enumerate() {
        for (col, value) in row(c).iter().enumerate() {
            sheet.write_string(i as u32 + 1, col as u16, value).map_err(err)?;
        }
    }
    for (col, width) in [42, 26, 24, 30, 70, 20, 8].into_iter().enumerate() {
        sheet.set_column_width(col as u16, width).map_err(err)?;
    }
    sheet.set_freeze_panes(1, 0).map_err(err)?;
    sheet
        .autofilter(0, 0, commits.len() as u32, HEADERS.len() as u16 - 1)
        .map_err(err)?;
    workbook.save(path).map_err(err)?;
    Ok(())
}

pub fn export(commits: &[Commit], format: ExportFormat, path: &Path) -> AppResult<()> {
    match format {
        ExportFormat::Csv => std::fs::write(path, to_csv(commits)?)?,
        ExportFormat::Markdown => std::fs::write(path, to_markdown(commits))?,
        ExportFormat::Xlsx => write_xlsx(commits, path)?,
    }
    Ok(())
}
