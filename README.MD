# File Organizer

A command-line interface (CLI) application built with Node.js for scanning directories, finding duplicate files, organizing files into categories, and identifying old files for cleanup.

## Table of Contents

- [Features](#features)
- [Technologies](#technologies)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [Commands](#commands)
  - [Help](#1-help)
  - [Scan](#2-scan)
  - [Duplicates](#3-duplicates)
  - [Organize](#4-organize)
  - [Cleanup](#5-cleanup)
- [Error Handling](#error-handling)
- [Safety Notes](#safety-notes)

## Features

- **Directory scanning:** Collects file information and generates a statistical report.
- **Duplicate detection:** Identifies identical files using file sizes and SHA-256 hashes.
- **File organization:** Copies files into category-based directories.
- **File cleanup:** Finds files that have not been modified within a specified number of days.
- **Progress indicators:** Displays progress during long-running operations.
- **Error handling:** Reports missing files, permission issues, and other filesystem errors.

## Technologies

- Node.js
- JavaScript (ES Modules)
- Built-in Node.js modules: `fs`, `path`, `crypto`, `events`, and `stream`
- npm for running project commands

No external npm dependencies are required for the core functionality.

## Project Structure

```text
file-organizer/
├── file-organizer.js
├── package.json
├── README.md
├── lib/
│   ├── scanner.js
│   ├── duplicates.js
│   ├── organizer.js
│   └── cleanup.js
└── utils/
    ├── fileWalker.js
    ├── formatSize.js
    └── hash.js
```

### File Descriptions

| File                  | Description                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `file-organizer.js`   | Main CLI entry point. Parses command-line arguments, runs commands, displays reports, and handles errors. |
| `package.json`        | Contains project metadata and npm scripts.                                                                |
| `lib/scanner.js`      | Scans directories, collects statistics, and generates reports.                                            |
| `lib/duplicates.js`   | Finds duplicate files by comparing file sizes and SHA-256 hashes.                                         |
| `lib/organizer.js`    | Organizes and copies files into category-based directories.                                               |
| `lib/cleanup.js`      | Finds old files and deletes them only when deletion is explicitly confirmed.                              |
| `utils/fileWalker.js` | Recursively traverses directories and collects file information.                                          |
| `utils/formatSize.js` | Formats file sizes into readable units such as KB, MB, and GB.                                            |
| `utils/hash.js`       | Calculates SHA-256 hashes for files.                                                                      |

## Installation

### 1. Install Node.js

Make sure Node.js and npm are installed:

```bash
node -v
npm -v
```

If they are not installed, download Node.js from the [official website](https://nodejs.org/).

### 2. Navigate to the project directory

```bash
cd file-organizer
```

If your terminal is already open in the project directory, you can skip this step.

## Getting Started

### General command syntax

```bash
npm run --silent <script> -- <arguments>
```

- `npm run` executes an npm script.
- `--silent` suppresses npm's usual script-start output.
- `--` passes the following arguments to the Node.js application.

For example:

```bash
npm run --silent scan -- ~/Downloads
```

Alternatively, you can run the application directly:

```bash
node file-organizer.js scan ~/Downloads
```

The examples use `~/Downloads`. On Windows, you can use a path such as `C:/Users/YourName/Downloads`.

## Commands

### 1. Help

Displays the available commands and usage information.

```bash
node file-organizer.js help
```

You can also use:

```bash
npm run --silent start -- --help
```

Available commands:

- `scan` — scans a directory.
- `duplicates` — searches for duplicate files.
- `organize` — organizes files into categories.
- `cleanup` — finds old files and optionally deletes them.

### 2. Scan

Scans a directory recursively and generates a statistical report about its files.

**Syntax:**

```bash
npm run --silent scan -- <directory>
```

**Example:**

```bash
npm run --silent scan -- ~/Downloads
```

Scan report includes:

- Total number of files.
- Total file size.
- File statistics grouped by type.
- File age statistics.
- The largest files.
- The oldest file.

This command is intended for analysis and should not modify files.

### 3. Duplicates

Finds files with identical content. Files are first grouped by size, then SHA-256 hashes are calculated for potential duplicates.

**Syntax:**

```bash
npm run --silent duplicates -- <directory>
```

**Example:**

```bash
npm run --silent duplicates -- ~/Downloads
```

Duplicates report includes:

- Number of duplicate groups.
- File paths for each group.
- SHA-256 hashes.
- Number of copies in each group.
- Size of each file.
- Amount of disk space occupied by extra copies.

Finding duplicates does not automatically delete them. This command is intended to identify and report identical files.

### 4. Organize

Copies files from a source directory into subdirectories based on their categories.

**Syntax:**

```bash
npm run --silent organize -- <source> --output <destination>
```

**Example:**

```bash
npm run --silent organize -- ~/Downloads --output ~/Downloads-organized
```

**Arguments:**

| Argument        | Description                                           |
| --------------- | ----------------------------------------------------- |
| `<source>`      | The directory to scan for files.                      |
| `--output`      | Required option specifying the destination directory. |
| `<destination>` | The directory where files will be copied.             |

Depending on the implementation, files may be organized into categories such as:

- `Documents` — document files.
- `Images` — image files.
- `Archives` — archive files.
- `Code` — source code files.
- `Videos` — video files.
- `Other` — files that do not match another category.

The command copies files rather than moving them, so the original files should remain in the source directory.

For best results, use a destination directory that is outside the source directory.

### 5. Cleanup

Finds files that have not been modified within a specified number of days.

By default, the command runs in **dry-run mode**: it reports matching files without deleting them.

**Syntax:**

```bash
npm run --silent cleanup -- <directory> [--older-than <days>] [--confirm]
```

**Arguments:**

| Argument              | Description                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `<directory>`         | The directory to search for old files.                                                                    |
| `--older-than <days>` | Optional age threshold in days. Defaults to `90`.                                                         |
| `--confirm`           | Enables actual deletion of files matching the criteria. Without this option, files should not be deleted. |

#### Example 1: Preview files older than 90 days

```bash
npm run --silent cleanup -- ~/Downloads
```

Uses the default threshold of 90 days. No files are deleted.

#### Example 2: Preview files older than 30 days

```bash
npm run --silent cleanup -- ~/Downloads --older-than 30
```

Displays files that have not been modified within the last 30 days, without deleting them.

#### Example 3: Preview files older than 7 days

```bash
npm run --silent cleanup -- ~/Downloads --older-than 7
```

Useful for testing the command with a shorter age threshold.

#### Example 4: Delete files older than 180 days

```bash
npm run --silent cleanup -- ~/Downloads --older-than 180 --confirm
```

**Warning:** This command performs actual file deletion. Review the results without `--confirm` first, and make sure you selected the correct directory and age threshold.

## Error Handling

The application handles errors that may occur during filesystem operations.

| Error code | Meaning                                       |
| ---------- | --------------------------------------------- |
| `ENOENT`   | The file or directory was not found.          |
| `EACCES`   | Permission to access the resource was denied. |
| `EPERM`    | The operation is not permitted.               |
| `ENOTDIR`  | The specified path is not a directory.        |
| `EINVAL`   | An invalid argument or path was supplied.     |

When an error occurs, the application displays an error message and exits with a non-zero exit code.

## Safety Notes

- Run `cleanup` without `--confirm` first to review the files that match the criteria.
- Do not use `--confirm` until you have verified the target directory and age threshold.
- Use a separate test directory containing disposable files when testing deletion.
- The `organize` command copies files, so the originals should remain in the source directory.
- The `duplicates` command identifies duplicate files but does not delete them.
