# Security Policy

## Portfolio repository

This repository is a sanitized portfolio edition. Do not add production credentials, customer data, employee data, webhook URLs, deployment identifiers, or private company documents.

## Secret handling

- Store credentials only in the deployment platform's protected environment settings.
- Keep local values in `.env.local`, which is ignored by Git.
- Commit only `.env.example` with empty or fictional values.
- Rotate any credential that is accidentally committed, even if the commit is later removed.

## Reporting a vulnerability

Use the repository's private GitHub Security Advisory feature. Do not disclose a suspected vulnerability in a public issue.

## Deployment review

Before deploying a fork, review authentication headers, allowed email domains, role assignments, database bindings, gateway access controls, webhook endpoints, reminder recipients, and logging behavior for your own environment.
