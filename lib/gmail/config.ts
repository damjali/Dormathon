// Central config for the averisbot@gmail.com IMAP integration.
// Connects with an app password — no OAuth consent screen, no Google Cloud
// project, nothing for anyone to "log in" to at runtime. See context.md for
// the one-time setup (enable 2-Step Verification, generate an app password).

export const GMAIL_BOT_EMAIL = process.env.GMAIL_BOT_EMAIL ?? "averisbot@gmail.com"

export const GMAIL_IMAP_HOST = "imap.gmail.com"
export const GMAIL_IMAP_PORT = 993

export function getImapCredentials() {
  const password = process.env.GMAIL_APP_PASSWORD

  if (!password) {
    throw new Error(
      "GMAIL_APP_PASSWORD is not set. Generate a Gmail app password for " +
        `${GMAIL_BOT_EMAIL} (Google Account -> Security -> 2-Step Verification -> App passwords) ` +
        "and add it to your environment (see context.md)."
    )
  }

  return { user: GMAIL_BOT_EMAIL, pass: password }
}
