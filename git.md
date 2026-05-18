# Git Sync Workflow Reference

This reference guide documents the process of syncing your active development branch (e.g., `sign-up-flow`) with the latest updates from the `main` branch.

---

## 🚀 The 4-Step Update Workflow

To bring the latest features, fixes, and updates from the remote `main` branch into your active branch, run the following commands sequentially:

### 1. Switch to the `main` branch
First, navigate to your local `main` branch to prepare for the update:
```bash
git checkout main
```

### 2. Pull the latest remote updates
Fetch and pull all the latest commits from the remote repository (`origin/main`) into your local `main` branch:
```bash
git pull
```

### 3. Switch back to your active branch
Navigate back to your development branch (e.g., `sign-up-flow`):
```bash
git checkout sign-up-flow
```

### 4. Merge the updated `main` branch
Merge the local `main` branch (which now has all the latest remote changes) into your active branch:
```bash
git merge main
```

---

## 🔍 Handy Inspection Commands

Here are some helpful commands to check the status of your branches and commits:

*   **Check the last commit on local `main`:**
    ```bash
    git log -n 1 main
    ```
*   **Check the last commit on remote `main` (requires fetch first):**
    ```bash
    git fetch origin main
    git log -n 1 origin/main
    ```
*   **Check the status of your current working directory:**
    ```bash
    git status
    ```
