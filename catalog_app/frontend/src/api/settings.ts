import client from './client'

// Where a setting comes from: an environment variable wins and can't be changed in the app
export type SettingSource = 'environment' | 'database' | null

export interface SettingState {
  // Null for secrets (webhook URL, API key): the API only says whether they are set
  value: string | null
  configured: boolean
  source: SettingSource
}

export interface AppSettings {
  allowed_email_domains: SettingState
  allowed_emails: SettingState
  default_role: SettingState
  google_chat_webhook_url: SettingState
  gemini_api_key: SettingState
  // ADMIN_EMAILS, from the environment only
  admin_emails: string[]
}

// Fields left out stay as they are; an empty string removes a setting
export interface AppSettingsUpdate {
  allowed_email_domains?: string
  allowed_emails?: string
  default_role?: 'viewer' | 'editor'
  google_chat_webhook_url?: string
  gemini_api_key?: string
}

export const settingsApi = {
  get: () => client.get<AppSettings>('/settings').then((r) => r.data),

  update: (body: AppSettingsUpdate) => client.put<AppSettings>('/settings', body).then((r) => r.data),

  testGoogleChat: () => client.post<{ sent: boolean }>('/settings/google-chat/test').then((r) => r.data),
}
