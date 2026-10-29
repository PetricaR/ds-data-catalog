import client from './client'

export interface SetupStatus {
  database_connected: boolean
  oauth_configured: boolean
  // Where the OAuth client comes from; the wizard can only change one it stored itself
  oauth_source: 'environment' | 'database' | null
  // Google's reason for rejecting the configured client at the last check (e.g. it was deleted)
  oauth_client_error: string | null
  redirect_uri: string
  bq_sources_count: number
  has_data: boolean
  gemini_configured: boolean
  gchat_configured: boolean
  admin_configured: boolean
  team_access_configured: boolean
  is_fresh_install: boolean
  // LOCAL_MODE: sign-in without Google, for development on the developer's machine
  local_mode: boolean
}

export interface OAuthClientInput {
  client_id: string
  client_secret: string
}

export const setupApi = {
  // Public — works before anyone has signed in
  status: () =>
    client.get<SetupStatus>('/setup/status').then((r) => r.data),

  // Admin, or anyone with the setup token from the backend log (before anyone can sign in)
  saveOAuthClient: (input: OAuthClientInput, setupToken?: string) =>
    client.put('/setup/oauth', input, setupToken ? { headers: { 'X-Setup-Token': setupToken } } : undefined),

  // Admin: a fictional company's datasets, into an empty catalog only
  loadDemoData: () =>
    client.post<{ project_id: string; datasets: number }>('/setup/demo-data').then((r) => r.data),
}
