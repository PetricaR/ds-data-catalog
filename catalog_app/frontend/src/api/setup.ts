import client from './client'

export interface SetupStatus {
  database_connected: boolean
  oauth_configured: boolean
  redirect_uri: string
  bq_sources_count: number
  has_data: boolean
  gemini_configured: boolean
  gchat_configured: boolean
  admin_configured: boolean
  team_access_configured: boolean
  is_fresh_install: boolean
}

export const setupApi = {
  // Public — works before anyone has signed in
  status: () =>
    client.get<SetupStatus>('/setup/status').then((r) => r.data),
}
