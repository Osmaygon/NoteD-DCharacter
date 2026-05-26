# Product Rules

Always check this file before adding features.

## Global priorities

- Login screen appears first.
- Sign in is primary, create account is secondary.
- Password recovery must send email and open a dedicated reset-password page.
- UI theme uses dark base with gold accents.
- Keep layout comfortable and mobile-friendly.

## Current auth decisions

- Auth provider: Supabase Email/Password.
- Recovery redirect path: `/reset-password`.
- Do not require Google login for now.
