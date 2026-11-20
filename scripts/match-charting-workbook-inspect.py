#!/usr/bin/env python3
"""Extract only the MatchChart workbook's instruction text for schema research.

The source workbook is downloaded into an ephemeral CI runner. It is never
committed or retained as a workflow artifact. The extracted text artifact is
short-lived and carries the source attribution/license notice.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from openpyxl import load_workbook

SOURCE_COMMIT = "1813a1309b7ed7ebf1c7e884b32bf675d00e4edf"
ATTRIBUTION = "Jeff Sackmann, Tennis Abstract Match Charting Project"
LICENSE = "CC BY-NC-SA 4.0; non-commercial use only; share-alike"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    workbook = load_workbook(args.workbook, read_only=False, data_only=False, keep_vba=False)
    cached_workbook = load_workbook(args.workbook, read_only=False, data_only=True, keep_vba=False)
    lines = [
        f"Source: {ATTRIBUTION}",
        f"Source commit: {SOURCE_COMMIT}",
        f"License: {LICENSE}",
        "Research extraction only. Do not use commercially without separate permission.",
        "",
        "WORKBOOK SHEETS",
    ]
    for sheet in workbook.worksheets:
        lines.append(f"- {sheet.title}: {sheet.max_row} rows x {sheet.max_column} columns")

    target_names = {"instructions", "matchstats", "tables", "match", "points"}
    target_sheets = [sheet for sheet in workbook.worksheets if sheet.title.lower() in target_names]
    if "instructions" not in {sheet.title.lower() for sheet in target_sheets}:
        raise SystemExit("No Instructions sheet found; available sheets: " + ", ".join(workbook.sheetnames))

    for sheet in target_sheets:
        cached_sheet = cached_workbook[sheet.title]
        lines.extend(["", f"CODEBOOK SHEET: {sheet.title}"])
        for row_index, row in enumerate(sheet.iter_rows(max_row=18 if sheet.title.lower() in {"match", "points"} else sheet.max_row), start=1):
            values = []
            for cell in row:
                value = cell.value
                cached_value = cached_sheet[cell.coordinate].value
                if value is None and cached_value is None:
                    continue
                if isinstance(value, str) and value.startswith("="):
                    rendered = f"{cell.coordinate}: {value}"
                    if cached_value is not None:
                        rendered += f" [cached={cached_value}]"
                else:
                    rendered = f"{cell.coordinate}: {value}"
                values.append(rendered)
            if values:
                lines.append(" | ".join(values))

    args.out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Extracted {len(target_sheets)} instruction sheet(s) to {args.out}")


if __name__ == "__main__":
    main()
