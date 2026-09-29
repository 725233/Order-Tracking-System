# Publish this portfolio project to GitHub

This package is intentionally separate from the live internal system and contains fictional demo data only.

## Recommended: GitHub Desktop

1. Extract the ZIP to a permanent folder on your computer.
2. Sign in to [GitHub Desktop](https://desktop.github.com/) with your personal GitHub account.
3. Choose **File → Add local repository** and select the extracted `order-workflow-platform` folder.
4. If GitHub Desktop says the folder is not a Git repository, choose **Create a repository** for that folder.
5. Use this commit message: `Initial portfolio release`.
6. Click **Publish repository**.
7. Name it `order-workflow-platform`, add the description below, and clear **Keep this code private** when you are ready for it to be public.

Suggested description:

> Full-stack, role-based order workflow platform with item-level procurement, approvals, payments, logistics, reporting, and Gemini-assisted document extraction.

## Command-line alternative

Run these commands from inside the extracted folder after installing GitHub CLI:

```bash
git init
git add .
git commit -m "Initial portfolio release"
gh repo create order-workflow-platform --public --source=. --push
```

## Before sharing it

- Keep `.env.local` and every real credential out of GitHub.
- Do not copy production deployment files, customer documents, or database exports into this repository.
- Pin the repository on your GitHub profile and link directly to `PORTFOLIO_CASE_STUDY.md` from your portfolio.

Official guidance: [Adding locally hosted code to GitHub](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github) and [publishing an existing project with GitHub Desktop](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-an-existing-project-to-github-using-github-desktop).
